#!/usr/bin/env node
// Setup: creates/updates the tools and the interviewer PAL, attaches the tools,
// and writes TAVUS_PAL_ID into .env. Safe to re-run: if TAVUS_PAL_ID is already set it UPDATES
// that PAL in place (name, system prompt, layers, guardrails, tools), so the dashboard title,
// the prompt identity and the greeting all come from INTERVIEWER_NAME in one place.
//
// Tries the current API first (POST /v2/tools + POST /v2/pals + attach), and falls back to
// the legacy persona endpoint with inline layers.llm.tools if the registry isn't available.
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv, upsertEnv } from "./env.mjs";
import { tavus } from "../shared/tavus-api.mjs";
import { TOOLS } from "../shared/tools.mjs";
import { GUARDRAILS, OBJECTIVES } from "../shared/policies.mjs";

loadEnv();
const interviewerName = process.env.INTERVIEWER_NAME || "Anna";
const systemPrompt = readFileSync(new URL("../shared/system-prompt.txt", import.meta.url), "utf8").replaceAll("{{NAME}}", interviewerName);
const faceId = process.env.TAVUS_FACE_ID || "rc9cff32ceba"; // stock face from the Create PAL docs example
const llmModel = process.env.TAVUS_LLM_MODEL || undefined; // leave unset to use the account default

// Reviewer-only attention signal: Raven watches the candidate's camera and calls a perception
// tool when they look away for a while. Best effort: if the account rejects these fields,
// setup retries with plain Raven so the interview itself never breaks.
const attentionPerception = {
  perception_model: "raven-2",
  perception_tool_prompt: "You watch the candidate's camera for a hiring team. Call flag_attention only when the candidate clearly looks away from their own screen for more than about five seconds (for example toward another monitor, a phone or notes off to the side), or when another person appears. Looking down at the keyboard or around their own screen is normal: do not flag it. Describe only what is visible, in neutral words (e.g. 'looked to the left for ~8 s'). Never infer intent, honesty, emotion or cheating.",
  perception_tools: [{ type: "function", function: { name: "flag_attention", description: "Record a reviewer-only note that the candidate looked away from their screen or someone else appeared.", parameters: { type: "object", properties: { reason: { type: "string", description: "What was visible, neutral and factual, in a few words. No intent, honesty or emotion." } }, required: ["reason"] } } }],
};
const layers = {
  perception: process.env.ATTENTION_SIGNAL === "off" ? { perception_model: "raven-2" } : attentionPerception,
  conversational_flow: { turn_detection_model: "sparrow-2", turn_taking_patience: "high", pal_interruptibility: "medium", idle_engagement: "off" },
  ...(llmModel ? { llm: { model: llmModel } } : {}),
};

// Guardrails + objectives are best-effort: if the account or API rejects them, the interviewer
// still works because the same rules live in the system prompt.
async function existingGuardrails() {
  try {
    const { data } = await tavus("/v2/guardrails");
    const list = Array.isArray(data) ? data : data.data || data.guardrails || [];
    return new Map(list.filter((g) => g?.guardrail_name).map((g) => [g.guardrail_name, g.uuid || g.guardrail_id || g.id]));
  } catch { return new Map(); }
}

async function createPolicies() {
  const out = {};
  try {
    const ids = [];
    const have = await existingGuardrails(); // re-runs reuse guardrails by name instead of piling up copies
    for (const g of GUARDRAILS) {
      let id = have.get(g.guardrail_name);
      if (id) {
        await tavus(`/v2/guardrails/${id}`, { method: "PATCH", body: [{ op: "replace", path: "/guardrail_prompt", value: g.guardrail_prompt }] }).catch(() => {});
      } else {
        const { data } = await tavus("/v2/guardrails", { method: "POST", body: { ...g, tags: ["board-interviewer"] } });
        id = data.uuid || data.guardrail_id || data.id;
      }
      ids.push(id);
      console.log(`  guardrail ${g.guardrail_name} -> ${id}${have.has(g.guardrail_name) ? " (reused)" : ""}`);
    }
    out.guardrail_ids = ids.filter(Boolean);
  } catch (e) { console.warn(`  guardrails skipped: ${e.message}`); }
  if (OBJECTIVES.length) try {
    const { data } = await tavus("/v2/objectives", { method: "POST", body: { data: OBJECTIVES } });
    out.objectives_id = data.objectives_id || data.id;
    console.log(`  objectives -> ${out.objectives_id}`);
  } catch (e) { console.warn(`  objectives skipped: ${e.message}`); }
  return out;
}

async function existingTools() {
  // Re-running setup must not fail on tools created by an earlier run: reuse them by name.
  try {
    const { data } = await tavus("/v2/tools");
    const list = Array.isArray(data) ? data : data.data || data.tools || [];
    return new Map(list.filter((t) => t?.name).map((t) => [t.name, t.tool_id || t.id || t.uuid]));
  } catch (e) {
    console.warn(`  could not list existing tools (${e.message})`);
    return new Map();
  }
}

let policies = {};
async function viaRegistry() {
  policies = await createPolicies();
  const existing = await existingTools();
  const toolIds = [];
  for (const t of TOOLS) {
    const def = { name: t.name, description: t.description, parameters: t.parameters, on_resolve: t.on_resolve, delivery: { app_message: true } };
    let id = existing.get(t.name);
    if (id) {
      await tavus(`/v2/tools/${id}`, { method: "PATCH", body: def }).catch((e) => console.warn(`  could not update ${t.name} (${e.message}); reusing as is`));
      console.log(`  tool ${t.name} -> ${id} (reused)`);
    } else {
      const { data } = await tavus("/v2/tools", { method: "POST", body: def });
      id = data.tool_id || data.id || data.uuid;
      console.log(`  tool ${t.name} -> ${id}`);
    }
    toolIds.push(id);
  }
  const palName = `Board Interviewer (${interviewerName})`;
  const current = process.env.TAVUS_PAL_ID;
  if (current) {
    const fields = { pal_name: palName, system_prompt: systemPrompt, default_face_id: faceId, layers, ...policies };
    // Tavus PATCH endpoints take JSON Patch (RFC 6902); try that first, then a plain merge body.
    const ops = Object.entries(fields).map(([k, v]) => ({ op: "replace", path: `/${k}`, value: v }));
    let updated = false;
    for (const body of [ops, fields]) {
      try { await tavus(`/v2/pals/${current}`, { method: "PATCH", body }); updated = true; break; }
      catch (e) { console.warn(`  update of ${current} failed (${e.message})`); }
    }
    if (updated) {
      await tavus(`/v2/pals/${current}/tools`, { method: "POST", body: { tool_ids: toolIds } });
      console.log(`  PAL ${current} updated in place -> "${palName}"`);
      return current;
    }
    console.warn("  could not update the existing PAL; creating a new one instead");
  }
  const { data: pal } = await tavus("/v2/pals", {
    method: "POST",
    body: { pal_name: `Board Interviewer (${interviewerName})`, system_prompt: systemPrompt, default_face_id: faceId, pipeline_mode: "full", layers, ...policies },
  }).catch(async (e) => {
    if (e.status !== 400 || !Object.keys(policies).length) throw e;
    console.warn(`  PAL rejected guardrails/objectives (${e.message}); creating without them`);
    return tavus("/v2/pals", { method: "POST", body: { pal_name: `Board Interviewer (${interviewerName})`, system_prompt: systemPrompt, default_face_id: faceId, pipeline_mode: "full", layers } });
  });
  const palId = pal.pal_id || pal.persona_id;
  await tavus(`/v2/pals/${palId}/tools`, { method: "POST", body: { tool_ids: toolIds } });
  return palId;
}

async function viaLegacyPersona(policies = {}) {
  const { data } = await tavus("/v2/personas", {
    method: "POST",
    body: {
      persona_name: `Board Interviewer (${interviewerName})`,
      system_prompt: systemPrompt,
      default_replica_id: faceId,
      pipeline_mode: "full",
      layers: {
        ...layers,
        llm: { ...(layers.llm || {}), tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) },
      },
      ...policies,
    },
  });
  return data.persona_id || data.pal_id;
}

let palId;
try {
  console.log(process.env.TAVUS_PAL_ID ? `Updating PAL ${process.env.TAVUS_PAL_ID} as "${interviewerName}" ...` : "Creating tools + PAL via /v2/tools and /v2/pals ...");
  try { palId = await viaRegistry(); }
  catch (e) {
    if (!layers.perception.perception_tools) throw e;
    console.warn(`  attention signal not accepted (${e.message}); retrying with plain Raven perception`);
    layers.perception = { perception_model: "raven-2" };
    palId = await viaRegistry();
  }
} catch (e) {
  console.warn(`Registry path failed (${e.message}). Falling back to legacy /v2/personas with inline tools ...`);
  palId = await viaLegacyPersona(policies);
}
const previous = process.env.TAVUS_PAL_ID;
writeFileSync(".env", upsertEnv("TAVUS_PAL_ID", palId));
console.log(`\nDone. TAVUS_PAL_ID=${palId} written to .env. Now run: npm run dev`);
if (previous && previous !== palId) console.log(`The previous interviewer (${previous}) is no longer used; you can delete it in the Tavus dashboard.`);
