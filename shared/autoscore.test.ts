import { describe, expect, it } from "vitest";
import { autoScore, candidateTurns, mergedRubric, parseBoard } from "./autoscore.mjs";

const board = `BOARD STATE v3 at now: 5 boxes, 4 connections, 1 notes.
BOXES:
- B1 "Client" (client, top-left)
- B2 "API Gateway" (api gateway, center)
- B3 "cancel service" (service, center)
- B4 "offer engine" (service, right)
- B5 "win back scheduler" (service, bottom)
CONNECTIONS:
- B1 "Client" → B2 "API Gateway" labeled "chat"
- B2 "API Gateway" → B3 "cancel service"
- B3 "cancel service" → B4 "offer engine"
- B3 "cancel service" → B5 "win back scheduler"
NOTES (free text):
- "FR: - cancel by chat - one save offer - 30 day win back NFR: - 50 M subs - chat < 3 s"`;

describe("autoscore", () => {
  it("keeps only the final caption of growing partials", () => {
    expect(candidateTurns([{ role: "user", text: "Okay." }, { role: "user", text: "Okay. Cancel it." }, { role: "replica", text: "Hi" }])).toEqual(["Okay. Cancel it."]);
  });
  it("parses the board text", () => {
    const b = parseBoard(board);
    expect(Object.keys(b.boxes)).toHaveLength(5);
    expect(b.edges[0]).toEqual({ from: "B1", to: "B2", label: "chat" });
    expect(b.notes).toHaveLength(1);
  });
  it("marks what the board and transcript show", () => {
    const m = autoScore({ scope: "screen", final_board: board, utterances: [{ role: "user", text: "Let's walk through requirements. Is that right?" }, { role: "user", text: "Let's get started on the design. Anything else I'm missing?" }] });
    expect(m.req_functional.status).toBe("met");
    expect(m.req_nonfunctional.status).toBe("partial");
    expect(m.hld_complete.status).toBe("met");
    expect(m.hld_data.status).toBe("missed");
    expect(m.drives.status).toBe("met");
  });
  it("gives nothing for an empty call", () => {
    const m = autoScore({ scope: "screen", final_board: "", utterances: [] });
    expect(Object.values(m).filter((x) => x.status !== "missed")).toHaveLength(0);
  });
  it("never overrides the interviewer's own marks", () => {
    const r = mergedRubric({ scope: "screen", final_board: board, rubric: { req_functional: { status: "partial", evidence: "x" } }, utterances: [] });
    expect(r.req_functional).toMatchObject({ status: "partial", source: "interviewer" });
    expect(r.hld_complete.source).toBe("auto");
  });
});
