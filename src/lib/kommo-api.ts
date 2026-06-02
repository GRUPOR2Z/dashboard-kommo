import type { KommoLead, KommoPipeline, FilterPeriod, StatusEvent, KommoNote } from "./types";
import { supabase } from "./supabaseClient";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kommo-proxy`;

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function kommoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeader() });
  if (res.status === 204 || res.status === 404) return { _embedded: {} } as T;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kommo API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function patchLeads(updates: { id: number; status_id: number }[]): Promise<void> {
  const res = await fetch(`${BASE}/leads`, {
    method: "PATCH",
    headers: await authHeader(),
    body: JSON.stringify(updates),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Kommo PATCH ${res.status}: ${text.slice(0, 200)}`);
  }
}

// ── Account (test connection) ────────────────────────────────────────────────
export async function testConnection() {
  const data = await kommoGet<{ id: number; name: string; subdomain: string }>(
    "/account"
  );
  return { success: true, account: data };
}

// ── Pipelines ────────────────────────────────────────────────────────────────
export async function fetchPipelines(): Promise<KommoPipeline[]> {
  const data = await kommoGet<{ _embedded?: { pipelines?: KommoPipeline[] } }>(
    "/leads/pipelines?with=statuses"
  );
  return data._embedded?.pipelines ?? [];
}

// ── All leads from a pipeline ─────────────────────────────────────────────────
export async function fetchLeadsByPipeline(pipelineId: number): Promise<KommoLead[]> {
  const all: KommoLead[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await kommoGet<{ _embedded?: { leads?: KommoLead[] } }>(
      `/leads?filter[pipeline_id]=${pipelineId}&limit=250&page=${page}&with=contacts`
    );
    const leads = data._embedded?.leads ?? [];
    if (leads.length === 0) break;
    all.push(...leads);
    if (all.length >= 5000) break;
  }
  return all;
}

// ── Status changed events (for follow-up reactivation tracking) ──────────────
export async function fetchStatusEvents(
  dateFrom: number,
  dateTo: number
): Promise<StatusEvent[]> {
  const all: StatusEvent[] = [];

  for (let page = 1; page <= 20; page++) {
    const data = await kommoGet<{
      _embedded?: { events?: Array<Record<string, unknown>> };
    }>(
      `/events?filter[type][]=lead_status_changed&filter[created_at][from]=${dateFrom}&filter[created_at][to]=${dateTo}&limit=250&page=${page}`
    );
    const evts = data._embedded?.events ?? [];
    if (evts.length === 0) break;

    for (const e of evts) {
      const after = (e.value_after as Array<{ lead_status?: { id: number; pipeline_id: number } }>)?.[0]?.lead_status;
      const before = (e.value_before as Array<{ lead_status?: { id: number; pipeline_id: number } }>)?.[0]?.lead_status;
      if (!after || !before) continue;
      all.push({
        id: e.id as string,
        lead_id: e.entity_id as number,
        created_at: e.created_at as number,
        status_before: before.id,
        status_after: after.id,
        pipeline_id: after.pipeline_id,
        pipeline_id_before: before.pipeline_id,
      });
    }

    if (all.length >= 10000) break;
  }

  return all;
}

// ── Chat conversations via Talks API (Kommo inbox) ────────────────────────────
export async function fetchChatLeadIds(from: number, to: number): Promise<Set<number>> {
  const ids = new Set<number>();

  // Talks = Kommo inbox conversations. Filter by last_modified in period.
  for (let page = 1; page <= 40; page++) {
    const data = await kommoGet<{
      _embedded?: { talks?: Array<{ entity_id?: number; entity_type?: string; last_modified?: number }> };
    }>(`/talks?filter[last_modified][from]=${from}&filter[last_modified][to]=${to}&limit=250&page=${page}`);
    const talks = data._embedded?.talks ?? [];
    if (talks.length === 0) break;
    for (const t of talks) {
      if (t.entity_id && t.entity_type === "leads") ids.add(t.entity_id);
    }
    if (ids.size >= 5000) break;
  }

  if (ids.size > 0) return ids;

  // Fallback: events endpoint
  const eventTypes = "filter[type][]=incoming_chat_message&filter[type][]=outgoing_chat_message";
  for (let page = 1; page <= 40; page++) {
    const data = await kommoGet<{
      _embedded?: { events?: Array<{ entity_id?: number }> };
    }>(`/events?${eventTypes}&filter[created_at][from]=${from}&filter[created_at][to]=${to}&limit=250&page=${page}`);
    const evts = data._embedded?.events ?? [];
    if (evts.length === 0) break;
    for (const e of evts) if (e.entity_id) ids.add(e.entity_id);
    if (ids.size >= 5000) break;
  }

  return ids;
}

// ── Lead notes ───────────────────────────────────────────────────────────────
export async function fetchLeadNotes(leadId: number): Promise<KommoNote[]> {
  const all: KommoNote[] = [];
  for (let page = 1; page <= 5; page++) {
    const data = await kommoGet<{ _embedded?: { notes?: KommoNote[] } }>(
      `/leads/${leadId}/notes?limit=50&page=${page}&order[created_at]=asc`
    );
    const notes = data._embedded?.notes ?? [];
    if (notes.length === 0) break;
    all.push(...notes);
  }
  return all;
}

// ── Notes sample for response-time metric (parallel, 1 page each) ────────────
export async function fetchNotesSample(
  leadIds: number[],
  notesPerLead = 20
): Promise<Map<number, KommoNote[]>> {
  const ids = leadIds.slice(0, 15);
  const map = new Map<number, KommoNote[]>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const data = await kommoGet<{ _embedded?: { notes?: KommoNote[] } }>(
          `/leads/${id}/notes?limit=${notesPerLead}&page=1&order[created_at]=asc`
        );
        map.set(id, data._embedded?.notes ?? []);
      } catch {
        map.set(id, []);
      }
    })
  );
  return map;
}

// ── Custom fields discovery ───────────────────────────────────────────────────
export async function fetchCustomFields(): Promise<
  Array<{ id: number; name: string; type: string }>
> {
  const data = await kommoGet<{
    _embedded?: { custom_fields?: Array<{ id: number; name: string; type: string }> };
  }>("/leads/custom_fields");
  return data._embedded?.custom_fields ?? [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function getFieldValue(lead: KommoLead, fieldId: number): string | null {
  const field = lead.custom_fields_values?.find((f) => f.field_id === fieldId);
  return field?.values?.[0]?.value ?? null;
}

export function periodTimestamps(
  period: FilterPeriod,
  customDates?: { from: number; to: number }
): { from: number; to: number } {
  if (period === "custom" && customDates) return customDates;

  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);

  switch (period) {
    case "hoje":
      return { from: Math.floor(todayStart / 1000), to: Math.floor(now / 1000) };
    case "ontem": {
      const start = todayStart - 86400000;
      return { from: Math.floor(start / 1000), to: Math.floor(todayStart / 1000) - 1 };
    }
    case "7d":
      return {
        from: Math.floor((todayStart - 7 * 86400000) / 1000),
        to: Math.floor(now / 1000),
      };
    case "30d":
      return {
        from: Math.floor((todayStart - 30 * 86400000) / 1000),
        to: Math.floor(now / 1000),
      };
    default:
      return {
        from: Math.floor((todayStart - 365 * 86400000) / 1000),
        to: Math.floor(now / 1000),
      };
  }
}

export function leadInPeriod(
  lead: KommoLead,
  period: FilterPeriod,
  customDates?: { from: number; to: number }
): boolean {
  if (period === "todos") return true;
  const { from, to } = periodTimestamps(period, customDates);
  return lead.created_at >= from && lead.created_at <= to;
}
