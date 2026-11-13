/**
 * Turns an Excalidraw scene into compact, factual text the PAL's LLM can reason over.
 *
 * Why: Raven screen perception summarises pixels, so it misses small labels and
 * invents connectors. The scene graph is already structured; sending it as text
 * means the model only "sees" what is really on the board.
 */

export type Point = readonly [number, number];

/** Minimal subset of Excalidraw element fields we rely on (keeps this testable). */
export interface BoardElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  text?: string;
  containerId?: string | null;
  frameId?: string | null;
  name?: string | null; // frames
  customData?: { kind?: string } | null; // set on pre-drawn library components
  points?: readonly Point[];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}

export interface BoardNode {
  key: string; // stable short key, e.g. B3
  id: string;
  label: string;
  shape: string; // component kind (e.g. "database") when known, else the drawn shape
  frame?: string;
  where: string;
}

export interface BoardEdge {
  from: string; // node key or "?"
  to: string;
  label: string;
  kind: "→" | "↔" | "—";
  dangling: boolean;
}

export interface BoardModel {
  nodes: BoardNode[];
  edges: BoardEdge[];
  notes: string[];
  unlabeled: number;
  freehand: number;
}

const SHAPES = new Set(["rectangle", "ellipse", "diamond", "frame", "magicframe", "image", "embeddable"]);
const LINKS = new Set(["arrow", "line"]);
const SNAP_PX = 48; // an unbound arrow end this close to a shape counts as touching it

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

function center(e: BoardElement): Point {
  return [e.x + e.width / 2, e.y + e.height / 2];
}

function distToBox(p: Point, e: BoardElement): number {
  const x0 = Math.min(e.x, e.x + e.width), x1 = Math.max(e.x, e.x + e.width);
  const y0 = Math.min(e.y, e.y + e.height), y1 = Math.max(e.y, e.y + e.height);
  const dx = Math.max(x0 - p[0], 0, p[0] - x1);
  const dy = Math.max(y0 - p[1], 0, p[1] - y1);
  return Math.hypot(dx, dy);
}

function regionLabel(p: Point, bounds: { x0: number; x1: number; y0: number; y1: number }): string {
  const w = Math.max(bounds.x1 - bounds.x0, 1), h = Math.max(bounds.y1 - bounds.y0, 1);
  const fx = (p[0] - bounds.x0) / w, fy = (p[1] - bounds.y0) / h;
  const col = fx < 0.34 ? "left" : fx > 0.66 ? "right" : "center";
  const row = fy < 0.34 ? "top" : fy > 0.66 ? "bottom" : "middle";
  return row === "middle" && col === "center" ? "center" : `${row}-${col}`;
}

export function buildModel(all: readonly BoardElement[]): BoardModel {
  const els = all.filter((e) => !e.isDeleted);
  const byId = new Map(els.map((e) => [e.id, e]));

  // Text bound inside a container is that container's label.
  const labelOf = new Map<string, string>();
  for (const e of els) {
    if (e.type === "text" && e.containerId) {
      labelOf.set(e.containerId, clean([labelOf.get(e.containerId), e.text].filter(Boolean).join(" ")));
    }
  }

  const shapes = els.filter((e) => SHAPES.has(e.type));
  const pts = shapes.length ? shapes : els;
  const bounds = {
    x0: Math.min(...pts.map((e) => e.x)),
    x1: Math.max(...pts.map((e) => e.x + e.width)),
    y0: Math.min(...pts.map((e) => e.y)),
    y1: Math.max(...pts.map((e) => e.y + e.height)),
  };

  // Free text sitting on top of a shape (common when people don't double-click to label) labels it.
  const freeText = els.filter((e) => e.type === "text" && !e.containerId && clean(e.text));
  const usedText = new Set<string>();
  for (const t of freeText) {
    const c = center(t);
    const host = shapes
      .filter((s) => s.type !== "frame" && s.type !== "magicframe" && distToBox(c, s) === 0)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (host && !labelOf.get(host.id)) {
      labelOf.set(host.id, clean(t.text));
      usedText.add(t.id);
    }
  }

  // Reading order: top-to-bottom, then left-to-right, in coarse rows.
  const ordered = [...shapes].sort((a, b) => Math.round(a.y / 80) - Math.round(b.y / 80) || a.x - b.x);
  const nodes: BoardNode[] = [];
  const keyOf = new Map<string, string>();
  let unlabeled = 0;
  ordered.forEach((s) => {
    const frameName = s.type === "frame" || s.type === "magicframe" ? clean(s.name) : "";
    const kind = s.customData?.kind?.replace(/_/g, " ");
    const label = labelOf.get(s.id) || frameName || (kind ? kind[0].toUpperCase() + kind.slice(1) : "");
    if (!label) unlabeled++;
    const key = `B${nodes.length + 1}`;
    keyOf.set(s.id, key);
    const frame = s.frameId ? clean(byId.get(s.frameId)?.name) || undefined : undefined;
    nodes.push({
      key,
      id: s.id,
      label: label || "(no label)",
      shape: kind ?? (s.type === "magicframe" ? "frame" : s.type),
      frame,
      where: regionLabel(center(s), bounds),
    });
  });

  const nearestShape = (p: Point): string | undefined => {
    let best: { id: string; d: number } | undefined;
    for (const s of shapes) {
      if (s.type === "frame" || s.type === "magicframe") continue;
      const d = distToBox(p, s);
      if (d <= SNAP_PX && (!best || d < best.d)) best = { id: s.id, d };
    }
    return best?.id;
  };

  const edges: BoardEdge[] = [];
  for (const a of els.filter((e) => LINKS.has(e.type))) {
    const p = a.points ?? [[0, 0], [a.width, a.height]];
    const start: Point = [a.x + p[0][0], a.y + p[0][1]];
    const endP = p[p.length - 1];
    const end: Point = [a.x + endP[0], a.y + endP[1]];
    const fromId = a.startBinding?.elementId ?? nearestShape(start);
    const toId = a.endBinding?.elementId ?? nearestShape(end);
    const from = (fromId && keyOf.get(fromId)) || "?";
    const to = (toId && keyOf.get(toId)) || "?";
    const hasEnd = a.type === "arrow" && a.endArrowhead !== null && a.endArrowhead !== undefined;
    const hasStart = a.type === "arrow" && !!a.startArrowhead;
    // Excalidraw arrows default to an end arrowhead; treat a missing field on arrows as "→".
    const endHead = a.type === "arrow" && (a.endArrowhead === undefined ? true : hasEnd);
    let kind: BoardEdge["kind"] = endHead && hasStart ? "↔" : endHead || hasStart ? "→" : "—";
    let f = from, t = to;
    if (kind === "→" && hasStart && !endHead) [f, t] = [to, from]; // only a start head: flip
    edges.push({ from: f, to: t, label: labelOf.get(a.id) ?? "", kind, dangling: f === "?" || t === "?" });
  }

  const notes = freeText.filter((t) => !usedText.has(t.id)).map((t) => clean(t.text));
  const freehand = els.filter((e) => e.type === "freedraw").length;
  return { nodes, edges, notes, unlabeled, freehand };
}

export function renderModel(m: BoardModel, meta?: { version: number; at: string }): string {
  const name = (k: string) => (k === "?" ? "(nothing)" : `${k} "${m.nodes.find((n) => n.key === k)?.label ?? k}"`);
  const lines: string[] = [];
  const header = `BOARD STATE${meta ? ` v${meta.version} at ${meta.at}` : ""}: ${m.nodes.length} boxes, ${m.edges.length} connections, ${m.notes.length} notes.`;
  lines.push(header);
  if (!m.nodes.length && !m.edges.length && !m.notes.length && !m.freehand) {
    lines.push("The board is EMPTY. Nothing has been drawn yet.");
    return lines.join("\n");
  }
  if (m.nodes.length) {
    lines.push("BOXES:");
    for (const n of m.nodes) {
      lines.push(`- ${n.key} "${n.label}" (${n.shape}, ${n.where}${n.frame ? `, inside frame "${n.frame}"` : ""})`);
    }
  }
  lines.push("CONNECTIONS:");
  if (!m.edges.length) lines.push("- none. There are NO lines or arrows on the board.");
  for (const e of m.edges) {
    const lbl = e.label ? ` labeled "${e.label}"` : "";
    const warn = e.dangling ? " [loose end: not attached to a box]" : "";
    lines.push(`- ${name(e.from)} ${e.kind} ${name(e.to)}${lbl}${warn}`);
  }
  if (m.notes.length) {
    lines.push("NOTES (free text):");
    for (const n of m.notes) lines.push(`- "${n}"`);
  }
  if (m.unlabeled) lines.push(`${m.unlabeled} shape(s) have no label.`);
  if (m.freehand) lines.push(`${m.freehand} freehand pen stroke(s): their meaning cannot be read; ask the candidate what they drew or to use a labeled box.`);
  return lines.join("\n");
}

/** Human-readable summary of what changed, so the PAL can react to new work. */
export function diffModels(prev: BoardModel | null, next: BoardModel): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const pl = new Set(prev.nodes.map((n) => n.label));
  const nl = new Set(next.nodes.map((n) => n.label));
  for (const l of nl) if (!pl.has(l)) out.push(`added box "${l}"`);
  for (const l of pl) if (!nl.has(l)) out.push(`removed box "${l}"`);
  const edgeSig = (m: BoardModel) =>
    new Set(
      m.edges.map((e) => {
        const lab = (k: string) => m.nodes.find((n) => n.key === k)?.label ?? "(nothing)";
        return `${lab(e.from)} ${e.kind} ${lab(e.to)}${e.label ? ` "${e.label}"` : ""}`;
      }),
    );
  const pe = edgeSig(prev), ne = edgeSig(next);
  for (const e of ne) if (!pe.has(e)) out.push(`added connection ${e}`);
  for (const e of pe) if (!ne.has(e)) out.push(`removed connection ${e}`);
  const pn = new Set(prev.notes), nn = new Set(next.notes);
  for (const n of nn) if (!pn.has(n)) out.push(`added note "${n}"`);
  return out;
}

/** Cheap content fingerprint so cursor moves and restyles don't trigger a context push. */
export function fingerprint(m: BoardModel): string {
  return JSON.stringify([m.nodes.map((n) => [n.label, n.shape, n.frame]), m.edges.map((e) => [e.from, e.to, e.kind, e.label]), m.notes, m.unlabeled, m.freehand]);
}
