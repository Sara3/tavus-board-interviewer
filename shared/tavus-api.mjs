// Thin Tavus REST client. Server-side only: the API key never reaches the browser.
const BASE = process.env.TAVUS_API_BASE || "https://tavusapi.com";

export async function tavus(path, { method = "GET", body } = {}) {
  const key = process.env.TAVUS_API_KEY;
  if (!key) throw new Error("TAVUS_API_KEY is not set (put it in .env)");
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  const ms = Date.now() - started;
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${data.error || data.message || text.slice(0, 300)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { data, ms };
}
