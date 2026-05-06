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
}

export interface GptInteractionsResponse {
  data: GptInteraction[];
  count: number;
  pages: number;
  page: number;
  pageSize: number;
}

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
  const all = [...first.data];
  const totalPages = first.pages;

  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        fetchInteractions(workspaceId, i + 2, 100).then((r) => r.data)
      )
    );
    all.push(...rest.flat());
  }

  return all;
}
