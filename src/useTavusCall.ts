import { useCallback, useEffect, useRef, useState } from "react";
import Daily, { type DailyCall } from "@daily-co/daily-js";
import type { AppMessage } from "./tavus/protocol";

export type CallState = "idle" | "joining" | "joined" | "left" | "error";

/** Joins the Tavus conversation with a Daily call object so we own the layout
 *  (video beside the board) instead of the stock iframe. */
export function useTavusCall(onMessage: (msg: AppMessage, receivedAt: number) => void) {
  const callRef = useRef<DailyCall | null>(null);
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string>();
  const [remoteVideo, setRemoteVideo] = useState<MediaStreamTrack>();
  const [remoteAudio, setRemoteAudio] = useState<MediaStreamTrack>();
  const [localVideo, setLocalVideo] = useState<MediaStreamTrack>();
  const [sharing, setSharing] = useState(false);
  const [endReason, setEndReason] = useState<string>();
  const leavingOnPurpose = useRef(false);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  const join = useCallback(async (url: string) => {
    setState("joining");
    const call = Daily.createCallObject({ subscribeToTracksAutomatically: true });
    callRef.current = call;
    call.on("app-message", (ev) => handler.current(ev?.data, performance.now()));
    call.on("track-started", (ev) => {
      const p = ev?.participant;
      const t = ev?.track;
      if (!p || !t) return;
      if (p.local && t.kind === "video") setLocalVideo(t);
      if (!p.local && t.kind === "video") setRemoteVideo(t);
      if (!p.local && t.kind === "audio") setRemoteAudio(t);
    });
    call.on("left-meeting", () => {
      if (!leavingOnPurpose.current) setEndReason((r) => r ?? "The call was closed by Tavus (time limit or timeout).");
      setState("left");
    });
    call.on("participant-left", (ev) => {
      if (!ev?.participant?.local && !leavingOnPurpose.current) setEndReason((r) => r ?? "The interviewer left the call (time limit or timeout).");
    });
    call.on("local-screen-share-started", () => setSharing(true));
    call.on("local-screen-share-stopped", () => setSharing(false));
    call.on("error", (ev) => { setError(ev?.errorMsg ?? "call error"); setState("error"); });
    await call.join({ url, startVideoOff: false, startAudioOff: false });
    setState("joined");
  }, []);

  const send = useCallback((msg: AppMessage) => {
    const c = callRef.current;
    if (!c || c.meetingState() !== "joined-meeting") return false;
    c.sendAppMessage(msg, "*");
    return true;
  }, []);

  const toggleShare = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    if (c.participants().local?.screen) c.stopScreenShare(); else c.startScreenShare();
  }, []);

  const leave = useCallback(async () => {
    leavingOnPurpose.current = true;
    const c = callRef.current;
    callRef.current = null;
    if (c) { await c.leave().catch(() => {}); await c.destroy().catch(() => {}); }
    setState("left");
  }, []);

  useEffect(() => () => { void callRef.current?.destroy(); }, []);
  return { state, error, join, send, leave, remoteVideo, remoteAudio, localVideo, sharing, toggleShare, endReason, setEndReason };
}
