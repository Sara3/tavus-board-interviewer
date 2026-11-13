// Client-side measurements for the feedback doc. All times are performance.now() ms.
export interface TurnLatency { turn: number; ms: number; at: string }
export interface ToolStat { name: string; handled_ms: number; to_speech_ms?: number; at: string }
export interface BoardPush { version: number; bytes: number; changes: string[]; at: string }
export interface Flag { kind: string; detail: string; at: string }

export class Metrics {
  t0 = performance.now();
  createMs?: number;
  joinMs?: number;
  firstWordsMs?: number;
  turns: TurnLatency[] = [];
  tools: ToolStat[] = [];
  pushes: BoardPush[] = [];
  flags: Flag[] = [];
  events: { t: number; type: string }[] = [];
  utterances: { role: string; text: string; at: string }[] = [];
  private userStoppedAt?: number;
  private pendingTool?: { name: string; at: number; idx: number };

  now() { return new Date().toISOString().slice(11, 19); }
  mark(type: string) { this.events.push({ t: Math.round(performance.now() - this.t0), type }); }

  onUserStopped() { this.userStoppedAt = performance.now(); }
  onUserStarted() { this.userStoppedAt = undefined; }
  onReplicaStarted() {
    const now = performance.now();
    if (this.firstWordsMs === undefined) this.firstWordsMs = Math.round(now - this.t0);
    if (this.userStoppedAt !== undefined) {
      this.turns.push({ turn: this.turns.length + 1, ms: Math.round(now - this.userStoppedAt), at: this.now() });
      this.userStoppedAt = undefined;
    }
    if (this.pendingTool) {
      this.tools[this.pendingTool.idx].to_speech_ms = Math.round(now - this.pendingTool.at);
      this.pendingTool = undefined;
    }
  }
  onTool(name: string, receivedAt: number) {
    const idx = this.tools.push({ name, handled_ms: Math.round(performance.now() - receivedAt), at: this.now() }) - 1;
    if (name === "read_board") this.pendingTool = { name, at: receivedAt, idx };
  }
  onPush(version: number, bytes: number, changes: string[]) { this.pushes.push({ version, bytes, changes, at: this.now() }); }
  flag(kind: string, detail: string) { this.flags.push({ kind, detail, at: this.now() }); }

  summary() {
    const ms = this.turns.map((t) => t.ms).sort((a, b) => a - b);
    const pct = (p: number) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))] : undefined);
    return { turns: ms.length, p50: pct(50), p90: pct(90), max: ms.at(-1), createMs: this.createMs, joinMs: this.joinMs, firstWordsMs: this.firstWordsMs };
  }

  toJSON() {
    return { summary: this.summary(), turns: this.turns, tools: this.tools, pushes: this.pushes, flags: this.flags, utterances: this.utterances, events: this.events };
  }
}

/** Heuristic: did the PAL talk about connectors that don't exist on the board? */
export function mentionsConnections(text: string) {
  // Only claims about the board count ("I see an arrow", "you've connected"), not instructions ("connect them with arrows").
  const claim = /\b(i see|i can see|you(?:'ve| have) (?:drawn|connected|got)|there(?:'s| is| are)|your (?:arrow|line|connection))\b/i;
  const link = /\b(arrow|arrows|line|lines|connect(?:ed|ion|ions|s)?|pointing|points to|linked)\b/i;
  return claim.test(text) && link.test(text);
}
