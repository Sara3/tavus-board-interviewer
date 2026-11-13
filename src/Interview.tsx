import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { useTavusCall } from "./useTavusCall";
import { systemDesignLibrary } from "./board/library";
import { buildModel, diffModels, fingerprint, renderModel, type BoardElement, type BoardModel } from "./board/serialize";
import { echo, overwriteContext, parseToolCall, respond, toolResult, type AppMessage } from "./tavus/protocol";
import { Metrics, mentionsConnections } from "./tavus/metrics";
import { onBoard } from "./board/match";
import { RUBRIC, scopeOf, scoreRubric } from "../shared/rubric.mjs";

export interface Session { name?: string; conversation_id: string; conversation_url: string; create_ms: number; prompt: string; context: string; clickedAt: number; max_seconds?: number; surprise?: boolean; scope?: string }
type Mark = { status: "met" | "partial" | "missed"; evidence: string };

const STAGES = [
  ["requirements", "Requirements"], ["core_entities", "Core entities"], ["api", "API"], ["data_flow", "Data flow"],
  ["high_level_design", "High-level design"], ["deep_dives", "Deep dives"], ["wrap_up", "Wrap-up"],
] as const;
const DEBOUNCE_MS = 1200;
// A/B switch for the feedback doc: ?sync=off runs the same interview with board sync disabled,
// so the PAL only has Raven screen share (share this tab) to go on.
const SYNC_OFF = new URLSearchParams(location.search).get("sync") === "off";
// Candidate view by default. ?reviewer=1 shows the reviewer panels live (for demos); after the call,
// reviewers use /review, which reads the saved session logs.
const REVIEWER_LIVE = new URLSearchParams(location.search).get("reviewer") === "1";

interface Scorecard { navigation: number; design: number; depth: number; communication: number; verdict: string; strengths?: string[]; fixes: string[] }

function Video({ track, muted, className }: { track?: MediaStreamTrack; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = track ? new MediaStream([track]) : null; }, [track]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}
function Audio({ track }: { track?: MediaStreamTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = track ? new MediaStream([track]) : null; }, [track]);
  return <audio ref={ref} autoPlay />;
}

export function Interview({ session, onExit }: { session: Session; onExit: () => void }) {
  const metrics = useMemo(() => { const m = new Metrics(); m.t0 = session.clickedAt; m.createMs = session.create_ms; return m; }, [session]);
  const baseContext = useMemo(() => session.context.replace(/\nBOARD STATE:[\s\S]*$/, ""), [session]);
  const [stage, setStage] = useState<string>("requirements");
  const [lists, setLists] = useState<{ kind: string; title: string; items: string[]; not_raised: string[] }[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard>();
  const [captions, setCaptions] = useState<{ role: string; text: string }[]>([]);
  const [boardText, setBoardText] = useState(renderModel(buildModel([])));
  const [tick, setTick] = useState(0); // re-render metrics panel
  const [savedLog, setSavedLog] = useState<string>();
  const [rubric, setRubric] = useState<Record<string, Mark>>({});
  const [joinedAt, setJoinedAt] = useState<number>();
  const [now, setNow] = useState(Date.now());
  const lastEdit = useRef(0);
  const stageLog = useRef<{ stage: string; at: string }[]>([]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  const attention = useRef<{ at: string; reason: string }[]>([]);
  const boardRef = useRef<{ model: BoardModel | null; text: string; version: number; fp: string; ctx?: string; sent?: boolean }>({ model: null, text: boardText, version: 0, fp: "" });
  const timer = useRef<number | undefined>(undefined);
  const sendRef = useRef<(m: AppMessage) => boolean>(() => false);

  // Who is speaking right now, so the fixed 2-minute line waits for a pause instead of talking over the candidate.
  const talk = useRef({ user: false, pal: false, lastUser: 0 });
  const onMessage = useCallback((msg: AppMessage, receivedAt: number) => {
    if (!msg || typeof msg !== "object") return;
    const type: string = msg.event_type ?? "unknown";
    metrics.mark(type);
    switch (type) {
      case "conversation.user.stopped_speaking": metrics.onUserStopped(); talk.current.user = false; talk.current.lastUser = Date.now(); break;
      case "conversation.user.started_speaking": metrics.onUserStarted(); talk.current.user = true; break;
      case "conversation.replica.started_speaking":
      case "conversation.pal.started_speaking": metrics.onReplicaStarted(); talk.current.pal = true; break;
      case "conversation.replica.stopped_speaking":
      case "conversation.pal.stopped_speaking": talk.current.pal = false; break;
      case "system.shutdown": metrics.flag("shutdown", JSON.stringify(msg.properties ?? {}).slice(0, 200)); break;
      case "conversation.utterance": {
        const rawRole = msg.properties?.role ?? "?";
        const role = rawRole === "pal" ? "replica" : rawRole; // Tavus emits each PAL line twice, as "replica" and "pal"
        const text = String(msg.properties?.speech ?? msg.properties?.content ?? msg.properties?.text ?? "");
        if (!text) break;
        const prev = metrics.utterances.at(-1);
        if (prev && prev.role === role && prev.text === text) { metrics.flag("duplicate_utterance", `role ${rawRole}`); break; }
        metrics.utterances.push({ role, text, at: metrics.now() });
        setCaptions((c) => [...c.slice(-30), { role, text }]);
        const m = boardRef.current.model;
        if (role !== "user" && metrics.utterances.length > 1 && mentionsConnections(text) && (!m || m.edges.length === 0)) {
          metrics.flag("board_hallucination", `Said "${text.slice(0, 120)}" while the board had 0 connections`);
        }
        break;
      }
      case "conversation.tool_call": {
        const call = parseToolCall(msg);
        if (!call) { metrics.flag("unparsed_tool_call", JSON.stringify(msg).slice(0, 200)); break; }
        const send = sendRef.current;
        if (call.name === "read_board") {
          const out = SYNC_OFF ? "Board reading is disabled in this session. Rely on what you can see on the shared screen." : boardRef.current.text;
          if (call.id) send(toolResult(session.conversation_id, call.id, out));
          else {
            // Legacy inline tools have no tool_call_id: refresh context, then nudge the LLM.
            send(overwriteContext(session.conversation_id, `${baseContext}\n${out}`));
            send(respond(session.conversation_id, "(system: the board was just read; use the BOARD STATE in your context)"));
            metrics.flag("legacy_tool_path", "tool_call had no tool_call_id");
          }
        } else {
          if (call.name === "set_stage" && call.args.stage) { setStage(call.args.stage); stageLog.current.push({ stage: call.args.stage, at: metrics.now() }); }
          if (call.name === "show_list") {
            const kind = call.args.kind ?? (/requirement/i.test(call.args.title ?? "") ? "requirements" : "other");
            const next = { kind, title: kind === "requirements" ? "What we agreed" : call.args.title ?? "List", items: call.args.items ?? [], not_raised: call.args.not_raised ?? [] };
            // A newer requirements list replaces the old one, so the card never shows two versions.
            setLists((l) => [...l.filter((x) => kind !== "requirements" || x.kind !== "requirements"), next]);
          }
          if (call.name === "show_scorecard") setScorecard(call.args as Scorecard);
          if (call.name === "rubric_mark" && call.args.item) setRubric((r) => ({ ...r, [call.args.item]: { status: call.args.status, evidence: call.args.evidence ?? "" } }));
          if (call.id) send(toolResult(session.conversation_id, call.id, "shown"));
        }
        metrics.onTool(call.name, receivedAt);
        break;
      }
      default: {
        // Raven perception tool (reviewer-only attention signal). Never spoken, never scored.
        if (type.includes("perception_tool_call")) {
          const p: any = (msg as any).properties ?? {};
          let args: any = p.arguments ?? p.args ?? {};
          if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = { reason: args }; } }
          attention.current.push({ at: metrics.now(), reason: String(args.reason ?? p.name ?? "looked away") });
        }
      }
    }
    setTick((t) => t + 1);
  }, [metrics, session, baseContext]);

  const call = useTavusCall(onMessage);
  sendRef.current = call.send;

  useEffect(() => {
    const t = performance.now();
    call.join(session.conversation_url).then(() => { metrics.joinMs = Math.round(performance.now() - t); setJoinedAt(Date.now()); setTick((x) => x + 1); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushBoard = useCallback((elements: readonly BoardElement[]) => {
    const model = buildModel(elements);
    const fp = fingerprint(model);
    if (fp === boardRef.current.fp) return;
    const changes = diffModels(boardRef.current.model, model);
    const version = boardRef.current.version + 1;
    const at = new Date().toLocaleTimeString();
    const text = renderModel(model, { version, at });
    const ctx = [
      baseContext,
      "Candidate is drawing right now: stay silent until they speak.",
      text,
      changes.length ? `Changes since last update: ${changes.join("; ")}.` : "",
    ].filter(Boolean).join("\n");
    const sent = !SYNC_OFF && call.send(overwriteContext(session.conversation_id, ctx));
    boardRef.current = { model, text, version, fp, ctx, sent };
    setBoardText(text);
    if (sent) {
      metrics.onPush(version, new Blob([ctx]).size, changes);
      setTick((x) => x + 1);
    }
  }, [baseContext, call, metrics, session]);

  // Anything drawn before the call finished joining is sent as soon as it joins.
  useEffect(() => {
    const b = boardRef.current;
    if (call.state === "joined" && b.ctx && !b.sent && call.send(overwriteContext(session.conversation_id, b.ctx))) {
      b.sent = true;
      metrics.onPush(b.version, new Blob([b.ctx]).size, ["initial sync after join"]);
    }
  }, [call.state, call, metrics, session]);

  // Excalidraw calls onChange on every re-render (our 1 s clock included), so only real
  // element edits (a change in the sum of element versions) may reset the debounce.
  const lastSig = useRef("");
  // Latest scene, saved with the log so /review can show and download the final board as a picture.
  const sceneRef = useRef<readonly any[]>([]);
  const pushRef = useRef(pushBoard);
  pushRef.current = pushBoard;
  const onBoardChange = useCallback((elements: readonly any[]) => {
    const sig = `${elements.length}:${elements.reduce((a, e) => a + (e.version ?? 0), 0)}`;
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    sceneRef.current = elements;
    lastEdit.current = Date.now();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => pushRef.current(elements as BoardElement[]), DEBOUNCE_MS);
  }, []);
  const board = useMemo(
    () => (
      <Excalidraw
        onChange={onBoardChange}
        initialData={{ libraryItems: systemDesignLibrary(), appState: { openSidebar: { name: "default", tab: "library" } } as any }}
        UIOptions={{ canvasActions: { loadScene: false, export: false, saveToActiveFile: false } }}
      />
    ),
    [onBoardChange],
  );

  // End of call, tied to the call length setting:
  //   2 min left: Anna warns and invites the candidate to summarise what they built (skipped if the call is under 5 min).
  //   60 s left: silent evidence pass + scorecard; Anna keeps listening to the summary.
  //   25 s left: Anna thanks the candidate and closes.
  const endStep = useRef(0);
  useEffect(() => {
    if (!joinedAt || !session.max_seconds || call.state !== "joined") return;
    const left = session.max_seconds - Math.floor((now - joinedAt) / 1000);
    const b = boardRef.current;
    const say = (ctx: string, line?: string) => {
      call.send(overwriteContext(session.conversation_id, `${baseContext}\n${ctx}\n${b.text}`));
      if (line) call.send(echo(session.conversation_id, line));
    };
    // Wait for a pause (candidate and Anna both silent for ~1.5 s), but never later than 95 s left.
    const quiet = !talk.current.user && !talk.current.pal && Date.now() - talk.current.lastUser > 1500;
    if (endStep.current < 1 && left <= 120 && session.max_seconds >= 300 && (quiet || left <= 95)) {
      endStep.current = 1;
      say("TIME: about two minutes left. You have just told the candidate this and asked them to summarise what they built. Now listen. Do not interrupt, add ideas or ask new questions. A short acknowledgement is fine.",
        "Just a heads-up: we have about two minutes left. Could you use them to walk me through a quick summary of what you've built?");
      metrics.flag("summary_prompt", `${left}s left`);
    }
    if (endStep.current < 2 && left <= 60) {
      endStep.current = 2;
      // Evidence pass before the call ends: unmarked in-scope items otherwise count as "not observed".
      const unmarked = scopeOf(session.scope).items.filter((id) => !rubric[id]);
      const mark = unmarked.length ? `Silently call rubric_mark for each of these items you have not marked yet, using everything you saw including the summary (met, partial or missed): ${unmarked.join(", ")}. ` : "";
      say(`TIME: about one minute left. ${mark}Then call show_scorecard silently. Keep listening if the candidate is still summarising; do not speak until they finish or you are told time is up. Never share scores or a verdict.`);
      metrics.flag("wrap_up_nudge", `${left}s left`);
    }
    if (endStep.current < 3 && left <= 25) {
      endStep.current = 3;
      say("TIME: time is up. If show_scorecard has not been called, call it silently now. Thank the candidate in one sentence and say the hiring team will follow up. Never share scores or a verdict.",
        "That's time. Thank you.");
    }
  }, [now, joinedAt, session, call, baseContext, metrics, rubric]);

  const saving = useRef(false);
  async function saveLog() {
    if (saving.current) return;
    saving.current = true;
    const log = { conversation_id: session.conversation_id, prompt: session.prompt, board_sync: !SYNC_OFF, end_reason: call.endReason ?? "ended by candidate", candidate: session.name, saved_at: new Date().toISOString(), rubric, scope: session.scope ?? "full", rubric_score: scoreRubric(rubric, session.scope), scorecard: scorecard ?? null, stages: stageLog.current, attention: attention.current, lists, final_board: boardRef.current.text, final_scene: sceneRef.current.filter((e) => !e.isDeleted), ...metrics.toJSON() };
    const r = await fetch("/api/session-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(log) }).catch(() => null);
    setSavedLog(r && r.ok ? (await r.json()).saved : "not saved");
  }
  async function end() {
    await call.leave();
    await fetch(`/api/conversations/${session.conversation_id}/end`, { method: "POST" }).catch(() => {});
    await saveLog();
  }
  // If Tavus ends the call (time limit, timeout), still keep the log.
  useEffect(() => { if (call.state === "left") void saveLog(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [call.state]);

  function download() {
    const blob = new Blob([JSON.stringify({ conversation_id: session.conversation_id, ...metrics.toJSON() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `session-${session.conversation_id}.json`; a.click();
  }

  const s = metrics.summary();
  void tick;
  const stageIdx = STAGES.findIndex(([k]) => k === stage);
  const remaining = joinedAt && session.max_seconds ? Math.max(0, session.max_seconds - Math.floor((now - joinedAt) / 1000)) : undefined;
  const marked = Object.keys(rubric).length;

  return (
    <div className="room">
      <section className="board">
        {board}
      </section>
      <aside className="side">
        <div className="videos">
          <Video track={call.remoteVideo} className="pal" />
          <Video track={call.localVideo} muted className="me" />
          <Audio track={call.remoteAudio} />
          {call.state !== "joined" && <div className="overlay">{call.state === "error" ? call.error : call.state === "left" ? "Call ended" : "Connecting…"}</div>}
        </div>
        {call.state === "joined" && remaining !== undefined && session.max_seconds && session.max_seconds >= 300 && remaining <= 120 && (
          <div className={`timebar ${remaining <= 25 ? "end" : ""}`} role="status">
            <b>⏱ {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} left</b>
            <span>{remaining <= 25 ? "Time's up. Thank you!" : "Summarize what you've built: walk the board end to end."}</span>
          </div>
        )}
        <div className="controls">
          <span className="prompt-title">{session.surprise && call.state !== "left" ? "Question: listen to the interviewer" : session.prompt}{SYNC_OFF && <em className="off"> · board sync OFF (control run)</em>}</span>
          {call.state === "joined" && <span className={`clock ${remaining !== undefined && remaining < 60 ? "low" : ""}`}>{remaining === undefined ? "" : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} left`}</span>}
        </div>
        <div className="controls">
          {call.state === "joined" && <button onClick={call.toggleShare}>{call.sharing ? "Stop sharing" : "Share screen"}</button>}
          {call.state !== "left" ? <button onClick={end}>End interview</button> : <button onClick={onExit}>New interview</button>}
        </div>
        {call.endReason && <p className="err">{call.endReason}{savedLog ? ` Log saved: ${savedLog}` : ""}</p>}

        {call.state === "left" && !REVIEWER_LIVE && (
          <div className="card done-card">
            <h3>Thank you{session.name ? `, ${session.name}` : ""}. Your interview is complete.</h3>
            <p className="hint">It has been submitted to the hiring team, who will review it and follow up with next steps. You can close this tab.</p>
          </div>
        )}

        {REVIEWER_LIVE && <>
        <p className="reviewer-tag">Reviewer view (live)</p>
        <ol className="stages">
          {STAGES.map(([k, label], i) => <li key={k} className={i < stageIdx ? "done" : i === stageIdx ? "now" : ""}>{label}</li>)}
        </ol>

        {call.state === "left" && (() => {
          const r = scoreRubric(rubric, session.scope);
          return (
            <div className="card score">
              <h3>Results: {r.pct}% of rubric · {r.verdict}</h3>
              <table className="rubric"><tbody>
                {r.stages.filter((x) => x.in_scope).map((x) => (
                  <tr key={x.stage}><td>{x.stage.replace(/_/g, " ")}</td><td className="bar">{"▇".repeat(Math.round((x.pct ?? 0) / 20))}{"▁".repeat(5 - Math.round((x.pct ?? 0) / 20))}</td><td>{x.got}/{x.max}</td></tr>
                ))}
              </tbody></table>
              {r.unseen.length ? <><h4>Not shown in this session</h4><ul>{r.unseen.map((t) => <li key={t}>{t}</li>)}</ul></> : null}
              <p className="hint">Scored from the interviewer's rubric marks: met = 1, partial = ½, missed or unseen = 0.</p>
            </div>
          );
        })()}

        {scorecard && (
          <div className="card score">
            <h3>Scorecard: {scorecard.verdict}</h3>
            <table><tbody>
              {(["navigation", "design", "depth", "communication"] as const).map((k) => (
                <tr key={k}><td>{k}</td><td className="bar">{"▇".repeat(scorecard[k] || 0)}{"▁".repeat(4 - (scorecard[k] || 0))}</td><td>{scorecard[k]}/4</td></tr>
              ))}
            </tbody></table>
            {scorecard.strengths?.length ? <><h4>Strengths</h4><ul>{scorecard.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null}
            <h4>Fix next</h4><ul>{scorecard.fixes?.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}

        </>}

        {lists.slice().reverse().map((l, i) => (
          <div className={`card list-card ${l.kind}`} key={i}>
            <h3>{l.title}</h3>
            {l.kind === "requirements" && <p className="list-sub">From what you said. A tick means it's also on your board.</p>}
            <ul>{l.items.map((x, j) => {
              const written = l.kind === "requirements" && onBoard(x, boardRef.current.text);
              return <li key={j} className={written ? "on-board" : ""}>{l.kind === "requirements" && <span className="tick" title={written ? "on your board" : "said aloud, not on the board yet"}>{written ? "✓" : "○"}</span>}{x}</li>;
            })}</ul>
            {REVIEWER_LIVE && l.not_raised.length > 0 && <div className="gaps"><span className="reviewer-tag">reviewer</span> Not raised by candidate: {l.not_raised.join("; ")}</div>}
          </div>
        ))}

        {REVIEWER_LIVE && <>
        <details className="card">
          <summary>Rubric ({marked}/{RUBRIC.length} observed)</summary>
          <table className="rubric"><tbody>
            {RUBRIC.map((r) => {
              const m = rubric[r.id];
              return (
                <tr key={r.id} title={m?.evidence ?? ""}>
                  <td className={`mark ${m?.status ?? ""}`}>{m ? (m.status === "met" ? "✓" : m.status === "partial" ? "◐" : "✗") : "·"}</td>
                  <td>{r.text}{m?.evidence ? <div className="hint">{m.evidence}</div> : null}</td>
                </tr>
              );
            })}
          </tbody></table>
        </details>

        <details className="card" open>
          <summary>What the interviewer knows about your board</summary>
          <pre>{boardText}</pre>
        </details>

        <details className="card">
          <summary>Latency and health ({s.turns} turns)</summary>
          <table className="metrics"><tbody>
            <tr><td>Create conversation (API)</td><td>{s.createMs ?? "–"} ms</td></tr>
            <tr><td>Join call (WebRTC)</td><td>{s.joinMs ?? "–"} ms</td></tr>
            <tr><td>Click to first words</td><td>{s.firstWordsMs ?? "–"} ms</td></tr>
            <tr><td>Turn latency p50 / p90 / max</td><td>{s.p50 ?? "–"} / {s.p90 ?? "–"} / {s.max ?? "–"} ms</td></tr>
            <tr><td>Board pushes</td><td>{metrics.pushes.length}</td></tr>
            <tr><td>Tool calls</td><td>{metrics.tools.map((t) => t.name).join(", ") || "–"}</td></tr>
            <tr><td>Flags</td><td>{metrics.flags.length ? metrics.flags.map((f) => f.kind).join(", ") : "none"}</td></tr>
          </tbody></table>
          <button onClick={download}>Download session log</button>
          {savedLog && <p className="hint">Saved: {savedLog}</p>}
        </details>

        <details className="card">
          <summary>Captions</summary>
          <div className="captions">{captions.map((c, i) => <p key={i} className={c.role}><b>{c.role === "user" ? "You" : "Interviewer"}:</b> {c.text}</p>)}</div>
        </details>
        </>}
      </aside>
    </div>
  );
}
