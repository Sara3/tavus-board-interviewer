// One-screen architecture slide for the Loom: open http://localhost:5173/architecture
type BoxProps = { x: number; y: number; w: number; h: number; title: string; sub?: string; tone?: "a" | "b" | "c" };
function Box({ x, y, w, h, title, sub, tone = "a" }: BoxProps) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} className={`ab ab-${tone}`} />
      <text x={x + 18} y={y + (sub ? 34 : h / 2 + 7)} className="at">{title}</text>
      {sub && <text x={x + 18} y={y + 60} className="as">{sub}</text>}
    </g>
  );
}
// Arrow label with an optional numbered step badge, so the Loom can narrate the flow 1 → 6.
function Label({ x, y, children, anchor = "middle", n }: { x: number; y: number; children: string; anchor?: "start" | "middle" | "end"; n?: number }) {
  const w = children.length * 7.8;
  const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  const tx = n ? left + 13 : left;
  return (
    <g>
      {n && <><circle cx={left - 2} cy={y - 5} r={11} className="step" /><text x={left - 2} y={y - 1} textAnchor="middle" className="stepn">{n}</text></>}
      <text x={tx} y={y} className="al">{children}</text>
    </g>
  );
}
function ColHead({ x, y, label, tone }: { x: number; y: number; label: string; tone: string }) {
  return <g><rect x={x} y={y - 13} width={14} height={14} rx={4} className={`dot dot-${tone}`} /><text x={x + 24} y={y} className="ach">{label}</text></g>;
}

export function Architecture() {
  const gaps = [
    ["Vision misreads the board", "board sent as text (scene graph)"],
    ["Long lists read aloud", "show_list renders on screen"],
    ["Re-asks while candidate draws", "idle off + “silence is work”"],
    ["Brief leaks into answers", "private brief; card = candidate’s words"],
  ];
  return (
    <main className="arch">
      <svg viewBox="0 0 1600 900" role="img" aria-label="Board Interviewer architecture">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="ahd" /></marker>
        </defs>
        <rect x={40} y={34} width={36} height={36} rx={9} className="dot dot-b" /><text x={58} y={60} textAnchor="middle" className="logo">◧</text>
        <text x={90} y={63} className="ah1">Board Interviewer <tspan className="ah1l">· architecture</tspan></text>
        <text x={40} y={104} className="asub">AI first-round system design screen on Tavus CVI. The interviewer reads the whiteboard as data, not pixels.</text>

        {/* columns */}
        <rect x={30} y={130} width={520} height={560} rx={18} className="col" /><ColHead x={52} y={168} label="Candidate browser" tone="a" />
        <rect x={610} y={130} width={460} height={560} rx={18} className="col" /><ColHead x={632} y={168} label="Tavus CVI" tone="b" />
        <rect x={1130} y={130} width={440} height={560} rx={18} className="col" /><ColHead x={1152} y={168} label="Server + hiring team" tone="c" />

        <Box x={60} y={190} w={400} h={80} title="Excalidraw board" sub="boxes, arrows, labels, 21 library pieces" />
        <Box x={60} y={310} w={400} h={80} title="Board serializer" sub="scene graph → BOARD STATE text + diff" />
        <Box x={60} y={430} w={400} h={80} title="Call UI (daily-js)" sub="video, “What we agreed” card, countdown" />
        <Box x={60} y={550} w={400} h={80} title="Session recorder (hidden)" sub="rubric, scorecard, transcript, latency" />

        <g>
          <rect x={650} y={190} width={390} height={440} rx={12} className="ab ab-b" />
          <text x={668} y={226} className="at">PAL “Anna”</text>
          {[["Turn taking", "Sparrow-2 · patience high · idle off"], ["Brain", "LLM + system prompt (neutral screener)"], ["Guardrails ×4", "no answers · board truth only ·"], ["", "no framework penalty · no rubric leak"], ["Tools", "read_board · show_list · rubric_mark ·"], ["", "set_stage · show_scorecard"], ["Perception", "Raven-2 · face + voice"], ["Per call", "custom_greeting · max_call_duration"]].map(([k, v], i) => (
            <g key={i}><text x={668} y={268 + i * 44} className="ak">{k}</text><text x={668} y={268 + i * 44 + (k ? 20 : 0)} className="as">{v}</text></g>
          ))}
        </g>

        <Box x={1160} y={190} w={380} h={80} title="npm run setup" sub="PAL, tools, guardrails as code" tone="c" />
        <Box x={1160} y={310} w={380} h={80} title="Express server" sub="API key server-side · session logs" tone="c" />
        <Box x={1160} y={430} w={380} h={80} title="Reviewer page /review" sub="rubric + evidence, gaps, board, p50/p90" tone="c" />

        {/* arrows */}
        <line x1={260} y1={270} x2={260} y2={308} className="ar" markerEnd="url(#ah)" /><Label x={290} y={295} anchor="start" n={1}>onChange (debounced)</Label>
        <line x1={460} y1={335} x2={648} y2={335} className="ar" markerEnd="url(#ah)" /><Label x={554} y={325} n={2}>overwrite_llm_context</Label>
        <line x1={648} y1={372} x2={462} y2={372} className="ar" markerEnd="url(#ah)" markerStart="url(#ah)" /><Label x={554} y={362} n={3}>read_board ⇄ result</Label>
        <line x1={648} y1={455} x2={462} y2={455} className="ar" markerEnd="url(#ah)" /><Label x={554} y={445} n={4}>show_list</Label>
        <line x1={462} y1={492} x2={648} y2={492} className="ar dash" markerEnd="url(#ah)" markerStart="url(#ah)" /><Label x={554} y={482}>WebRTC audio/video</Label>
        <line x1={648} y1={590} x2={462} y2={590} className="ar" markerEnd="url(#ah)" /><Label x={554} y={580} n={5}>rubric_mark</Label>
        <line x1={1158} y1={230} x2={1042} y2={230} className="ar" markerEnd="url(#ah)" /><Label x={1100} y={220}>create PAL</Label>
        <line x1={1158} y1={335} x2={1042} y2={335} className="ar" markerEnd="url(#ah)" /><Label x={1100} y={325}>start call</Label>
        <polyline points="260,630 260,665 1100,665 1100,375 1158,375" className="ar" fill="none" markerEnd="url(#ah)" /><Label x={850} y={656} n={6}>session log at call end</Label>
        <line x1={1350} y1={390} x2={1350} y2={428} className="ar" markerEnd="url(#ah)" /><Label x={1362} y={415} anchor="start">session-logs/*.json</Label>

        {/* gap -> fix strip */}
        <text x={40} y={738} className="ach">Customer gap → fix in this app</text>
        {gaps.map(([g, f], i) => (
          <g key={i}>
            <rect x={30 + i * 388} y={756} width={370} height={96} rx={12} className="gap" />
            <circle cx={58 + i * 388} cy={786} r={12} className="okc" /><text x={58 + i * 388} y={791} textAnchor="middle" className="okt">✓</text>
            <text x={80 + i * 388} y={792} className="gt">{g}</text>
            <text x={80 + i * 388} y={826} className="gf">{f}</text>
          </g>
        ))}
        <text x={1570} y={885} textAnchor="end" className="as">Candidate never sees scores. Length + scope are settings: 8 min demo = requirements + high-level design; 30–45 min = full interview.</text>
      </svg>
    </main>
  );
}
