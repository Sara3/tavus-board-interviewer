import { useEffect, useRef, useState } from "react";
import { Excalidraw, convertToExcalidrawElements, exportToBlob, exportToSvg } from "@excalidraw/excalidraw";

// The candidate's final board as a picture, rebuilt from the saved scene (not a screen grab).
export function sceneOf(d: any): any[] | null {
  const s = d?.final_scene;
  if (!Array.isArray(s) || !s.length) return null;
  return d.final_scene_skeleton ? convertToExcalidrawElements(s, { regenerateIds: false }) : s;
}
const EXPORT = { exportBackground: true, viewBackgroundColor: "#ffffff" };

export function BoardSnapshot({ d, file }: { d: any; file: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [els, setEls] = useState<any[] | null>(null);
  useEffect(() => { try { setEls(sceneOf(d)); } catch { setEls(null); } }, [d]);
  useEffect(() => {
    const box = ref.current;
    if (!box || !els) return;
    let live = true;
    exportToSvg({ elements: els, appState: EXPORT, files: null, exportPadding: 24 }).then((svg: SVGSVGElement) => {
      if (!live) return;
      svg.removeAttribute("width"); svg.removeAttribute("height");
      box.replaceChildren(svg);
    });
    return () => { live = false; };
  }, [els]);

  async function download() {
    if (!els) return;
    const blob = await exportToBlob({ elements: els, appState: EXPORT, files: null, exportPadding: 24, mimeType: "image/png", getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }) });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `final-board-${(d.candidate || "candidate").toLowerCase()}-${file.replace(/\.json$/, "")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!els) return <p className="empty">No picture saved for this session (recorded before board pictures were added). The text version is below.</p>;
  return (
    <>
      <div className="snap" ref={ref} />
      <div className="snap-actions">
        <button className="ghost" onClick={download}>Download PNG</button>
        <a className="ghost" href={`/board/${encodeURIComponent(file)}`} target="_blank" rel="noreferrer">Open board ↗</a>
      </div>
    </>
  );
}

// Read-only full-screen board for one session: /board/<file>. Zoom and pan, no editing.
export function BoardView({ file }: { file: string }) {
  const [d, setD] = useState<any>();
  const [err, setErr] = useState<string>();
  useEffect(() => { fetch(`/api/sessions/${encodeURIComponent(file)}`).then((r) => (r.ok ? r.json() : Promise.reject(r.statusText))).then(setD).catch((e) => setErr(String(e))); }, [file]);
  if (err) return <main className="lobby"><p className="err">Board not found.</p></main>;
  if (!d) return null;
  const els = sceneOf(d);
  return (
    <div className="boardview">
      <header className="rv-top">
        <div className="brand"><span className="brand-mark">◧</span> Final board · {d.candidate || "Unnamed"}{d.sample ? " · Sample" : ""}</div>
        <a className="chip muted" href="/review">Back to review</a>
      </header>
      {els ? <div className="boardview-canvas"><Excalidraw initialData={{ elements: els, scrollToContent: true, appState: { viewModeEnabled: true } as any }} viewModeEnabled UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }} /></div>
        : <pre className="board" style={{ margin: 24 }}>{d.final_board}</pre>}
    </div>
  );
}
