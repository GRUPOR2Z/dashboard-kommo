import type { KommoLead, FilterPeriod, StatusEvent } from "./types";
import type { PipelineConfig, FieldConfig } from "./config";
import { getFieldValue, leadInPeriod, periodTimestamps } from "./kommo-api";

// Funil stages in order (for visualization)
export const FUNIL_STAGES = [
  { key: "LEADS_ENTRADA", label: "Leads de Entrada" },
  { key: "CONTATO_INICIAL", label: "Contato Inicial" },
  { key: "QUALIFICADO", label: "Qualificado" },
  { key: "PRE_AGENDAMENTO", label: "Pré-agendamento" },
  { key: "AGENDAMENTO_REALIZADO", label: "Agendamento Realizado" },
  { key: "CONSULTA_CONFIRMADA", label: "Consulta Confirmada" },
  { key: "CONSULTA_PENDENTE", label: "Consulta Pendente" },
  { key: "CONSULTA_NAO_CONFIRMADA", label: "Não Confirmada" },
  { key: "FUP_1", label: "Follow-up 1" },
  { key: "FUP_2", label: "Follow-up 2" },
  { key: "FUP_3", label: "Follow-up 3" },
  { key: "PERDIDO", label: "Perdido" },
  { key: "GANHO", label: "Concluído ✓" },
];

export const CLIENTES_PLANOS = [
  { key: "AVULSA", label: "Consulta Avulsa" },
  { key: "TRIMESTRAL", label: "Trimestral" },
  { key: "SEMESTRAL", label: "Semestral" },
  { key: "ANUAL", label: "Anual" },
];

function buildStatusMap(pipelines: PipelineConfig): Record<number, string> {
  const map: Record<number, string> = {};
  for (const [key, id] of Object.entries(pipelines)) {
    if (typeof id === "number") map[id] = key;
  }
  return map;
}

// ── Follow-up reactivation rate ───────────────────────────────────────────────
export function computeFollowUpRate(
  statusEvents: StatusEvent[],
  period: FilterPeriod,
  customDates: { from: number; to: number } | undefined,
  pipelines: PipelineConfig
): {
  fupEntradas: number;
  fupReativados: number;
  fupIgnorados: number;
  taxaFollowUp: number;
  reativadosPorFup: Record<string, number>;
  reativadosLeadIds: Set<number>;
  ignoradosLeadIds: Set<number>;
} {
  const fupSet = new Set([pipelines.FUP_1, pipelines.FUP_2, pipelines.FUP_3]);
  const lostSet = new Set([pipelines.PERDIDO, pipelines.PERDIDO_FINAL]);

  const forwardSet = new Set([
    pipelines.QUALIFICADO,
    pipelines.PRE_AGENDAMENTO,
    pipelines.AGENDAMENTO_REALIZADO,
    pipelines.CONSULTA_CONFIRMADA,
    pipelines.CONSULTA_PENDENTE,
    pipelines.GANHO,
  ]);

  const { from, to } = periodTimestamps(period, customDates);
  const eventsInPeriod = statusEvents.filter((e) => {
    if (period === "todos") return true;
    return e.created_at >= from && e.created_at <= to;
  });

  const fupEntradas = new Set<number>();
  for (const e of eventsInPeriod) {
    if (fupSet.has(e.status_after)) fupEntradas.add(e.lead_id);
  }

  const reativacaoTs = new Map<number, number>();
  const reativadosPorFupRaw: Record<string, number> = { FUP_1: 0, FUP_2: 0, FUP_3: 0 };

  for (const e of eventsInPeriod) {
    if (fupSet.has(e.status_before) && forwardSet.has(e.status_after)) {
      if (!reativacaoTs.has(e.lead_id)) {
        reativacaoTs.set(e.lead_id, e.created_at);
        if (e.status_before === pipelines.FUP_1) reativadosPorFupRaw["FUP_1"]++;
        else if (e.status_before === pipelines.FUP_2) reativadosPorFupRaw["FUP_2"]++;
        else if (e.status_before === pipelines.FUP_3) reativadosPorFupRaw["FUP_3"]++;
      }
    }
  }

  const fupReativados = new Set<number>();
  const reativadosPorFup: Record<string, number> = { FUP_1: 0, FUP_2: 0, FUP_3: 0 };

  for (const [leadId, reactTs] of reativacaoTs) {
    const wentLostAfter = statusEvents.some(
      (e) => e.lead_id === leadId && e.created_at > reactTs && lostSet.has(e.status_after)
    );

    if (!wentLostAfter) {
      fupReativados.add(leadId);
      for (const e of eventsInPeriod) {
        if (e.lead_id === leadId && e.created_at === reactTs) {
          if (e.status_before === pipelines.FUP_1) reativadosPorFup["FUP_1"]++;
          else if (e.status_before === pipelines.FUP_2) reativadosPorFup["FUP_2"]++;
          else if (e.status_before === pipelines.FUP_3) reativadosPorFup["FUP_3"]++;
        }
      }
    }
  }

  const denom = fupEntradas.size;
  const numer = fupReativados.size;
  const taxaFollowUp = denom > 0 ? Math.round((numer / denom) * 100 * 10) / 10 : 0;
  const ignoradosLeadIds = new Set([...fupEntradas].filter((id) => !fupReativados.has(id)));

  return {
    fupEntradas: denom,
    fupReativados: numer,
    fupIgnorados: ignoradosLeadIds.size,
    taxaFollowUp,
    reativadosPorFup,
    reativadosLeadIds: fupReativados,
    ignoradosLeadIds,
  };
}

export function computeKPIs(
  funilLeads: KommoLead[],
  clientesLeads: KommoLead[],
  period: FilterPeriod,
  statusEvents: StatusEvent[],
  customDates: { from: number; to: number } | undefined,
  pipelines: PipelineConfig,
  fieldIds: FieldConfig
) {
  const statusMap = buildStatusMap(pipelines);

  const funilInPeriod = funilLeads.filter((l) => leadInPeriod(l, period, customDates));
  const totalLeads = funilInPeriod.length;

  const { from: pFrom, to: pTo } = periodTimestamps(period, customDates);
  const conversoesIds = new Set<number>();
  if (pipelines.CLIENTES_ID !== pipelines.FUNIL_ID) {
    // Standard: count leads that moved to a separate clients pipeline
    for (const e of statusEvents) {
      const noperiodo = period === "todos" || (e.created_at >= pFrom && e.created_at <= pTo);
      const entrou =
        e.pipeline_id === pipelines.CLIENTES_ID &&
        e.pipeline_id_before !== pipelines.CLIENTES_ID;
      if (noperiodo && entrou) conversoesIds.add(e.lead_id);
    }
  } else {
    // Single-pipeline: count leads currently in consultation or won stages
    const consultaStages = new Set([
      pipelines.CONSULTA_CONFIRMADA,
      pipelines.CONSULTA_PENDENTE,
      pipelines.CONSULTA_NAO_CONFIRMADA,
      pipelines.GANHO,
    ].filter(Boolean));
    for (const lead of funilInPeriod) {
      if (consultaStages.has(lead.status_id)) conversoesIds.add(lead.id);
    }
  }
  const conversoes = conversoesIds.size;
  const taxaConversao =
    totalLeads > 0 ? Math.round((conversoes / totalLeads) * 100 * 10) / 10 : 0;

  const byStage: Record<string, number> = {};
  for (const lead of funilInPeriod) {
    const key = statusMap[lead.status_id] ?? `status_${lead.status_id}`;
    byStage[key] = (byStage[key] ?? 0) + 1;
  }

  const byPlano: Record<string, number> = {};
  const planoStatuses = {
    AVULSA: pipelines.AVULSA,
    TRIMESTRAL: pipelines.TRIMESTRAL,
    SEMESTRAL: pipelines.SEMESTRAL,
    ANUAL: pipelines.ANUAL,
  };
  for (const lead of clientesLeads) {
    for (const [plano, sid] of Object.entries(planoStatuses)) {
      if (lead.status_id === sid) {
        byPlano[plano] = (byPlano[plano] ?? 0) + 1;
      }
    }
  }

  const byOrigem: Record<string, number> = {};
  for (const lead of funilInPeriod) {
    const origem =
      getFieldValue(lead, fieldIds.ORIGEM_LEAD) ||
      lead._embedded?.tags?.[0]?.name ||
      "Orgânico";
    byOrigem[origem] = (byOrigem[origem] ?? 0) + 1;
  }

  const byCidade: Record<string, number> = {};
  for (const lead of funilInPeriod) {
    const cidade = getFieldValue(lead, fieldIds.CIDADE);
    if (cidade) byCidade[cidade] = (byCidade[cidade] ?? 0) + 1;
  }

  const byObjetivo: Record<string, number> = {};
  for (const lead of funilInPeriod) {
    const obj = getFieldValue(lead, fieldIds.OBJETIVO_CLIENTE);
    if (obj) byObjetivo[obj] = (byObjetivo[obj] ?? 0) + 1;
  }

  const fupLeads = funilLeads.filter((l) =>
    [pipelines.FUP_1, pipelines.FUP_2, pipelines.FUP_3].includes(l.status_id)
  );

  const byMotivoPerde: Record<string, number> = {};
  for (const lead of funilLeads.filter(
    (l) => l.status_id === pipelines.PERDIDO || l.status_id === pipelines.PERDIDO_FINAL
  )) {
    const motivo = getFieldValue(lead, fieldIds.MOTIVO_PERDA) ?? "Não informado";
    byMotivoPerde[motivo] = (byMotivoPerde[motivo] ?? 0) + 1;
  }

  const totalClientesAtivos = Object.values(byPlano).reduce((a, b) => a + b, 0);

  return {
    totalLeads,
    conversoes,
    conversoesIds,
    taxaConversao,
    byStage,
    byPlano,
    byOrigem,
    byCidade,
    byObjetivo,
    fupLeads,
    byMotivoPerde,
    totalClientesAtivos,
  };
}
