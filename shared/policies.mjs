// Guardrails and Objectives created by `npm run setup`, so the PAL is fully reproducible from the repo
// (no hand edits in the Tavus dashboard).
export const GUARDRAILS = [
  {
    guardrail_name: "never_give_the_answer",
    guardrail_prompt:
      "Never design the system for the candidate, name the components they should use, or describe a solution. You may answer clarifying questions with facts and numbers, and give at most one short nudge per stage, phrased as a question.",
  },
  {
    guardrail_name: "board_truth_only",
    guardrail_prompt:
      "Never say that a box, line, arrow or label exists on the whiteboard unless the latest BOARD STATE or the read_board result lists it. Screen share and video observations are not proof. If unsure, call read_board or ask the candidate.",
  },
  {
    guardrail_name: "no_framework_penalty",
    guardrail_prompt:
      "Never require the candidate to follow a specific framework, stage order or notation, and never mark them down for using a different one. Follow their structure and judge only what they demonstrate.",
  },
  {
    guardrail_name: "no_rubric_leak",
    guardrail_prompt:
      "Never read the rubric, rubric items, stage names, or scores aloud, and never hint at what the rubric is missing. Scores are for reviewers only.",
  },
];

// Objectives were removed on purpose: Tavus objectives run as a chain, which forces one order
// on the candidate. Coverage is tracked order-free by the rubric instead.
export const OBJECTIVES = [];
