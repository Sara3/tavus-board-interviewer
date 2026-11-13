// Tiny backend: keeps the Tavus API key server-side, creates/ends conversations,
// and stores per-session latency logs used in the product feedback doc.
import express from "express";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { loadEnv } from "./scripts/env.mjs";
import { tavus } from "./shared/tavus-api.mjs";
import { PROMPTS, contextFor, greetingFor } from "./shared/prompts.mjs";
import { scopeOf, scoreRubric } from "./shared/rubric.mjs";
import { mergedRubric } from "./shared/autoscore.mjs";
const scope = () => scopeOf(process.env.INTERVIEW_SCOPE || "screen");

loadEnv();
const dev = process.argv.includes("--dev");
const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/config", (_req, res) => res.json({ interviewer: process.env.INTERVIEWER_NAME || "Anna", company: process.env.COMPANY_NAME || "", minutes: Math.round(Number(process.env.TAVUS_MAX_CALL_SECONDS || 480) / 60), scope: scope().id, scope_label: scope().label }));
app.get("/api/prompts", (_req, res) => res.json(PROMPTS.map(({ id, title, brief }) => ({ id, title, brief }))));

app.post("/api/conversations", async (req, res) => {
  const palId = process.env.TAVUS_PAL_ID;
  if (!palId) return res.status(500).json({ error: "TAVUS_PAL_ID missing. Run `npm run setup` first." });
  // One fixed question by default so runs are comparable (DEFAULT_QUESTION in .env);
  // ?q=<id> pins another, ?q=random picks one at random.
  const wanted = req.body?.promptId && req.body.promptId !== "default" ? req.body.promptId : process.env.DEFAULT_QUESTION || "cancel-winback";
  const surprise = true; // the candidate never picks; the interviewer announces it
  const prompt = wanted === "random" ? PROMPTS[Math.floor(Math.random() * PROMPTS.length)] : PROMPTS.find((p) => p.id === wanted) ?? PROMPTS[0];
  const name = String(req.body?.name || "").trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: "First name is required." });
  const maxSeconds = Number(process.env.TAVUS_MAX_CALL_SECONDS || 480);
  const base = {
    conversation_name: `Board interview: ${prompt.title}`,
    conversational_context: contextFor(prompt, name, maxSeconds),
    custom_greeting: greetingFor(prompt, name, maxSeconds),
    properties: { max_call_duration: maxSeconds, participant_left_timeout: 30 },
  };
  try {
    // Field names moved from personas to PALs; try the current one, then the legacy one,
    // then without the greeting in case the account rejects it.
    const attempts = [{ ...base, pal_id: palId }, { ...base, persona_id: palId }, { ...base, custom_greeting: undefined, persona_id: palId }];
    let out, lastErr;
    for (const body of attempts) {
      try { out = await tavus("/v2/conversations", { method: "POST", body }); break; }
      catch (e) { lastErr = e; if (e.status !== 400) throw e; console.warn(`create conversation 400, retrying: ${e.message}`); }
    }
    if (!out) throw lastErr;
    res.json({ conversation_id: out.data.conversation_id, conversation_url: out.data.conversation_url, create_ms: out.ms, prompt: prompt.title, surprise, name, context: base.conversational_context, max_seconds: maxSeconds, scope: scope().id });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post("/api/conversations/:id/end", async (req, res) => {
  try {
    await tavus(`/v2/conversations/${encodeURIComponent(req.params.id)}/end`, { method: "POST" });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Scores are recomputed on every read: interviewer marks first, then the transcript + board
// evidence pass fills what the interviewer never marked. Saved logs are never rewritten.
const withScore = (d) => ({ ...d, rubric_live: d.rubric ?? {}, rubric: mergedRubric(d) });

// Reviewer endpoints: list and read saved sessions (local files; no auth because this runs on localhost).
app.get("/api/sessions", (_req, res) => {
  if (!existsSync("session-logs")) return res.json([]);
  const rows = readdirSync("session-logs").filter((f) => f.endsWith(".json")).sort().reverse().map((file) => {
    try {
      const d = withScore(JSON.parse(readFileSync(`session-logs/${file}`, "utf8")));
      return { file, sample: !!d.sample, test: !d.sample && (!d.candidate || (d.summary?.turns ?? 0) < 3), candidate: d.candidate ?? "", prompt: d.prompt, saved_at: d.saved_at ?? file, board_sync: d.board_sync, end_reason: d.end_reason, scope: d.scope ?? "full", ...(() => { const r = scoreRubric(d.rubric ?? {}, d.scope ?? "full"); return { pct: r.enough ? r.pct : null, verdict: r.verdict }; })(), turns: d.summary?.turns ?? 0, p50: d.summary?.p50 ?? null };
    } catch { return { file, error: "unreadable" }; }
  });
  rows.sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));
  res.json(rows);
});
app.get("/api/sessions/:file", (req, res) => {
  const f = req.params.file;
  if (!/^[\w.-]+\.json$/.test(f) || !existsSync(`session-logs/${f}`)) return res.status(404).json({ error: "not found" });
  res.json(withScore(JSON.parse(readFileSync(`session-logs/${f}`, "utf8"))));
});

// Permanently delete one session (log, board, transcript). The reviewer page asks for confirmation first.
app.delete("/api/sessions/:file", (req, res) => {
  const f = req.params.file;
  if (!/^[\w.-]+\.json$/.test(f) || !existsSync(`session-logs/${f}`)) return res.status(404).json({ error: "not found" });
  unlinkSync(`session-logs/${f}`);
  res.json({ deleted: f });
});

app.post("/api/session-log", (req, res) => {
  mkdirSync("session-logs", { recursive: true });
  const file = `session-logs/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(req.body, null, 2));
  res.json({ saved: file });
});

if (dev) {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  app.use(express.static("dist"));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile("index.html", { root: "dist" }));
}

const port = Number(process.env.PORT || 5173);
app.listen(port, () => console.log(`Board interviewer on http://localhost:${port}${dev ? " (dev)" : ""}`));
