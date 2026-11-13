import { describe, expect, it } from "vitest";
import { scoreRubric } from "../../shared/rubric.mjs";

describe("scoreRubric", () => {
  it("scores nothing observed as no hire with everything unseen", () => {
    const s = scoreRubric({});
    expect(s.pct).toBe(0);
    expect(s.verdict).toBe("not enough evidence");
    expect(s.unseen).toHaveLength(10);
  });
  it("counts partial as half", () => {
    const s = scoreRubric({ req_functional: { status: "met" }, req_nonfunctional: { status: "partial" } });
    expect(s.stages.find((x) => x.stage === "requirements")).toMatchObject({ got: 1.5, max: 2, pct: 75 });
    expect(s.got).toBe(1.5);
  });
});

describe("scoped scoring", () => {
  it("counts only in-scope items and lists the rest as out of scope", () => {
    const marks = { req_functional: { status: "met" }, req_nonfunctional: { status: "met" }, hld_complete: { status: "partial" }, api: { status: "missed" } };
    const r = scoreRubric(marks, "screen");
    expect(r.max).toBe(5);
    expect(r.pct).toBe(50); // 2.5 of 5; the missed api item is out of scope and does not count
    expect(r.out_of_scope).toContain("api");
    expect(r.stages.find((s) => s.stage === "deep_dives")?.in_scope).toBe(false);
  });
});

describe("verdicts", () => {
  it("a solid scoped screen lands on hire", () => {
    const m = (status: string) => ({ status });
    const r = scoreRubric({ req_functional: m("met"), req_nonfunctional: m("partial"), hld_complete: m("met"), hld_data: m("partial"), drives: m("met") }, "screen");
    expect(r.pct).toBe(80);
    expect(r.verdict).toBe("hire");
  });
  it("all marked missed is still a real no hire", () => {
    const m = { status: "missed" };
    expect(scoreRubric({ req_functional: m, req_nonfunctional: m, hld_complete: m, hld_data: m, drives: m }, "screen").verdict).toBe("no hire");
  });
});
