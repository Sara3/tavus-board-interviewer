import { useEffect, useState } from "react";
import { onBoard } from "./board/match";
import { BoardSnapshot } from "./BoardSnapshot";
import { RUBRIC, scopeOf, scoreRubric } from "../shared/rubric.mjs";

// Reviewer view for the hiring team: everything the candidate doesn't see. Reads saved session logs.
interface Row { file: string; candidate: string; prompt: string; saved_at: string; board_sync: boolean; end_reason: string; pct: number | null; verdict: string | null; turns: number; p50: number | null; scope?: string; sample?: boolean; test?: boolean }

const AREA: Record<string, string> = { requirements: "Requirements", core_entities: "Core entities", api: "Interfaces", high_level_design: "High-level design", deep_dives: "Deep dives", communication: "Communication" };
const STATUS: Record<string, [string, string]> = { met: ["Met", "met"], partial: ["Partial", "partial"], missed: ["Missed", "missed"] };
const when = (s: string) => { const d = new Date(s); return isNaN(+d) ? s : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
const secs = (t?: string) => { const m = /^(\d+):(\d+):(\d+)$/.exec(t ?? ""); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN; };
const rel = (t: string, t0: number) => { const s = secs(t) - t0; return isNaN(s) ? t : `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`; };
const tone = (pct: number | null) => (pct == null ? "none" : pct >= 70 ? "good" : pct >= 40 ? "mid" : "low");

function Ring({ pct, toneOf }: { pct: number; toneOf: number | null }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className={`ring ${tone(toneOf)}`} aria-label={`${pct}% of rubric`}>
      <circle cx="60" cy="60" r={r} className="ring-bg" />
      <circle cx="60" cy="60" r={r} className="ring-fg" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 60 60)" />
      <text x="60" y="66" textAnchor="middle" className="ring-num">{pct}%</text>
    </svg>
  );
}

export function Review() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<string>();
  const [d, setD] = useState<any>();
  const [showTests, setShowTests] = useState(false);
  const [delFor, setDelFor] = useState<string>();
  const confirmDel = !!sel && delFor === sel;
  const setConfirmDel = (on: boolean) => setDelFor(on ? sel : undefined);
  async function remove(file: string) {
    const r = await fetch(`/api/sessions/${encodeURIComponent(file)}`, { method: "DELETE" });
    if (!r.ok) return;
    const rest = rows.filter((x) => x.file !== file);
    setRows(rest); setDelFor(undefined); setD(undefined);
    setSel((rest.find((x) => !x.test) ?? rest[0])?.file);
  }
  useEffect(() => { fetch("/api/sessions").then((r) => r.json()).then((x: Row[]) => { setRows(x); const first = x.find((r) => !r.test) ?? x[0]; if (first) setSel(first.file); }); }, []);
  const tests = rows.filter((r) => r.test).length;
  const visible = rows.filter((r) => showTests || !r.test);
  useEffect(() => { if (sel) fetch(`/api/sessions/${sel}`).then((r) => r.json()).then(setD); }, [sel]);

  const scope = scopeOf(d?.scope ?? "full");
  const score = d ? scoreRubric(d.rubric ?? {}, scope.id) : null;
  const inScope = new Set(scope.items);
  const verdict = score && !score.enough ? "Not enough evidence" : score?.verdict;
  const ringTone = score?.enough ? score.pct : null;
  const t0 = secs(d?.utterances?.[0]?.at ?? d?.stages?.[0]?.at);
  const reqs = (d?.lists ?? []).filter((l: any) => l.kind === "requirements" || /requirement|agreed/i.test(l.title)).at(-1);

  return (
    <div className="rv">
      <header className="rv-top">
        <div className="brand"><span className="brand-mark">◧</span> Hiring team · Interview review</div>
        <span className="chip muted">Candidates never see this page</span>
      </header>

      <div className="rv-body">
        <aside className="rv-list">
          <h2>Sessions <span>{visible.length}</span></h2>
          {visible.map((r) => (
            <div className="rv-row" key={r.file}>
            <button className={`rv-item ${r.file === sel ? "on" : ""}`} onClick={() => setSel(r.file)}>
              <span className="rv-name">{r.candidate || "Unnamed"}</span>
              <span className={`pill ${tone(r.pct)}`}>{r.pct != null ? `${r.pct}%` : "–"}</span>
              <span className="rv-verdict">{r.verdict ?? "–"}{r.sample ? <span className="chip tiny">Sample</span> : null}{r.test ? <span className="chip tiny">Test call</span> : null}</span>
              <span className="rv-meta">{when(r.saved_at)} · {r.turns} turns{r.board_sync === false ? " · sync off" : ""}</span>
            </button>
            <button className="rv-trash" title={`Delete ${r.candidate || "this session"}`} aria-label={`Delete ${r.candidate || "this session"}`} onClick={() => { setSel(r.file); setDelFor(r.file); }}>🗑</button>
            </div>
          ))}
          {tests > 0 && <button className="linkish" onClick={() => setShowTests((v) => !v)}>{showTests ? "Hide" : "Show"} {tests} short test call{tests > 1 ? "s" : ""}</button>}
          {!rows.length && <p className="hint">No sessions saved yet. Finish an interview and it appears here.</p>}
        </aside>

        {d && score && (
          <main className="rv-main">
            <section className="rv-hero">
              <div>
                <p className="eyebrow">Candidate</p>
                <h1>{d.candidate || "Unnamed"}</h1>
                <p className="rv-q">{d.prompt}</p>
                <div className="chips">
                  {d.sample && <span className="chip warn">Sample session</span>}
                  <span className="chip accent">Scope: {scope.label}</span>
                  <span className="chip">{when(d.saved_at)}</span>
                  <span className="chip">{d.end_reason}</span>
                  {d.board_sync === false && <span className="chip warn">Board sync off (control run)</span>}
                </div>
                <div className={`del ${confirmDel ? "ask" : ""}`}>
                  {confirmDel ? (<>
                    <span>Delete {d.candidate || "this session"} permanently? The transcript, board and score are removed.</span>
                    <button className="danger" onClick={() => sel && remove(sel)}>Delete</button>
                    <button className="ghost" onClick={() => setConfirmDel(false)}>Cancel</button>
                  </>) : <button className="ghost delbtn" onClick={() => setConfirmDel(true)}>🗑 Delete session</button>}
                </div>
              </div>
              <div className="rv-score">
                <Ring pct={score.pct} toneOf={ringTone} />
                <div>
                  <p className="eyebrow">Recommendation</p>
                  <p className={`verdict ${tone(ringTone)}`}>{verdict}</p>
                  <p className="hint">{score.enough ? `${score.got} of ${score.max} in-scope rubric points` : `Only ${score.observed} of ${score.max} in-scope areas observed`}</p>
                </div>
              </div>
            </section>

            <section className="kpis">
              {[["Turn latency p50", d.summary?.p50 != null ? `${(d.summary.p50 / 1000).toFixed(1)} s` : "–", `p90 ${d.summary?.p90 != null ? (d.summary.p90 / 1000).toFixed(1) + " s" : "–"}`],
                ["First words", d.summary?.firstWordsMs != null ? `${(d.summary.firstWordsMs / 1000).toFixed(1)} s` : "–", "click to interviewer speaking"],
                ["Turns", String(d.summary?.turns ?? 0), `${(d.utterances ?? []).length} utterances`],
                ["Board pushes", String(d.pushes?.length ?? 0), `${(d.flags ?? []).length ? (d.flags ?? []).map((f: any) => f.kind.replace(/_/g, " ")).join(", ") : "no flags"}`]].map(([k, v, s]) => (
                <div className="kpi" key={k}><p className="eyebrow">{k}</p><p className="kpi-v">{v}</p><p className="hint">{s}</p></div>
              ))}
            </section>

            <div className="rv-grid">
              <section className="panel">
                <h3>Rubric</h3>
                <p className="hint">Outcome-based. Order and framework never affect a mark. Items the interviewer didn't mark live are filled after the call from the transcript and final board, with the evidence quoted.</p>
                {score.stages.map((st) => (
                  <div className={`area ${st.in_scope ? "" : "oos"}`} key={st.stage}>
                    <div className="area-head">
                      <b>{AREA[st.stage] ?? st.stage}</b>
                      {st.in_scope ? <><span className="meter"><i style={{ width: `${st.pct ?? 0}%` }} className={tone(st.pct)} /></span><span className="hint">{st.got}/{st.max}</span></> : <span className="chip muted">Not in scope</span>}
                    </div>
                    {RUBRIC.filter((r) => r.stage === st.stage).map((r) => {
                      const m = d.rubric?.[r.id];
                      const [label, cls] = !inScope.has(r.id) ? ["Not in scope", "oos"] : m ? STATUS[m.status] ?? ["Noted", "partial"] : ["Not observed", "unseen"];
                      return (
                        <div className="crit" key={r.id}>
                          <span className={`badge ${cls}`}>{label}</span>
                          <div><p>{r.text}{m && inScope.has(r.id) && <span className={`chip tiny ${m.source === "auto" ? "" : "muted"}`} title={m.source === "auto" ? "From the transcript and final board, after the call" : "Marked by the interviewer during the call"}>{m.source === "auto" ? "Transcript + board" : "Interviewer"}</span>}</p>{m?.evidence && inScope.has(r.id) && <p className="evidence">“{m.evidence}”</p>}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>

              <div className="rv-col">
                <section className="panel">
                  <h3>Requirements</h3>
                  <p className="hint">What the candidate raised, against the brief.</p>
                  {reqs ? (
                    <ul className="reqs">
                      {reqs.items.map((x: string) => <li key={x}><span className="badge met">Raised</span><span>{x}</span><span className="hint">{onBoard(x, d.final_board ?? "") ? "on board" : "said only"}</span></li>)}
                      {(reqs.not_raised ?? []).map((x: string) => <li key={x}><span className="badge missed">Not raised</span><span>{x}</span><span /></li>)}
                    </ul>
                  ) : <p className="empty">No requirements list was recorded.</p>}
                </section>

                <section className="panel">
                  <h3>Interviewer scorecard</h3>
                  {d.scorecard ? (<>
                    {["navigation", "design", "depth", "communication"].map((k) => (
                      <div className="sc" key={k}><span>{k}</span><span className="meter"><i style={{ width: `${((d.scorecard[k] ?? 0) / 4) * 100}%` }} className="accent" /></span><b>{d.scorecard[k] ?? "–"}/4</b></div>
                    ))}
                    {d.scorecard.strengths?.length ? <><h4>Strengths</h4><ul className="bul">{d.scorecard.strengths.map((x: string) => <li key={x}>{x}</li>)}</ul></> : null}
                    {d.scorecard.fixes?.length ? <><h4>To probe next round</h4><ul className="bul">{d.scorecard.fixes.map((x: string) => <li key={x}>{x}</li>)}</ul></> : null}
                  </>) : <p className="empty">Not recorded: the call ended before wrap-up. Use the rubric score.</p>}
                </section>

                <section className="panel">
                  <h3>Topic timeline</h3>
                  <p className="hint">The candidate's own order.</p>
                  <div className="timeline">{(d.stages ?? []).length ? d.stages.map((s: any, i: number) => <span className="tl" key={i}><small>{rel(s.at, t0)}</small>{AREA[s.stage] ?? s.stage.replace(/_/g, " ")}</span>) : <p className="empty">None recorded.</p>}</div>
                </section>
                <section className="panel">
                  <h3>Camera observations</h3>
                  <p className="hint">Observations, not judgements. Not used in the score, and not a measure of honesty. Camera reads can be wrong: a second monitor, notes or a glance away are normal.</p>
                  {(d.attention ?? []).length ? <ul className="reqs">{d.attention.map((a: any, i: number) => <li key={i}><span className="badge partial">{rel(a.at, t0)}</span><span>{a.reason}</span><span /></li>)}</ul> : <p className="empty">No observations.</p>}
                </section>
              </div>
            </div>

            <div className="rv-grid">
              <section className="panel">
                <h3>Final board</h3>
                <p className="hint">The board as the candidate left it, rebuilt from the saved drawing.</p>
                {sel && <BoardSnapshot d={d} file={sel} />}
                <details className="board-text"><summary>Text the interviewer read</summary><pre className="board">{d.final_board}</pre></details>
              </section>
              <section className="panel">
                <h3>Transcript</h3>
                <div className="chat">{(d.utterances ?? []).map((u: any, i: number) => (
                  <div key={i} className={`msg ${u.role === "user" ? "me" : "them"}`}><small>{u.role === "user" ? d.candidate || "Candidate" : "Interviewer"} · {rel(u.at, t0)}</small><p>{u.text}</p></div>
                ))}</div>
              </section>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
