// Tavus CVI Interactions Protocol helpers (sent/received over the Daily data channel).
// The docs and the official skills repo disagree on some shapes, so parsing is defensive
// and every unknown event is logged for the feedback doc.

export type AppMessage = Record<string, any>;

export const overwriteContext = (conversationId: string, context: string): AppMessage => ({
  message_type: "conversation",
  event_type: "conversation.overwrite_llm_context",
  conversation_id: conversationId,
  properties: { context },
});

export const toolResult = (conversationId: string, toolCallId: string, output: string, status: "success" | "error" = "success"): AppMessage => ({
  message_type: "conversation",
  event_type: "conversation.tool_result",
  conversation_id: conversationId,
  properties: { tool_call_id: toolCallId, output, status },
});

export const respond = (conversationId: string, text: string): AppMessage => ({
  message_type: "conversation",
  event_type: "conversation.respond",
  conversation_id: conversationId,
  properties: { text },
});

// The replica speaks this text word for word (no LLM turn). Used for fixed time cues.
export const echo = (conversationId: string, text: string): AppMessage => ({
  message_type: "conversation",
  event_type: "conversation.echo",
  conversation_id: conversationId,
  properties: { modality: "text", text },
});

export interface ParsedToolCall {
  name: string;
  args: Record<string, any>;
  id?: string;
}

/** Accepts the docs shape (properties.name / arguments string / tool_call_id),
 *  the event-schema shape (function.name / function.arguments), and the skills-repo
 *  shape (properties.tool_name / arguments object). */
export function parseToolCall(msg: AppMessage): ParsedToolCall | null {
  if (msg?.event_type !== "conversation.tool_call") return null;
  const p = msg.properties ?? {};
  const fn = msg.function ?? p.function ?? {};
  const rawName: string | undefined = p.name ?? p.tool_name ?? fn.name;
  if (!rawName) return null;
  // The Tavus dashboard's "upgrade tools" renames clashing tools to <name>_legacy; accept that too.
  const name = rawName.replace(/_legacy$/, "");
  let raw = p.arguments ?? fn.arguments ?? {};
  let args: Record<string, any> = {};
  if (typeof raw === "string") {
    try { args = raw.trim() ? JSON.parse(raw) : {}; } catch { args = {}; }
  } else if (raw && typeof raw === "object") args = raw;
  const id = p.tool_call_id ?? msg.tool_call_id ?? fn.id ?? p.id;
  return { name, args, id };
}
