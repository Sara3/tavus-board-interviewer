import { useEffect, useState } from "react";
import { Interview, type Session } from "./Interview";
import { Review } from "./Review";
import { Architecture } from "./Architecture";
import { BoardView } from "./BoardSnapshot";

export function App() {
  if (location.pathname.startsWith("/review")) return <Review />;
  if (location.pathname.startsWith("/architecture")) return <Architecture />;
  if (location.pathname.startsWith("/board/")) return <BoardView file={decodeURIComponent(location.pathname.slice(7))} />;
  return <Lobby />;
}

function Lobby() {
  // Question comes from DEFAULT_QUESTION (server). Override with ?q=<id> or ?q=random.
  const promptId = new URLSearchParams(location.search).get("q") ?? "default";
  const [name, setName] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const [cfg, setCfg] = useState({ interviewer: "Anna", company: "", minutes: 8, scope: "screen", scope_label: "Requirements + high-level design" });
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => setError("Server not reachable")); }, []);

  async function start() {
    setBusy(true); setError(undefined);
    const clickedAt = performance.now();
    try {
      const r = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ promptId, name: name.trim() }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || r.statusText);
      setSession({ ...data, clickedAt });
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  if (session) return <Interview session={session} onExit={() => setSession(null)} />;

  const ready = !!name.trim() && !busy;
  return (
    <main className="lobby">
      <section className="lobby-card">
        <div className="brand"><span className="brand-mark">◧</span> {cfg.company ? `${cfg.company} · ` : ""}First-round interview</div>
        <h1>System design interview</h1>
        <p className="sub">About {cfg.minutes} minutes with {cfg.interviewer}, an AI interviewer who reads your whiteboard as you draw.{cfg.scope === "screen" ? ` This session covers ${cfg.scope_label.toLowerCase()}.` : ""}</p>
        <ol className="steps">
          <li><b>Listen</b><span>{cfg.interviewer} introduces herself and gives you the question.</span></li>
          <li><b>Draw</b><span>Sketch on the board. Ready-made pieces are in the Library.</span></li>
          <li><b>Talk it through</b><span>Ask questions and explain your design, in your own order.</span></li>
        </ol>
        <form className="start" onSubmit={(e) => { e.preventDefault(); if (ready) start(); }}>
          <label htmlFor="fname">First name</label>
          <input id="fname" value={name} required autoFocus autoComplete="given-name" onChange={(e) => setName(e.target.value)} placeholder="How should we address you?" />
          <button type="submit" className="primary" disabled={!ready}>{busy ? "Starting…" : "Start interview"}</button>
        </form>
        {error && <p className="err">{error}</p>}
        <p className="hint">🎙️ Allow camera and microphone when your browser asks. The video, your board and the transcript are saved for the hiring team to review.</p>
      </section>
    </main>
  );
}
