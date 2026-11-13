export function candidateTurns(utterances?: any[]): string[];
export function parseBoard(text?: string): { boxes: Record<string, { label: string; kind: string }>; edges: { from: string; to: string; label: string }[]; notes: string[] };
export function autoScore(log: any): Record<string, { status: string; evidence: string; source: string }>;
export function mergedRubric(log: any): Record<string, { status: string; evidence: string; source?: string }>;
