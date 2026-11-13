// Background rubric. Outcome-based: items are marked whenever they are shown, in any order or
// framework the candidate uses (Hello Interview stages are only used to group results for reviewers). The PAL marks items silently with the
// rubric_mark tool; the candidate sees it fill in on screen and it feeds the final scorecard.
export const RUBRIC = [
  { id: "req_functional", stage: "requirements", text: "Clear core functional requirements and scope" },
  { id: "req_nonfunctional", stage: "requirements", text: "Quality targets with numbers (latency, scale, availability)" },
  { id: "entities", stage: "core_entities", text: "Identifies the main data / entities" },
  { id: "api", stage: "api", text: "Interfaces (API, events or contracts) cover the requirements" },
  { id: "hld_complete", stage: "high_level_design", text: "Every functional requirement has a path through the board" },
  { id: "hld_data", stage: "high_level_design", text: "Data store choice justified, data model sketched" },
  { id: "deep_scale", stage: "deep_dives", text: "Handles 10x scale with a concrete mechanism" },
  { id: "deep_failure", stage: "deep_dives", text: "Failure handling: retries, idempotency, what the user sees" },
  { id: "tradeoffs", stage: "deep_dives", text: "States trade-offs and why this over the alternative" },
  { id: "drives", stage: "communication", text: "Structures the conversation in their own way, checks in, manages time" },
];

/** Interview scope: one setting (INTERVIEW_SCOPE) next to call length.
 *  "screen" fits a short session: requirements + high-level design. "full" is the 30-45 min interview. */
export const SCOPES = {
  screen: {
    id: "screen",
    label: "Requirements + high-level design",
    items: ["req_functional", "req_nonfunctional", "hld_complete", "hld_data", "drives"],
    spoken: "Today we'll cover requirements and a high-level design on the board; we won't go into APIs or deep dives.",
    pacing: "SCOPE: requirements and high-level design ONLY. Pace it: about a quarter of the time on requirements, most of the rest on the high-level design on the board, the last minute to wrap up. Do not open APIs, detailed data models, deep dives or twists. If the candidate goes there briefly, let them finish the thought, then steer back to the board.",
  },
  full: {
    id: "full",
    label: "Full interview",
    items: RUBRIC.map((r) => r.id),
    spoken: "",
    pacing: "SCOPE: full interview, all areas, in the candidate's order. Use the twists in deep dives.",
  },
};
export const scopeOf = (id) => SCOPES[id] ?? SCOPES.full;

/** Deterministic end-of-call score from rubric marks, so there's always a result even if the
 *  call is cut before the interviewer reaches wrap-up. met = 1, partial = 0.5, missed/unseen = 0.
 *  Only in-scope items count; the rest are reported as out of scope, not as failures. */
export function scoreRubric(marks, scopeId) {
  const inScope = new Set(scopeOf(scopeId).items);
  const val = (id) => ({ met: 1, partial: 0.5 }[marks?.[id]?.status] ?? 0);
  const scored = RUBRIC.filter((r) => inScope.has(r.id));
  const stages = [...new Set(RUBRIC.map((r) => r.stage))].map((stage) => {
    const items = scored.filter((r) => r.stage === stage);
    const got = items.reduce((a, r) => a + val(r.id), 0);
    return { stage, got, max: items.length, pct: items.length ? Math.round((100 * got) / items.length) : null, in_scope: items.length > 0 };
  });
  const got = scored.reduce((a, r) => a + val(r.id), 0);
  const pct = Math.round((100 * got) / scored.length);
  // Too few observations is a data problem, not a candidate problem: say so instead of "no hire".
  const observed = scored.filter((r) => marks?.[r.id]).length;
  const enough = observed >= Math.ceil(scored.length * 0.6);
  const verdict = !enough ? "not enough evidence" : pct >= 85 ? "strong hire" : pct >= 70 ? "hire" : pct >= 55 ? "lean hire" : pct >= 40 ? "lean no hire" : "no hire";
  return { observed, enough, scope: scopeOf(scopeId).id, stages, got, max: scored.length, pct, verdict, unseen: scored.filter((r) => !marks?.[r.id]).map((r) => r.text), out_of_scope: RUBRIC.filter((r) => !inScope.has(r.id)).map((r) => r.id) };
}
