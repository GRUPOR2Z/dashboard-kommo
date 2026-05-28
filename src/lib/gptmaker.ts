import { supabase } from "./supabaseClient";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gptmaker-proxy`;

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function gptGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString(), { headers: await authHeader() });
  if (!res.ok) throw new Error(`Agente IA ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export interface GptInteraction {
  id: string;
  agentId: string;
  agentName: string;
  chatId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  channelType: string;
  status: "RUNNING" | "WAITING" | "RESOLVED";
  startAt: number;
  transferAt: number | null;
  resolvedAt: number | null;
  protocol: string;
  // Optional fields returned by some workspace configs
  credits?: number;
  messages?: number;
  channelId?: string;
}

export interface GptInteractionsResponse {
  data: GptInteraction[];
  count: number;
  pages: number;
  page: number;
  pageSize: number;
}

// ── Credits / Reports ─────────────────────────────────────────────────────────
export interface GptCreditsReport {
  totalCredits?: number;
  credits?: number;
  totalCost?: number;
  cost?: number;
  contacts?: number;
  interactions?: number;
  creditsPerModel?: Array<{ model: string; credits: number; interactions: number }>;
  creditsPerChannel?: Array<{ channel: string; channelId: string; credits: number }>;
  // catch-all for different API versions
  [key: string]: unknown;
}

export async function fetchWorkspaceReports(
  workspaceId: string,
  from?: number,
  to?: number
): Promise<GptCreditsReport> {
  const params: Record<string, string | number> = {};
  if (from !== undefined) params.from = from;
  if (to !== undefined) params.to = to;
  return gptGet<GptCreditsReport>(`/v2/workspace/${workspaceId}/reports`, params);
}

// ── Interactions ──────────────────────────────────────────────────────────────
export async function fetchInteractions(
  workspaceId: string,
  page = 1,
  pageSize = 100
): Promise<GptInteractionsResponse> {
  return gptGet<GptInteractionsResponse>(
    `/v2/workspace/${workspaceId}/interactions`,
    { page, pageSize }
  );
}

export async function fetchAllInteractions(workspaceId: string): Promise<GptInteraction[]> {
  const first = await fetchInteractions(workspaceId, 1, 100);
  if (!first?.data || !Array.isArray(first.data)) return [];
  const all = [...first.data];
  const totalPages = first.pages ?? 1;
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        fetchInteractions(workspaceId, i + 2, 100).then((r) => r.data ?? [])
      )
    );
    all.push(...rest.flat());
  }
  return all;
}
