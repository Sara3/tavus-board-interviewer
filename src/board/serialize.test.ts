import { describe, expect, it } from "vitest";
import { buildModel, diffModels, renderModel, type BoardElement } from "./serialize";

const box = (id: string, x: number, y: number, extra: Partial<BoardElement> = {}): BoardElement => ({
  id, type: "rectangle", x, y, width: 160, height: 80, ...extra,
});
const label = (id: string, containerId: string, text: string): BoardElement => ({
  id, type: "text", x: 0, y: 0, width: 10, height: 10, text, containerId,
});
const arrow = (id: string, from: string | null, to: string | null, extra: Partial<BoardElement> = {}): BoardElement => ({
  id, type: "arrow", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]],
  startBinding: from ? { elementId: from } : null, endBinding: to ? { elementId: to } : null,
  endArrowhead: "arrow", startArrowhead: null, ...extra,
});

describe("board serializer", () => {
  it("says the board is empty instead of letting the model guess", () => {
    expect(renderModel(buildModel([]))).toContain("The board is EMPTY");
  });

  it("states explicitly that there are no lines when none are drawn", () => {
    const text = renderModel(buildModel([box("a", 0, 0), label("t", "a", "API")]));
    expect(text).toContain("NO lines or arrows");
  });

  it("resolves bound arrows and their labels", () => {
    const m = buildModel([
      box("a", 0, 0), label("ta", "a", "Client"),
      box("b", 400, 0), label("tb", "b", "API Gateway"),
      arrow("x", "a", "b"), label("tx", "x", "HTTPS"),
    ]);
    expect(m.edges).toEqual([{ from: "B1", to: "B2", label: "HTTPS", kind: "→", dangling: false }]);
    expect(renderModel(m)).toContain('B1 "Client" → B2 "API Gateway" labeled "HTTPS"');
  });

  it("snaps an unbound arrow end that stops near a box", () => {
    const m = buildModel([
      box("a", 0, 0), label("ta", "a", "Worker"),
      box("b", 400, 0), label("tb", "b", "Queue"),
      { ...arrow("x", null, null), x: 170, y: 40, points: [[0, 0], [220, 0]] },
    ]);
    expect(m.edges[0]).toMatchObject({ from: "B1", to: "B2", dangling: false });
  });

  it("flags a loose arrow end instead of inventing a target", () => {
    const m = buildModel([box("a", 0, 0), label("ta", "a", "Worker"), { ...arrow("x", "a", null), x: 170, y: 40, points: [[0, 0], [600, 600]] }]);
    expect(renderModel(m)).toContain("[loose end");
  });

  it("uses free text placed on a shape as its label, and keeps other text as notes", () => {
    const m = buildModel([
      box("a", 0, 0),
      { id: "t1", type: "text", x: 20, y: 20, width: 60, height: 20, text: "Postgres" },
      { id: "t2", type: "text", x: 900, y: 900, width: 60, height: 20, text: "p99 < 500ms" },
    ]);
    expect(m.nodes[0].label).toBe("Postgres");
    expect(m.notes).toEqual(["p99 < 500ms"]);
  });

  it("treats plain lines as undirected and double-headed arrows as two-way", () => {
    const m = buildModel([
      box("a", 0, 0), label("ta", "a", "A"), box("b", 400, 0), label("tb", "b", "B"),
      { ...arrow("l", "a", "b"), type: "line", endArrowhead: null },
      arrow("d", "a", "b", { startArrowhead: "arrow" }),
    ]);
    expect(m.edges.map((e) => e.kind)).toEqual(["—", "↔"]);
  });

  it("counts freehand strokes it cannot interpret instead of guessing", () => {
    const text = renderModel(buildModel([{ id: "f", type: "freedraw", x: 0, y: 0, width: 50, height: 50 }]));
    expect(text).toContain("1 freehand pen stroke");
    expect(text).not.toContain("EMPTY");
  });

  it("reports the component kind of pre-drawn library shapes even after relabeling", () => {
    const m = buildModel([box("a", 0, 0, { type: "ellipse", customData: { kind: "database" } }), label("t", "a", "Postgres (orders)")]);
    expect(renderModel(m)).toContain('B1 "Postgres (orders)" (database,');
  });

  it("ignores deleted elements", () => {
    const m = buildModel([box("a", 0, 0, { isDeleted: true })]);
    expect(m.nodes).toHaveLength(0);
  });

  it("reports what changed between versions", () => {
    const v1 = buildModel([box("a", 0, 0), label("ta", "a", "API")]);
    const v2 = buildModel([box("a", 0, 0), label("ta", "a", "API"), box("b", 400, 0), label("tb", "b", "Cache"), arrow("x", "a", "b")]);
    expect(diffModels(v1, v2)).toEqual(['added box "Cache"', 'added connection API → Cache']);
  });
});
