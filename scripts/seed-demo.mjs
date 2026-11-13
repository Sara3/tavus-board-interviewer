#!/usr/bin/env node
// Adds three SAMPLE sessions so the reviewer page has a realistic list for a demo.
// They are fictional, flagged `sample: true`, and labelled "Sample" in the UI.
// Real interviews are always scored from what happened on the call.
// Remove them with: npm run seed-demo -- --clear
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const dir = "session-logs";
if (process.argv.includes("--clear")) {
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.startsWith("sample-")) rmSync(`${dir}/${f}`);
  console.log("Sample sessions removed.");
  process.exit(0);
}
mkdirSync(dir, { recursive: true });

const m = (status, evidence) => ({ status, evidence });
const board = (extra) => `BOARD STATE (sample)
BOXES: Client [client] · API Gateway [gateway] · Cancel Agent (LLM) [llm] · Billing API [external] · CRM [external] · Win-back Scheduler [scheduler] · Email / SMS Provider [external]${extra}
CONNECTIONS:
  Client → API Gateway "chat / voice"
  API Gateway → Cancel Agent (LLM)
  Cancel Agent (LLM) → Billing API "cancel / apply offer"
  Cancel Agent (LLM) → CRM "log outcome"
  CRM → Win-back Scheduler "cancelled users"
  Win-back Scheduler → Email / SMS Provider "max 3 msgs, consent check"`;
// Same board as an Excalidraw skeleton, so /review can draw the picture. The page converts it to a scene.
const node = (id, text, x, y, w = 190) => ({ type: "rectangle", id, x, y, width: w, height: 70, roundness: { type: 3 }, backgroundColor: "#e7f0ff", fillStyle: "solid", label: { text, fontSize: 18 } });
// Arrows run edge to edge between box centres; the page binds them to the boxes.
const edge = (n, tx, ty) => { const cx = n.x + n.width / 2, cy = n.y + n.height / 2, dx = tx - cx, dy = ty - cy; const k = Math.min(Math.abs(n.width / 2 / (dx || 1e-9)), Math.abs(n.height / 2 / (dy || 1e-9))); return [cx + dx * k, cy + dy * k]; };
const scene = (withDb) => {
  const nodes = [
    node("client", "Client", 0, 0, 150), node("gw", "API Gateway", 260, 0), node("agent", "Cancel Agent (LLM)", 560, 0, 220),
    node("billing", "Billing API", 900, -110), node("crm", "CRM", 900, 110),
    node("sched", "Win-back Scheduler", 560, 260, 220), node("consent", "Consent / Preferences", 900, 300, 230), node("send", "Email / SMS Provider", 560, 430, 220),
    ...(withDb ? [node("db", "Postgres (subscriptions)", 260, -170, 230)] : []),
  ];
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const c = (n) => [n.x + n.width / 2, n.y + n.height / 2];
  const link = (a, b, text) => {
    const A = by[a], B = by[b], [x1, y1] = edge(A, ...c(B)), [x2, y2] = edge(B, ...c(A));
    return { type: "arrow", x: x1, y: y1, width: x2 - x1, height: y2 - y1, points: [[0, 0], [x2 - x1, y2 - y1]], start: { id: a }, end: { id: b }, ...(text ? { label: { text, fontSize: 14 } } : {}) };
  };
  return [...nodes,
    link("client", "gw", "chat / voice"), link("gw", "agent"), link("agent", "billing", "cancel / offer"), link("agent", "crm", "log outcome"),
    link("crm", "sched", "cancelled users"), link("sched", "consent", "check opt-out"), link("sched", "send", "max 3 msgs"),
    ...(withDb ? [link("agent", "db", "read / write")] : [])];
};
const talk = (name, lines) => lines.map(([r, t], i) => ({ role: r, text: t, at: `14:0${Math.floor(i / 2)}:${String((i * 23) % 60).padStart(2, "0")}` }));

const sessions = [
  {
    candidate: "Priya", saved_at: "2026-11-11T15:10:00Z",
    rubric: { req_functional: m("met", "Scoped cancel, one save offer and a 30-day win-back before drawing"), req_nonfunctional: m("met", "Asked for scale; set chat < 3 s and voice < 1 s"), hld_complete: m("met", "Every requirement traced through the board"), hld_data: m("partial", "CRM as source of truth; scheduler store not discussed"), drives: m("met", "Checked in after requirements, kept time") },
    scorecard: { navigation: 4, design: 3, depth: 3, communication: 4, verdict: "hire", strengths: ["Clear scope first", "Consent check placed in the send path"], fixes: ["Idempotency on the billing call"] },
    reqs: { items: ["Cancel via chat and voice", "One save offer", "30-day win-back, max 3 messages, consent", "Chat < 3 s, voice < 1 s", "Billing API and CRM"], not_raised: ["200k cancel attempts a day"] },
    p50: 1500, turns: 14,
  },
  {
    candidate: "Marcus", saved_at: "2026-11-11T17:40:00Z",
    rubric: { req_functional: m("met", "Listed cancel, save offer and win-back"), req_nonfunctional: m("partial", "Latency target only, no scale"), hld_complete: m("met", "Path for cancel and win-back on the board"), hld_data: m("partial", "Named a database, no reasoning"), drives: m("partial", "Needed one nudge to move to the design") },
    scorecard: { navigation: 3, design: 3, depth: 2, communication: 3, verdict: "lean hire", strengths: ["Clean high-level design"], fixes: ["Ask for scale numbers early", "Justify the data store"] },
    reqs: { items: ["Cancel flow with one save offer", "Win-back by email and SMS", "Fast chat replies"], not_raised: ["Billing API and CRM integration", "Voice under 1 s", "50M subscribers"] },
    p50: 1700, turns: 11,
  },
  {
    candidate: "Elena", saved_at: "2026-11-12T10:05:00Z",
    rubric: { req_functional: m("met", "Precise scope with explicit non-goals"), req_nonfunctional: m("met", "Scale, latency and availability with numbers"), hld_complete: m("met", "All requirements traced, including opt-out mid-journey"), hld_data: m("met", "Event log for journeys, CRM as system of record, reasons given"), drives: m("met", "Drove the session, summarised before moving on") },
    scorecard: { navigation: 4, design: 4, depth: 3, communication: 4, verdict: "strong hire", strengths: ["Opt-out handled in the scheduler", "Clear trade-off on queue vs cron"], fixes: ["Go deeper on retries next round"] },
    reqs: { items: ["Cancel via chat and voice", "One save offer", "30-day win-back, 3 messages, consent", "Chat < 3 s, voice < 1 s", "Billing API and CRM", "50M subscribers, 200k cancels a day"], not_raised: [] },
    p50: 1400, turns: 16,
  },
];

for (const [i, s] of sessions.entries()) {
  const log = {
    sample: true, conversation_id: `sample-${i + 1}`, prompt: "Subscription cancel agent with 30-day win-back", board_sync: true, end_reason: "time limit reached",
    candidate: s.candidate, saved_at: s.saved_at, scope: "screen", rubric: s.rubric, scorecard: s.scorecard,
    stages: [{ stage: "requirements", at: "14:00:10" }, { stage: "high_level_design", at: "14:02:30" }, { stage: "communication", at: "14:07:20" }],
    lists: [{ kind: "requirements", title: "What we agreed", ...s.reqs }],
    final_board: board(i === 1 ? "" : " · Postgres (subscriptions) [database]"),
    final_scene: scene(i !== 1), final_scene_skeleton: true,
    summary: { createMs: 1300, joinMs: 2000, firstWordsMs: 3600, p50: s.p50, p90: s.p50 + 800, max: s.p50 + 1500, turns: s.turns },
    attention: i === 1 ? [{ at: "14:04:10", reason: "looked to the left for ~8 s" }] : [],
    pushes: Array(12).fill({}), tools: Array(8).fill({}), flags: [],
    utterances: talk(s.candidate, [["replica", "Hi, I'm Anna, and I'll be your system design interviewer today."], ["user", "Before I start, is this chat only or voice too?"], ["replica", "Both chat and voice."], ["user", "Then my requirements are cancel, one save offer, and a 30-day win-back."], ["replica", "Anything about scale or other systems we depend on?"], ["user", "Let me draw the high-level design."]]),
  };
  writeFileSync(`${dir}/sample-${i + 1}.json`, JSON.stringify(log, null, 2));
}
console.log(`Wrote ${sessions.length} sample sessions to ${dir}/ (labelled "Sample"). Remove with: npm run seed-demo -- --clear`);
