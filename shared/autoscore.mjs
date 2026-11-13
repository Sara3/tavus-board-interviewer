// End-of-call evidence pass, run on the server from the saved transcript + final board.
// Why: the PAL's live rubric_mark tool calls are unreliable (one real 8-min call fired it once),
// so items it never marked would show as "not observed". This pass fills ONLY those gaps, with
// quoted evidence and source "auto"; marks the interviewer did make always win.
// Rules are outcome checks on what the candidate said or drew; they never look at the brief.
import { scopeOf } from "./rubric.mjs";

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).toLowerCase().match(/[a-z0-9]+/g) ?? [];
const stem = (w) => w.slice(0, 5);

/** Live captions arrive as growing partials ("Okay." then "Okay. And it needs…"): keep the final one. */
export function candidateTurns(utterances = []) {
  const u = utterances.filter((x) => x.role === "user").map((x) => norm(x.text)).filter(Boolean);
  return u.filter((t, i) => !(u[i + 1] && u[i + 1].startsWith(t)));
}

/** Parse the BOARD STATE text the interviewer read (works for every saved log). */
export function parseBoard(text = "") {
  const lines = String(text).split("\n");
  const boxes = {}, edges = [], notes = [];
  let sec = "";
  for (const l of lines) {
    if (/^BOXES:/.test(l)) { sec = "b"; continue; }
    if (/^CONNECTIONS:/.test(l)) { sec = "c"; continue; }
    if (/^NOTES/.test(l)) { sec = "n"; continue; }
    if (/^[A-Z ]+:/.test(l) && !l.startsWith("-") && !l.startsWith(" ")) { sec = ""; }
    let m;
    if (sec === "b" && (m = /^- (B\d+) "([^"]*)" \(([^,)]*)/.exec(l))) boxes[m[1]] = { label: m[2], kind: m[3] };
    if (sec === "c" && (m = /^- (B\d+|\?)[^→↔—]*([→↔—])\s*(B\d+|\?)(?:[^"]*"[^"]*")?(?:.*labeled "([^"]*)")?/.exec(l.trim()))) edges.push({ from: m[1], to: m[3], label: m[4] ?? "" });
    if (sec === "n" && (m = /^- "(.*)"$/.exec(l.trim()))) notes.push(m[1]);
  }
  return { boxes, edges, notes };
}

const FR_SPLIT = /\s+-\s+|\n|;|\d+\.\s+/;
function frItems(board, lists) {
  const fromNotes = board.notes.flatMap((n) => {
    const m = /\bFR\b:?\s*(.*?)(?:\bNFR\b|$)/i.exec(n);
    return m ? m[1].split(FR_SPLIT).map((x) => norm(x).replace(/^[-•*]\s*/, "")).filter((x) => x.length > 3) : [];
  });
  const req = (lists ?? []).filter((l) => l.kind === "requirements").at(-1)?.items ?? [];
  const fromList = req.filter((x) => !/\d/.test(x));
  return fromNotes.length >= fromList.length ? fromNotes : fromList;
}

const NUM = /\b\d+(?:\.\d+)?\s*(?:m\b|million|k\b|thousand|ms\b|s\b|sec|seconds?|%|\/\s*day|per day|a day|qps|rps|tps|nines?)/gi;

export function autoScore(log) {
  const items = scopeOf(log.scope ?? "full").items;
  const board = parseBoard(log.final_board);
  const said = candidateTurns(log.utterances);
  const saidText = said.join(" ").toLowerCase();
  const reqList = (log.lists ?? []).filter((l) => l.kind === "requirements").at(-1)?.items ?? [];
  const out = {};
  const put = (id, status, evidence) => { if (items.includes(id)) out[id] = { status, evidence, source: "auto" }; };

  // Functional requirements: 3+ core requirements in the candidate's words (board note or agreed list).
  const fr = frItems(board, log.lists);
  const oos = /out of scope|not in scope|won't cover|non-goal/i.test([...board.notes, saidText].join(" "));
  if (fr.length >= 3) put("req_functional", "met", `${fr.length} functional requirements: ${fr.slice(0, 4).join("; ")}${oos ? "; scope stated" : ""}`);
  else if (fr.length) put("req_functional", "partial", `Only ${fr.length} functional requirement(s): ${fr.join("; ")}`);

  // Quality targets: distinct numbers with units, written or said by the candidate.
  const numSrc = [...board.notes, ...reqList, ...said].join(" ");
  const unit = (x) => x.toLowerCase().replace(/\s+/g, "").replace(/million$/, "m").replace(/thousand$/, "k").replace(/(sec|seconds?)$/, "s").replace(/(perday|aday)$/, "/day");
  const nums = [...new Set((numSrc.match(NUM) ?? []).map(unit))];
  if (nums.length >= 3) put("req_nonfunctional", "met", `Numeric targets: ${nums.slice(0, 6).join(", ")}`);
  else if (nums.length) put("req_nonfunctional", "partial", `Few numeric targets: ${nums.join(", ")}`);

  // Every requirement has a path: connected boxes, and each FR maps to a connected box.
  const keys = Object.keys(board.boxes);
  const linked = new Set(board.edges.flatMap((e) => [e.from, e.to]).filter((k) => k !== "?"));
  const isolated = keys.filter((k) => !linked.has(k)).map((k) => board.boxes[k].label);
  const labelStems = new Set(keys.filter((k) => linked.has(k)).flatMap((k) => words(board.boxes[k].label).filter((w) => w.length >= 4).map(stem)));
  const covered = fr.filter((f) => words(f).filter((w) => w.length >= 4).some((w) => labelStems.has(stem(w))));
  if (keys.length >= 4 && board.edges.length >= 4 && !isolated.length && (!fr.length || covered.length >= Math.ceil(fr.length * 0.66)))
    put("hld_complete", "met", `${keys.length} boxes, ${board.edges.length} arrows, none unconnected; ${covered.length}/${fr.length || 0} requirements map to a connected box`);
  else if (board.edges.length >= 2) put("hld_complete", "partial", `${board.edges.length} arrows${isolated.length ? `; unconnected: ${isolated.join(", ")}` : ""}; ${covered.length}/${fr.length} requirements on the board`);
  else if (keys.length) put("hld_complete", "missed", "Boxes on the board but no connections");

  // Data store: a store on the board, and a reason for it.
  const STORE = /\b(db|database|postgres|mysql|sql|dynamo|mongo|redis|cache|store|storage|table|s3|bucket|warehouse|queue log|event log)\b/i;
  const stores = keys.filter((k) => STORE.test(board.boxes[k].label) || /database|cache|storage/.test(board.boxes[k].kind)).map((k) => board.boxes[k].label);
  const why = said.find((t) => STORE.test(t) && /\b(because|so that|consisten|transaction|durab|acid|scal|read|write)/i.test(t));
  const dataTalk = said.find((t) => /\b(data|store|storage|entit|schema|table|model)\b/i.test(t));
  if (stores.length && why) put("hld_data", "met", `Store on board: ${stores.join(", ")}; reason: "${why.slice(0, 140)}"`);
  else if (stores.length) put("hld_data", "partial", `Store on board (${stores.join(", ")}) but no reason given`);
  else if (dataTalk) put("hld_data", "partial", `No store drawn; data discussed: "${dataTalk.slice(0, 140)}"`);
  else put("hld_data", "missed", "No data store drawn or discussed");

  // Drives the session: structures the flow and checks in.
  const STRUCT = /\b(let's (walk|start|get started|talk|move|do|go)|my plan|first,? (i|let)|next,? (i|let)|moving on|to summari[sz]e|walk through)\b/i;
  const CHECK = /(anything else|does (that|this) (make sense|match|work|sound)|is that (right|correct)|correct\?|sound good|am i missing|what am i missing|right\?)/i;
  const s = said.filter((t) => STRUCT.test(t)), c = said.filter((t) => CHECK.test(t));
  if (s.length >= 2 && c.length >= 2) put("drives", "met", `Structured the session (${s.length}x, e.g. "${(STRUCT.exec(s[0]) ?? [""])[0]}") and checked in (${c.length}x, e.g. "${(CHECK.exec(c[0]) ?? [""])[0]}")`);
  else if (s.length || c.length) put("drives", "partial", `Structure ${s.length}x, check-ins ${c.length}x`);

  return out;
}

/** Interviewer marks win; auto marks only fill items the interviewer never marked. */
export function mergedRubric(log) {
  const live = Object.fromEntries(Object.entries(log.rubric ?? {}).map(([k, v]) => [k, { ...v, source: v.source ?? "interviewer" }]));
  if (log.sample) return live;
  const auto = autoScore(log);
  for (const [k, v] of Object.entries(auto)) if (!live[k]) live[k] = v;
  return live;
}
