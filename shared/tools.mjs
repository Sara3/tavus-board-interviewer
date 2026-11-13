import { RUBRIC } from "./rubric.mjs";

// Tool definitions shared by the setup script (server side) and the browser handler.
// All tools use app-message delivery: the browser owns the board and the side panel,
// so it is the right place to execute them.
export const TOOLS = [
  {
    name: "read_board",
    description:
      "Read the candidate's whiteboard exactly as drawn: every box, every arrow (with direction and label), and free-text notes. Call this before you mention, praise or question anything on the board. Never describe the board from memory or from the video.",
    parameters: { type: "object", properties: {}, required: [] },
    on_resolve: "generate_response",
  },
  {
    name: "set_stage",
    description:
      "Silently record which topic is being discussed now, for the reviewer timeline. Follows the candidate's order; never mention it.",
    parameters: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: ["requirements", "core_entities", "api", "data_flow", "high_level_design", "deep_dives", "wrap_up"],
        },
      },
      required: ["stage"],
    },
    on_resolve: "fire_and_forget",
  },
  {
    name: "show_list",
    description:
      "Show a short list on the candidate's screen instead of reading it aloud. For kind=requirements, items are ONLY what the candidate said or wrote, in their words, after you confirmed them. Never add anything from the brief that the candidate did not raise: put those in not_raised (reviewers only, never shown to the candidate). After calling it, say one sentence such as 'I've put what we agreed on screen.'",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["requirements", "follow_ups", "to_fix", "other"] },
        title: { type: "string" },
        items: { type: "array", items: { type: "string" }, maxItems: 8, description: "Candidate's own points only." },
        not_raised: { type: "array", items: { type: "string" }, maxItems: 8, description: "Brief requirements the candidate has not raised. Reviewer-only record; never mention them aloud." },
      },
      required: ["kind", "items"],
    },
    on_resolve: "fire_and_forget",
  },
  {
    name: "rubric_mark",
    description:
      "Silently record evidence against the interview rubric whenever the candidate meets, partly meets, or misses an item. Never mention the rubric or this tool aloud, and keep talking normally after calling it.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", enum: RUBRIC.map((r) => r.id), description: RUBRIC.map((r) => `${r.id}: ${r.text}`).join("; ") },
        status: { type: "string", enum: ["met", "partial", "missed"] },
        evidence: { type: "string", description: "One short sentence: what the candidate said or drew" },
      },
      required: ["item", "status", "evidence"],
    },
    on_resolve: "fire_and_forget",
  },
  {
    name: "show_scorecard",
    description:
      "At the end of the interview, record the scorecard for reviewers. Scores are 1 to 4 (4 = a senior interviewer would nod). Do not read it aloud; thank the candidate instead.",
    parameters: {
      type: "object",
      properties: {
        navigation: { type: "integer", minimum: 1, maximum: 4, description: "Drove the framework, managed time" },
        design: { type: "integer", minimum: 1, maximum: 4, description: "Sound high-level design" },
        depth: { type: "integer", minimum: 1, maximum: 4, description: "Deep dives, trade-offs, failure handling" },
        communication: { type: "integer", minimum: 1, maximum: 4, description: "Clear, structured, checked in" },
        verdict: { type: "string", enum: ["strong hire", "hire", "lean hire", "lean no hire", "no hire"] },
        strengths: { type: "array", items: { type: "string" }, maxItems: 3 },
        fixes: { type: "array", items: { type: "string" }, maxItems: 3 },
      },
      required: ["navigation", "design", "depth", "communication", "verdict", "fixes"],
    },
    on_resolve: "fire_and_forget",
  },
];
