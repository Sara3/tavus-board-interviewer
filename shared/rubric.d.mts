export declare const RUBRIC: { id: string; stage: string; text: string }[];
export interface Scope { id: string; label: string; items: string[]; spoken: string; pacing: string }
export declare const SCOPES: Record<"screen" | "full", Scope>;
export declare function scopeOf(id?: string): Scope;
export declare function scoreRubric(marks: Record<string, { status: string }>, scopeId?: string): {
  scope: string;
  stages: { stage: string; got: number; max: number; pct: number | null; in_scope: boolean }[];
  observed: number; enough: boolean; got: number; max: number; pct: number; verdict: string; unseen: string[]; out_of_scope: string[];
};
