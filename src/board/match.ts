// Reconciles the on-screen requirements card with the board: is a spoken item also written down?
const STOP = new Set("a an the and or of to for in on at by with is are be should can will user users via get go through each per it its we our".split(" "));

export function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9<>%/ ]+/g, " ").split(/[\s/]+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|s)$/, ""));
}

/** True when most of the item's content words appear somewhere in the board text. */
export function onBoard(item: string, boardText: string): boolean {
  const iw = words(item);
  if (!iw.length) return false;
  const bw = new Set(words(boardText));
  const hits = iw.filter((w) => bw.has(w) || [...bw].some((b) => b.length > 3 && (b.startsWith(w) || w.startsWith(b)))).length;
  return hits / iw.length >= 0.5;
}
