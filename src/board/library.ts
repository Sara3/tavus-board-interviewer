// Pre-drawn system design components for the Excalidraw library sidebar.
// Each item carries customData.kind, so the board serializer knows a "Database" is a database
// even after the candidate relabels it (e.g. "Postgres (orders)").
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

type Shape = "rectangle" | "ellipse" | "diamond";
const COMPONENTS: { kind: string; label: string; shape: Shape; bg: string; w?: number; h?: number }[] = [
  { kind: "client", label: "Client", shape: "rectangle", bg: "#e7f5ff" },
  { kind: "cdn", label: "CDN", shape: "ellipse", bg: "#e7f5ff" },
  { kind: "load_balancer", label: "Load Balancer", shape: "diamond", bg: "#fff4e6", w: 170, h: 100 },
  { kind: "api_gateway", label: "API Gateway", shape: "rectangle", bg: "#fff4e6" },
  { kind: "service", label: "Service", shape: "rectangle", bg: "#ebfbee" },
  { kind: "worker", label: "Worker", shape: "rectangle", bg: "#ebfbee" },
  { kind: "llm_agent", label: "LLM / Agent", shape: "rectangle", bg: "#f3f0ff" },
  { kind: "queue", label: "Queue", shape: "rectangle", bg: "#fff9db", w: 200, h: 50 },
  { kind: "stream", label: "Event Stream", shape: "rectangle", bg: "#fff9db", w: 200, h: 50 },
  { kind: "cache", label: "Cache", shape: "rectangle", bg: "#ffe3e3" },
  { kind: "database", label: "Database", shape: "ellipse", bg: "#e6fcf5", w: 150, h: 90 },
  { kind: "object_storage", label: "Object Storage", shape: "rectangle", bg: "#e6fcf5" },
  { kind: "search_index", label: "Search Index", shape: "rectangle", bg: "#e6fcf5" },
  { kind: "scheduler", label: "Scheduler / Cron", shape: "rectangle", bg: "#f8f0fc" },
  { kind: "external_api", label: "External API", shape: "rectangle", bg: "#f1f3f5" },
  { kind: "billing_api", label: "Billing API", shape: "rectangle", bg: "#f1f3f5" },
  { kind: "crm", label: "CRM", shape: "rectangle", bg: "#f1f3f5" },
  { kind: "notification_provider", label: "Email / SMS Provider", shape: "rectangle", bg: "#f1f3f5" },
  { kind: "consent_store", label: "Consent / Preferences", shape: "ellipse", bg: "#e6fcf5", w: 170, h: 90 },
  { kind: "rules_engine", label: "Offer / Rules Engine", shape: "rectangle", bg: "#f3f0ff" },
  { kind: "human_handoff", label: "Human Agent Queue", shape: "rectangle", bg: "#ffe8cc" },
];

export const KIND_LABEL: Record<string, string> = Object.fromEntries(COMPONENTS.map((c) => [c.kind, c.label.toLowerCase()]));

export function systemDesignLibrary() {
  const now = Date.now();
  return COMPONENTS.map((c, i) => ({
    id: `sd-${c.kind}`,
    status: "published" as const,
    created: now - i,
    name: c.label,
    elements: convertToExcalidrawElements([
      {
        type: c.shape,
        x: 0,
        y: 0,
        width: c.w ?? 160,
        height: c.h ?? 70,
        backgroundColor: c.bg,
        fillStyle: "solid",
        roundness: c.shape === "rectangle" ? { type: 3 } : null,
        customData: { kind: c.kind },
        label: { text: c.label, fontSize: 18 },
      } as any,
    ]),
  }));
}
