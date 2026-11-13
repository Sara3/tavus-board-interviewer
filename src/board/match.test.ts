import { describe, it, expect } from "vitest";
import { onBoard } from "./match";

const board = `FR: user should be able to get a cancellation; one save offer before cancellation; free month /discount;
user get go through win back journey for the next; 3 messages = email + sms (respect users opt out and marketing consent)
NFR: chat to response within 3 seconds - latency`;

describe("onBoard", () => {
  it("matches items the candidate wrote", () => {
    expect(onBoard("Make one save offer before finalizing cancellation", board)).toBe(true);
    expect(onBoard("Respect marketing consent and opt-outs", board)).toBe(true);
  });
  it("flags items that are not on the board", () => {
    expect(onBoard("Integrate with Billing API and CRM", board)).toBe(false);
    expect(onBoard("Scale: 50M subscribers, ~200k cancel attempts/day", board)).toBe(false);
  });
});
