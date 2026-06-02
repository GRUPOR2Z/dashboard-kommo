import { useState, useMemo, useRef } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  Users,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  MapPin,
  Target,
  UserRound,
  BarChart3,
  Activity,
  Clock,
  XCircle,
  Percent,
  CalendarCheck,
  CalendarRange,
  GripVertical,
  MessageSquare,
  CheckCheck,
  Stethoscope,
  Zap,
  Loader2,
} from "lucide-react";
import type { FilterPeriod } from "../lib/types";
import type { KommoLead } from "../lib/types";
import {
  fetchLeadsByPipeline,
  fetchStatusEvents,
  fetchNotesSample,
  fetchPipelines,
  leadInPeriod,
  periodTimestamps,
  patchLeads,
  fetchChatLeadIds,
} from "../lib/kommo-api";
import { formatBizTime, detectClosure, firstResponseMinutes } from "../lib/business-hours";
import { computeKPIs, computeFollowUpRate, FUNIL_STAGES, CLIENTES_PLANOS } from "../lib/kpis";
import { useClientConfig } from "../contexts/ClientConfigContext";
import KPICard from "../components/KPICard";
import SectionPanel from "../components/SectionPanel";
import LeadDrawer from "../components/LeadDrawer";

type ActiveDrawer =
  | "leads"
  | "confirmadas"
  | "convertidos"
  | "fups"
  | "reativados"
  | "ignorados"
  | "avulsa"
  | "trimestral"
  | "semestral"
  | "anual"
  | "conversas-ontem"
  | null;

const FILTER_OPTIONS: { label: string; value: FilterPeriod }[] = [
  { label: "Hoje", value: "hoje" },
  { label: "Ontem", value: "ontem" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "Todos", value: "todos" },
  { label: "Período", value: "custom" },
];

const DEFAULT_SECTION_ORDER = ["followup", "qualificacao-ia", "consultas", "etapas-funil", "visao-geral", "secoes", "atendimento"];

function periodLabel(p: FilterPeriod): string {
  switch (p) {
    case "hoje":   return "HOJE";
    case "ontem":  return "ONTEM";
    case "7d":     return "ESTA SEMANA";
    case "30d":    return "ÚLTIMOS 30 DIAS";
    case "todos":  return "TODO O PERÍODO";
    case "custom": return "PERÍODO PERSONALIZADO";
    default:       return p;
  }
}
const FEB_2026 = Math.floor(new Date(2026, 1, 1).getTime() / 1000);
const SECTION_ORDER_KEY = "kommo_section_order";

function eventInPeriod(
  eventTs: number,
  period: FilterPeriod,
  todayStart: number,
  now: number,
  customDates?: { from: number; to: number }
): boolean {
  if (period === "todos") return true;
  if (period === "custom" && customDates) {
    return eventTs >= customDates.from && eventTs <= customDates.to;
  }
  switch (period) {
    case "hoje":
      return eventTs >= todayStart && eventTs <= now;
    case "ontem":
      return eventTs >= todayStart - 86400 && eventTs < todayStart;
    case "7d":
      return eventTs >= todayStart - 7 * 86400 && eventTs <= now;
    case "30d":
      return eventTs >= todayStart - 30 * 86400 && eventTs <= now;
    default:
      return true;
  }
}

function toTimestamp(dateStr: string, endOfDay = false): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export default function Dashboard() {
  const [period, setPeriod] = useState<FilterPeriod>("30d");
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>(null);
  const [activeFunilTab, setActiveFunilTab] = useState<"vendas" | "negocia">("vendas");
  const [activeFunilPipelineId, setActiveFunilPipelineId] = useState<number | null>(null);
  const [activePipelineId, setActivePipelineId] = useState<number | null>(null);
  const [activeStageDrawer, setActiveStageDrawer] = useState<{
    key: string; label: string; statusId: number; pipelineId: number | null;
  } | null>(null);
  const [triggeringFup, setTriggeringFup] = useState(false);
  const [triggerFupResult, setTriggerFupResult] = useState<{ success?: number; error?: string } | null>(null);
  const [fupConfirm, setFupConfirm] = useState(false);
  const { subdomain, clientName, pipelines, fieldIds, stageLabels, pipelineNames, hiddenSections, loading: configLoading } = useClientConfig();

  const todayStr = new Date().toISOString().split("T")[0];
  const thirtyAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [customFromStr, setCustomFromStr] = useState(thirtyAgoStr);
  const [customToStr, setCustomToStr] = useState(todayStr);
  const customDates =
    period === "custom" && customFromStr && customToStr
      ? { from: toTimestamp(customFromStr, false), to: toTimestamp(customToStr, true) }
      : undefined;

  // ── Section ordering ───────────────────────────────────────────────────────
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SECTION_ORDER_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const valid = parsed.filter((s) => DEFAULT_SECTION_ORDER.includes(s));
        const missing = DEFAULT_SECTION_ORDER.filter((s) => !valid.includes(s));
        return [...valid, ...missing];
      }
    } catch {}
    return [...DEFAULT_SECTION_ORDER];
  });

  const dragItemRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function onDragStart(id: string) {
    dragItemRef.current = id;
  }

  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragItemRef.current !== id) setDragOverId(id);
  }

  function onDrop(targetId: string) {
    const sourceId = dragItemRef.current;
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null);
      dragItemRef.current = null;
      return;
    }
    setSectionOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(sourceId);
      const to = next.indexOf(targetId);
      next.splice(from, 1);
      next.splice(to, 0, sourceId);
      localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(next));
      return next;
    });
    dragItemRef.current = null;
    setDragOverId(null);
  }

  function onDragEnd() {
    dragItemRef.current = null;
    setDragOverId(null);
  }

  // ── Data fetching ──────────────────────────────────────────────────────────
  const {
    data: funilLeads,
    isLoading: funilLoading,
    error: funilError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["funil-leads", pipelines.FUNIL_ID],
    queryFn: () => fetchLeadsByPipeline(pipelines.FUNIL_ID),
    enabled: !configLoading && !!pipelines.FUNIL_ID,
    staleTime: 2 * 60 * 1000,
  });

  const { data: clientesLeads, isLoading: clientesLoading } = useQuery({
    queryKey: ["clientes-leads", pipelines.CLIENTES_ID],
    queryFn: () => fetchLeadsByPipeline(pipelines.CLIENTES_ID),
    enabled: !configLoading && !!pipelines.CLIENTES_ID,
    staleTime: 2 * 60 * 1000,
  });

  const { data: statusEvents, isLoading: statusLoading } = useQuery({
    queryKey: ["status-events", pipelines.FUNIL_ID],
    queryFn: () => {
      const now = Math.floor(Date.now() / 1000);
      // Extend back to Feb 1 2026 to cover the AI qualification history window
      const from = Math.min(now - 90 * 86400, FEB_2026);
      return fetchStatusEvents(from, now);
    },
    enabled: !configLoading && !!pipelines.FUNIL_ID,
    staleTime: 5 * 60 * 1000,
  });

  // ── Notes sample for response-time metric ─────────────────────────────────
  const sampleLeadIds = useMemo(() => {
    return (funilLeads ?? [])
      .slice()
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 15)
      .map((l) => l.id);
  }, [funilLeads]);

  const { data: notesSampleMap, isLoading: notesLoading } = useQuery({
    queryKey: ["notes-sample", sampleLeadIds],
    queryFn: () => fetchNotesSample(sampleLeadIds),
    enabled: sampleLeadIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // ── Pipeline structure (for stage sort order) ─────────────────────────────
  const { data: pipelinesStructure } = useQuery({
    queryKey: ["pipelines-structure"],
    queryFn: fetchPipelines,
    enabled: !configLoading && Object.keys(pipelineNames).length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const stageSortMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const pipeline of pipelinesStructure ?? []) {
      for (const status of pipeline._embedded?.statuses ?? []) {
        map.set(status.id, status.sort);
      }
    }
    return map;
  }, [pipelinesStructure]);

  // ── Extra pipelines (from pipelineNames config) ───────────────────────────
  const extraPipelineIds = useMemo(() => {
    return Object.keys(pipelineNames)
      .map(Number)
      .filter((id) => id !== pipelines.FUNIL_ID && id !== pipelines.CLIENTES_ID);
  }, [pipelineNames, pipelines.FUNIL_ID, pipelines.CLIENTES_ID]);

  const extraPipelineQueries = useQueries({
    queries: extraPipelineIds.map((id) => ({
      queryKey: ["pipeline-leads", id] as const,
      queryFn: () => fetchLeadsByPipeline(id),
      enabled: !configLoading && id > 0,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const pipelineLeadsMap = useMemo(() => {
    const map = new Map<number, KommoLead[]>();
    if (funilLeads) map.set(pipelines.FUNIL_ID, funilLeads);
    if (clientesLeads && pipelines.CLIENTES_ID !== pipelines.FUNIL_ID) {
      map.set(pipelines.CLIENTES_ID, clientesLeads);
    }
    extraPipelineIds.forEach((id, i) => {
      const data = extraPipelineQueries[i]?.data;
      if (data) map.set(id, data);
    });
    return map;
  }, [funilLeads, clientesLeads, pipelines.FUNIL_ID, pipelines.CLIENTES_ID, extraPipelineIds, extraPipelineQueries]);

  const topStagesData = useMemo(() => {
    if (Object.keys(pipelineNames).length === 0) return [];
    // Map numeric status_id → named config key (e.g. 102229156 → "FUP_2")
    const statusMap: Record<number, string> = {};
    for (const [key, val] of Object.entries(pipelines)) {
      if (typeof val === "number" && val > 0) statusMap[val] = key;
    }
    const combined: Record<string, { statusId: number; count: number }> = {};
    for (const [pipeId, leads] of pipelineLeadsMap) {
      if (pipelineNames[String(pipeId)]?.lixeira) continue;
      for (const lead of leads) {
        const configKey = statusMap[lead.status_id] ?? `status_${lead.status_id}`;
        if (!combined[configKey]) combined[configKey] = { statusId: lead.status_id, count: 0 };
        combined[configKey].count += 1;
      }
    }
    return Object.entries(combined)
      .map(([configKey, { statusId, count }]) => ({
        key: configKey,
        statusId,
        // status_XXXXXXXX in stage_labels takes priority, then config-key label, then key name
        label:
          stageLabels[`status_${statusId}`] ??
          stageLabels[configKey] ??
          configKey.replace(/_/g, " "),
        value: count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [pipelineLeadsMap, pipelineNames, pipelines, stageLabels]);

  const loading = configLoading || funilLoading || clientesLoading || statusLoading || extraPipelineQueries.some((q) => q.isLoading);

  // ── AI Qualification metrics (since Feb 2026, respects period filter) ────────
  const aiQualifications = useMemo(() => {
    if (!statusEvents || !pipelines.LEADS_ENTRADA || !pipelines.CONTATO_INICIAL) return null;

    // Effective window: never before Feb 2026 (IA start), respects period filter
    let effectiveFrom = FEB_2026;
    let effectiveTo = Math.floor(Date.now() / 1000);
    if (period !== "todos") {
      const { from, to } = periodTimestamps(period, customDates);
      effectiveFrom = Math.max(FEB_2026, from);
      effectiveTo = to;
    }

    // totalAtendidos = leads that entered "Pré-atendimento IA" in the window
    const totalAtendidos = new Set<number>();
    const qualified = new Set<number>();

    for (const event of statusEvents) {
      if (event.created_at < effectiveFrom || event.created_at > effectiveTo) continue;
      if (event.status_after === pipelines.LEADS_ENTRADA) totalAtendidos.add(event.lead_id);
      if (event.status_before === pipelines.LEADS_ENTRADA && event.status_after === pipelines.CONTATO_INICIAL) {
        qualified.add(event.lead_id);
      }
    }
    // Leads currently sitting in LEADS_ENTRADA created within the window (no status-change event yet)
    for (const [, leads] of pipelineLeadsMap) {
      for (const lead of leads) {
        if (
          lead.status_id === pipelines.LEADS_ENTRADA &&
          lead.created_at >= effectiveFrom &&
          lead.created_at <= effectiveTo
        ) {
          totalAtendidos.add(lead.id);
        }
      }
    }

    const taxaQualificacao =
      totalAtendidos.size > 0 ? Math.round((qualified.size / totalAtendidos.size) * 1000) / 10 : 0;

    // Conversion: qualified leads currently in any non-main, non-lixeira pipeline
    const convertedLeadIds = new Set<number>();
    for (const [pipeId, leads] of pipelineLeadsMap) {
      if (pipeId === pipelines.FUNIL_ID) continue;
      if (pipelineNames[String(pipeId)]?.lixeira) continue;
      for (const lead of leads) {
        if (qualified.has(lead.id)) convertedLeadIds.add(lead.id);
      }
    }

    const taxaConversao =
      qualified.size > 0 ? Math.round((convertedLeadIds.size / qualified.size) * 1000) / 10 : 0;

    return {
      totalAtendidos: totalAtendidos.size,
      totalQualificados: qualified.size,
      taxaQualificacao,
      totalConvertidos: convertedLeadIds.size,
      taxaConversao,
    };
  }, [statusEvents, pipelineLeadsMap, pipelineNames, pipelines, period, customDates]);

  // ── Sections available for this client's pipeline config ───────────────────
  const availableSections = useMemo(() => {
    const hasFup = pipelines.FUP_1 > 0 || pipelines.FUP_2 > 0 || pipelines.FUP_3 > 0;
    const hasPlanos = pipelines.AVULSA > 0 || pipelines.TRIMESTRAL > 0 || pipelines.SEMESTRAL > 0 || pipelines.ANUAL > 0;
    const isMainOrAll = !activePipelineId || activePipelineId === pipelines.FUNIL_ID;
    const isClientePipeline = activePipelineId === pipelines.CLIENTES_ID;
    const hasAIQualif = pipelines.LEADS_ENTRADA > 0 && pipelines.CONTATO_INICIAL > 0 && isMainOrAll;
    return new Set([
      ...(hasFup && isMainOrAll ? ["followup"] : []),
      ...(hasAIQualif ? ["qualificacao-ia"] : []),
      ...(hasPlanos && (isMainOrAll || isClientePipeline) ? ["consultas"] : []),
      "etapas-funil",
      "visao-geral",
      "secoes",
      "atendimento",
    ]);
  }, [pipelines, activePipelineId]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!statusEvents) return null;
    if (activePipelineId) {
      const activeLeads = pipelineLeadsMap.get(activePipelineId) ?? [];
      const pConfig = { ...pipelines, FUNIL_ID: activePipelineId, CLIENTES_ID: activePipelineId };
      return computeKPIs(activeLeads, activeLeads, period, statusEvents, customDates, pConfig, fieldIds);
    }
    if (!funilLeads || !clientesLeads) return null;
    return computeKPIs(funilLeads, clientesLeads, period, statusEvents, customDates, pipelines, fieldIds);
  }, [activePipelineId, pipelineLeadsMap, funilLeads, clientesLeads, statusEvents, period, customDates, pipelines, fieldIds]);

  const followUpRate = useMemo(() => {
    if (!statusEvents) return null;
    return computeFollowUpRate(statusEvents, period, customDates, pipelines);
  }, [statusEvents, period, customDates, pipelines]);

  const responseTimeMetrics = useMemo(() => {
    if (!notesSampleMap || notesSampleMap.size === 0) return null;
    const times: number[] = [];
    let closedCount = 0;
    for (const [, notes] of notesSampleMap) {
      const rt = firstResponseMinutes(notes);
      if (rt !== null) times.push(rt);
      if (detectClosure(notes)) closedCount++;
    }
    const avgMinutes = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : null;
    return {
      avgDisplay: avgMinutes !== null ? formatBizTime(avgMinutes) : null,
      closedCount,
      respondedCount: times.length,
      totalSampled: notesSampleMap.size,
    };
  }, [notesSampleMap]);

  const consultasConfirmadasData = useMemo(() => {
    const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const now = Math.floor(Date.now() / 1000);

    if (period === "todos") {
      const leads = (funilLeads ?? []).filter(
        (l) => l.status_id === pipelines.CONSULTA_CONFIRMADA
      );
      return { count: leads.length, leadIds: new Set(leads.map((l) => l.id)) };
    }

    if (!statusEvents) return { count: 0, leadIds: new Set<number>() };
    const ids = new Set<number>();
    for (const e of statusEvents) {
      if (
        e.status_after === pipelines.CONSULTA_CONFIRMADA &&
        eventInPeriod(e.created_at, period, todayStart, now, customDates)
      ) {
        ids.add(e.lead_id);
      }
    }
    return { count: ids.size, leadIds: ids };
  }, [funilLeads, statusEvents, period, customDates, pipelines]);

  // ── Drawer lead lists ──────────────────────────────────────────────────────
  const leadsInPeriod = useMemo(
    () => (funilLeads ?? []).filter((l) => leadInPeriod(l, period, customDates)),
    [funilLeads, period, customDates]
  );

  const convertidasLeads = useMemo(() => {
    if (!kpis) return [];
    const ids = kpis.conversoesIds;
    const found = (clientesLeads ?? []).filter((l) => ids.has(l.id));
    const foundIds = new Set(found.map((l) => l.id));
    const placeholders = [...ids]
      .filter((id) => !foundIds.has(id))
      .map((id) => ({
        id,
        name: `Lead #${id}`,
        price: 0,
        created_at: 0,
        updated_at: 0,
        closed_at: null,
        pipeline_id: 0,
        status_id: 0,
        custom_fields_values: null,
      }));
    return [...found, ...placeholders];
  }, [kpis, clientesLeads]);

  function buildDrawerLeads(ids: Set<number>, source: typeof funilLeads) {
    const found = (source ?? []).filter((l) => ids.has(l.id));
    const foundIds = new Set(found.map((l) => l.id));
    const placeholders = [...ids]
      .filter((id) => !foundIds.has(id))
      .map((id) => ({
        id,
        name: `Lead #${id}`,
        price: 0,
        created_at: 0,
        updated_at: 0,
        closed_at: null,
        pipeline_id: 0,
        status_id: 0,
        custom_fields_values: null,
      }));
    return [...found, ...placeholders];
  }

  const confirmadosLeads = useMemo(
    () => buildDrawerLeads(consultasConfirmadasData.leadIds, funilLeads),
    [consultasConfirmadasData.leadIds, funilLeads]
  );

  const reativadosLeads = useMemo(() => {
    if (!followUpRate) return [];
    return buildDrawerLeads(followUpRate.reativadosLeadIds, funilLeads);
  }, [followUpRate, funilLeads]);

  const ignoradosLeads = useMemo(() => {
    if (!followUpRate) return [];
    return buildDrawerLeads(followUpRate.ignoradosLeadIds, funilLeads);
  }, [followUpRate, funilLeads]);

  const { from: chatFrom, to: chatTo } = periodTimestamps(period, customDates);
  const { data: chatLeadIds, isLoading: chatLoading } = useQuery({
    queryKey: ["chat-lead-ids", chatFrom, chatTo],
    queryFn: () => fetchChatLeadIds(chatFrom, chatTo),
    enabled: !configLoading,
    staleTime: 5 * 60 * 1000,
  });

  const conversasPeriodoLeads = useMemo(() => {
    if (!chatLeadIds) return [];
    const result: KommoLead[] = [];
    const seen = new Set<number>();
    for (const [pipeId, leads] of pipelineLeadsMap) {
      if (pipelineNames[String(pipeId)]?.lixeira) continue;
      for (const lead of leads) {
        if (!seen.has(lead.id) && chatLeadIds.has(lead.id)) {
          seen.add(lead.id);
          result.push(lead);
        }
      }
    }
    return result.sort((a, b) => b.updated_at - a.updated_at);
  }, [chatLeadIds, pipelineLeadsMap, pipelineNames]);

  const avulsaLeads = useMemo(
    () => (clientesLeads ?? []).filter((l) => l.status_id === pipelines.AVULSA && (period === "todos" || leadInPeriod(l, period, customDates))),
    [clientesLeads, pipelines, period, customDates]
  );
  const trimestralLeads = useMemo(
    () => (clientesLeads ?? []).filter((l) => l.status_id === pipelines.TRIMESTRAL && (period === "todos" || leadInPeriod(l, period, customDates))),
    [clientesLeads, pipelines, period, customDates]
  );
  const semestralLeads = useMemo(
    () => (clientesLeads ?? []).filter((l) => l.status_id === pipelines.SEMESTRAL && (period === "todos" || leadInPeriod(l, period, customDates))),
    [clientesLeads, pipelines, period, customDates]
  );
  const anualLeads = useMemo(
    () => (clientesLeads ?? []).filter((l) => l.status_id === pipelines.ANUAL && (period === "todos" || leadInPeriod(l, period, customDates))),
    [clientesLeads, pipelines, period, customDates]
  );

  const stageDrawerLeads = useMemo(() => {
    if (!activeStageDrawer) return [];
    const { statusId, pipelineId } = activeStageDrawer;
    const candidates: KommoLead[] = [];
    if (pipelineId !== null) {
      candidates.push(...(pipelineLeadsMap.get(pipelineId) ?? []));
    } else {
      for (const [, leads] of pipelineLeadsMap) candidates.push(...leads);
    }
    return candidates
      .filter((l) => l.status_id === statusId)
      .filter((l) => leadInPeriod(l, period, customDates));
  }, [activeStageDrawer, pipelineLeadsMap, period, customDates]);

  function toggleDrawer(d: ActiveDrawer) {
    setActiveStageDrawer(null);
    setActiveDrawer((prev) => (prev === d ? null : d));
  }

  const funilItems = useMemo(() => {
    if (!kpis) return [];
    const knownKeys = new Set(FUNIL_STAGES.map((s) => s.key));
    const getColor = (key: string, label: string): string | undefined => {
      if (key === "GANHO") return "var(--green)";
      if (key.includes("PERDIDO")) return "#f85149";
      if (key.includes("FUP") || label.toLowerCase().includes("fup")) return "#f0883e";
      if (label.toLowerCase().includes("respec")) return "#d29922";
      if (key.includes("CONFIRMADA")) return "#58a6ff";
      return undefined;
    };
    const pipelinesMap = pipelines as unknown as Record<string, unknown>;
    const items = FUNIL_STAGES.map((s) => {
      const label = stageLabels[s.key] ?? s.label;
      const sid = pipelinesMap[s.key];
      return {
        key: s.key, label, value: kpis.byStage[s.key] ?? 0, color: getColor(s.key, label),
        statusId: typeof sid === "number" && sid > 0 ? sid : undefined,
      };
    });
    for (const [key, value] of Object.entries(kpis.byStage)) {
      if (!knownKeys.has(key)) {
        const label = stageLabels[key] ?? key.replace("status_", "Etapa ");
        const n = key.startsWith("status_") ? parseInt(key.replace("status_", ""), 10) : NaN;
        items.push({ key, label, value, color: getColor(key, label), statusId: isNaN(n) ? undefined : n });
      }
    }
    return items.filter((i) => i.value > 0);
  }, [kpis, stageLabels]);

  const clientesItems = useMemo(() => {
    if (!clientesLeads || pipelines.FUNIL_ID === pipelines.CLIENTES_ID) return [];
    const inPeriod = clientesLeads.filter((l) => leadInPeriod(l, period, customDates));
    const counts: Record<string, number> = {};
    for (const lead of inPeriod) {
      const key = `status_${lead.status_id}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([key, value]) => ({
        key,
        label: stageLabels[key] ?? key.replace("status_", "Etapa "),
        value,
        color: undefined as string | undefined,
      }))
      .filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [clientesLeads, pipelines, period, customDates, stageLabels]);

  // ── Active funil tab items ────────────────────────────────────────────────
  const hasPipelineNames = Object.keys(pipelineNames).length > 0;

  const activeFunilItems = useMemo(() => {
    if (!hasPipelineNames) {
      return activeFunilTab === "vendas" ? funilItems : clientesItems;
    }
    const pipelineId = activeFunilPipelineId ?? pipelines.FUNIL_ID;
    const leads = pipelineLeadsMap.get(pipelineId) ?? [];
    const statusMap: Record<number, string> = {};
    for (const [key, val] of Object.entries(pipelines)) {
      if (typeof val === "number" && val > 0) statusMap[val] = key;
    }
    const getColor = (key: string, label: string): string | undefined => {
      if (key === "GANHO") return "var(--green)";
      if (key.includes("PERDIDO")) return "#f85149";
      if (key.includes("FUP") || label.toLowerCase().includes("fup")) return "#f0883e";
      if (label.toLowerCase().includes("respec")) return "#d29922";
      if (key.includes("CONFIRMADA")) return "#58a6ff";
      return undefined;
    };
    const counts: Record<string, { statusId: number; count: number }> = {};
    for (const lead of leads) {
      const configKey = statusMap[lead.status_id] ?? `status_${lead.status_id}`;
      if (!counts[configKey]) counts[configKey] = { statusId: lead.status_id, count: 0 };
      counts[configKey].count += 1;
    }
    return Object.entries(counts)
      .map(([configKey, { statusId, count }]) => {
        const label = stageLabels[`status_${statusId}`] ?? stageLabels[configKey] ?? configKey.replace(/_/g, " ");
        return { key: configKey, label, value: count, color: getColor(configKey, label), statusId };
      })
      .filter((i) => i.value > 0)
      .sort((a, b) => {
        const aSort = stageSortMap.get(a.statusId);
        const bSort = stageSortMap.get(b.statusId);
        if (aSort !== undefined && bSort !== undefined) return aSort - bSort;
        if (aSort !== undefined) return -1;
        if (bSort !== undefined) return 1;
        return b.value - a.value; // fallback: count desc
      });
  }, [hasPipelineNames, activeFunilTab, activeFunilPipelineId, funilItems, clientesItems, pipelineLeadsMap, pipelines, stageLabels, stageSortMap]);

  const activeFunilTotal = useMemo(() => {
    if (!hasPipelineNames) {
      return activeFunilTab === "vendas" ? (funilLeads?.length ?? 0) : (clientesLeads?.length ?? 0);
    }
    const pipelineId = activeFunilPipelineId ?? pipelines.FUNIL_ID;
    return pipelineLeadsMap.get(pipelineId)?.length ?? 0;
  }, [hasPipelineNames, activeFunilTab, activeFunilPipelineId, funilLeads, clientesLeads, pipelineLeadsMap, pipelines.FUNIL_ID]);

  const planoItems = CLIENTES_PLANOS.map((p) => ({
    label: p.label,
    value: kpis?.byPlano[p.key] ?? 0,
    color:
      p.key === "ANUAL"
        ? "#a371f7"
        : p.key === "SEMESTRAL"
        ? "#58a6ff"
        : p.key === "TRIMESTRAL"
        ? "var(--green)"
        : "#f0883e",
  }));

  const fupRate = followUpRate;

  // ── FUP bot trigger ────────────────────────────────────────────────────────
  async function triggerFupBots() {
    const transitId = pipelines.CONSULTA_NAO_CONFIRMADA;
    if (!kpis || !transitId) return;
    const fupLeads = kpis.fupLeads;
    if (fupLeads.length === 0) return;
    setTriggeringFup(true);
    setTriggerFupResult(null);
    setFupConfirm(false);
    try {
      const originals = fupLeads.map((l) => ({ id: l.id, status_id: l.status_id }));
      await patchLeads(fupLeads.map((l) => ({ id: l.id, status_id: transitId })));
      await new Promise((r) => setTimeout(r, 2000));
      await patchLeads(originals);
      setTriggerFupResult({ success: fupLeads.length });
    } catch (err) {
      setTriggerFupResult({ error: (err as Error).message });
    } finally {
      setTriggeringFup(false);
    }
  }

  // ── Section renderers ──────────────────────────────────────────────────────
  function renderFollowUp() {
    return (
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              draggable
              onDragStart={() => onDragStart("followup")}
              onDragEnd={onDragEnd}
              style={{ cursor: "grab", touchAction: "none" }}
              title="Arrastar para reordenar"
            >
              <GripVertical size={14} style={{ color: "var(--muted)", opacity: 0.4 }} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              Follow-up
              <span className="font-normal opacity-60"> · {periodLabel(period)}</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {fupRate && (
              <div className="flex items-center gap-1.5">
                <Percent size={12} style={{ color: "#d29922" }} />
                <span className="text-sm font-bold" style={{ color: "#d29922" }}>
                  {fupRate.taxaFollowUp === 0 && fupRate.fupEntradas > 0
                    ? "<1%"
                    : `${fupRate.taxaFollowUp}%`}{" "}
                  <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>
                    de reativação
                  </span>
                </span>
              </div>
            )}
            {pipelines.CONSULTA_NAO_CONFIRMADA > 0 && kpis && kpis.fupLeads.length > 0 && (
              fupConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    Disparar para {kpis.fupLeads.length} leads?
                  </span>
                  <button
                    onClick={triggerFupBots}
                    disabled={triggeringFup}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    style={{ background: "#f0883e", color: "#fff", opacity: triggeringFup ? 0.6 : 1 }}
                  >
                    {triggeringFup ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                    {triggeringFup ? "Disparando..." : "Confirmar"}
                  </button>
                  <button
                    onClick={() => setFupConfirm(false)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: "var(--muted)" }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setFupConfirm(true); setTriggerFupResult(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                  style={{ background: "var(--card)", borderColor: "#f0883e", color: "#f0883e" }}
                >
                  <Zap size={11} />
                  Disparar Bot FUP
                </button>
              )
            )}
            {triggerFupResult?.success && (
              <span className="text-xs font-medium" style={{ color: "#3fb950" }}>
                ✓ {triggerFupResult.success} leads re-acionados
              </span>
            )}
            {triggerFupResult?.error && (
              <span className="text-xs" style={{ color: "#f85149" }}>
                Erro: {triggerFupResult.error.slice(0, 60)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => toggleDrawer("fups")}
            className="rounded-lg border p-4 text-left transition-all"
            style={{
              background: activeDrawer === "fups" ? "rgba(240,136,62,0.1)" : "var(--bg)",
              borderColor: activeDrawer === "fups" ? "#f0883e" : "var(--border)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock size={12} style={{ color: "#f0883e" }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Pendentes
              </span>
            </div>
            <div className="text-4xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
              {loading ? "..." : kpis?.fupLeads.length ?? 0}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Aguardando resposta (FUP 1/2/3)
            </p>
            <div className="mt-3 flex gap-3">
              {(["FUP_1", "FUP_2", "FUP_3"] as const).map((k, i) => (
                <div key={k} className="text-center">
                  <div className="text-sm font-bold" style={{ color: "#f0883e" }}>
                    {kpis?.byStage[k] ?? 0}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    FUP {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </button>

          <button
            onClick={() => toggleDrawer("reativados")}
            className="rounded-lg border p-4 text-left transition-all"
            style={{
              background: activeDrawer === "reativados" ? "rgba(63,185,80,0.1)" : "var(--bg)",
              borderColor: activeDrawer === "reativados" ? "#3fb950" : "var(--border)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={12} style={{ color: "#3fb950" }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Reativados
              </span>
            </div>
            <div className="text-4xl font-bold tracking-tight" style={{ color: "#3fb950" }}>
              {loading ? "..." : fupRate?.fupReativados ?? 0}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Responderam e avançaram no funil
            </p>
            {fupRate && (
              <div className="mt-3 space-y-1.5">
                {[
                  { key: "FUP_1", label: "FUP 1", color: "#f0883e" },
                  { key: "FUP_2", label: "FUP 2", color: "#d29922" },
                  { key: "FUP_3", label: "FUP 3", color: "#bc4c00" },
                ].map(({ key, label, color }) => {
                  const val = fupRate.reativadosPorFup[key] ?? 0;
                  const maxVal = Math.max(...Object.values(fupRate.reativadosPorFup), 1);
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs w-10" style={{ color: "var(--muted)" }}>{label}</span>
                      <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(val / maxVal) * 100}%`, background: color }}
                        />
                      </div>
                      <span className="text-xs font-bold w-4 text-right" style={{ color }}>{val}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </button>

          <button
            onClick={() => toggleDrawer("ignorados")}
            className="rounded-lg border p-4 text-left transition-all"
            style={{
              background: activeDrawer === "ignorados" ? "rgba(248,81,73,0.1)" : "var(--bg)",
              borderColor: activeDrawer === "ignorados" ? "#f85149" : "var(--border)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={12} style={{ color: "#f85149" }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Ignorados
              </span>
            </div>
            <div className="text-4xl font-bold tracking-tight" style={{ color: "#f85149" }}>
              {loading ? "..." : fupRate?.fupIgnorados ?? 0}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Não responderam ao follow-up
            </p>
            {fupRate && fupRate.fupEntradas > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1" style={{ color: "var(--muted)" }}>
                  <span>Taxa de perda</span>
                  <span style={{ color: "#f85149" }}>
                    {Math.round((fupRate.fupIgnorados / fupRate.fupEntradas) * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(fupRate.fupIgnorados / fupRate.fupEntradas) * 100}%`,
                      background: "#f85149",
                    }}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  de {fupRate.fupEntradas} leads que entraram em FUP
                </p>
              </div>
            )}
          </button>
        </div>
      </div>
    );
  }

  function renderQualificacaoIA() {
    const q = aiQualifications;
    const periodoLabel = period === "todos"
      ? "desde fev/2026"
      : FILTER_OPTIONS.find((o) => o.value === period)?.label.toLowerCase() ?? period;
    return (
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              draggable
              onDragStart={() => onDragStart("qualificacao-ia")}
              onDragEnd={onDragEnd}
              style={{ cursor: "grab", touchAction: "none" }}
              title="Arrastar para reordenar"
            >
              <GripVertical size={14} style={{ color: "var(--muted)", opacity: 0.5 }} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              Qualificação por IA
              <span className="font-normal opacity-60"> · {periodLabel(period)}</span>
            </span>
          </div>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Pré-atendimento IA → Conversa em andamento · {periodoLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Atendidos pela IA */}
          <div className="rounded-lg border p-4" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Activity size={12} style={{ color: "#a371f7" }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Atendidos pela IA
              </span>
            </div>
            {loading ? (
              <div className="h-9 rounded animate-pulse" style={{ background: "var(--border)" }} />
            ) : (
              <>
                <div className="text-4xl font-bold tracking-tight" style={{ color: "#a371f7" }}>
                  {q?.totalAtendidos ?? 0}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  leads recebidos no Pré-atendimento IA
                </p>
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "var(--muted)" }}>
                      {q?.totalQualificados ?? 0} qualificados
                    </span>
                    <span style={{ color: "#a371f7" }} className="font-bold">
                      {q?.taxaQualificacao ?? 0}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(q?.taxaQualificacao ?? 0, 100)}%`, background: "#a371f7" }}
                    />
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                    taxa de qualificação
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Viraram Clientes */}
          <div className="rounded-lg border p-4" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={12} style={{ color: "var(--green)" }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Viraram Clientes
              </span>
            </div>
            {loading ? (
              <div className="h-9 rounded animate-pulse" style={{ background: "var(--border)" }} />
            ) : (
              <>
                <div className="text-4xl font-bold tracking-tight" style={{ color: "var(--green)" }}>
                  {q?.totalConvertidos ?? 0}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  de {q?.totalQualificados ?? 0} qualificados
                </p>
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "var(--muted)" }}>Taxa de conversão</span>
                    <span style={{ color: "var(--green)" }} className="font-bold">{q?.taxaConversao ?? 0}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(q?.taxaConversao ?? 0, 100)}%`, background: "var(--green)" }}
                    />
                  </div>
                  <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                    Consulta Realizada · Pós-op · Procedimentos
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderConsultas() {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div
            draggable
            onDragStart={() => onDragStart("consultas")}
            onDragEnd={onDragEnd}
            style={{ cursor: "grab", touchAction: "none" }}
            title="Arrastar para reordenar"
          >
            <GripVertical size={14} style={{ color: "var(--muted)", opacity: 0.5 }} />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Consultas
            <span className="font-normal opacity-60"> · {periodLabel(period)}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KPICard
            title="Confirmadas"
            value={consultasConfirmadasData.count}
            subtitle="Confirmação no período"
            icon={<CalendarCheck size={14} />}
            color="#58a6ff"
            loading={loading}
            onClick={() => toggleDrawer("confirmadas")}
            active={activeDrawer === "confirmadas"}
          />
          <KPICard
            title="Avulsa"
            value={avulsaLeads.length}
            subtitle={period === "todos" ? "Todos os clientes avulsa" : "Clientes avulsa no período"}
            icon={<UserRound size={14} />}
            color="#f0883e"
            loading={loading}
            onClick={() => toggleDrawer("avulsa")}
            active={activeDrawer === "avulsa"}
          />
          <KPICard
            title="Trimestral"
            value={trimestralLeads.length}
            subtitle={period === "todos" ? "Todos os trimestrais" : "Clientes trimestrais no período"}
            icon={<Activity size={14} />}
            color="var(--green)"
            loading={loading}
            onClick={() => toggleDrawer("trimestral")}
            active={activeDrawer === "trimestral"}
          />
          <KPICard
            title="Semestral"
            value={semestralLeads.length}
            subtitle={period === "todos" ? "Todos os semestrais" : "Clientes semestrais no período"}
            icon={<TrendingUp size={14} />}
            color="#58a6ff"
            loading={loading}
            onClick={() => toggleDrawer("semestral")}
            active={activeDrawer === "semestral"}
          />
          <KPICard
            title="Anual"
            value={anualLeads.length}
            subtitle={period === "todos" ? "Todos os anuais" : "Clientes anuais no período"}
            icon={<Users size={14} />}
            color="#a371f7"
            loading={loading}
            onClick={() => toggleDrawer("anual")}
            active={activeDrawer === "anual"}
          />
        </div>
      </div>
    );
  }

  function renderEtapasFunil() {
    const pid = hasPipelineNames
      ? (activeFunilPipelineId ?? pipelines.FUNIL_ID)
      : activeFunilTab === "vendas"
      ? pipelines.FUNIL_ID
      : pipelines.CLIENTES_ID;

    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div
            draggable
            onDragStart={() => onDragStart("etapas-funil")}
            onDragEnd={onDragEnd}
            style={{ cursor: "grab", touchAction: "none" }}
            title="Arrastar para reordenar"
          >
            <GripVertical size={14} style={{ color: "var(--muted)", opacity: 0.5 }} />
          </div>
          <BarChart3 size={14} style={{ color: "var(--green)" }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Etapas do Funil
            <span className="font-normal opacity-60"> · {periodLabel(period)}</span>
          </span>
          {hasPipelineNames && (
            <div className="ml-auto flex flex-wrap gap-1">
              {Object.entries(pipelineNames)
                .filter(([, entry]) => !entry.lixeira)
                .map(([idStr, entry]) => {
                  const id = Number(idStr);
                  const isAct = (activeFunilPipelineId ?? pipelines.FUNIL_ID) === id;
                  return (
                    <button
                      key={idStr}
                      onClick={() => setActiveFunilPipelineId(id)}
                      className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
                      style={{
                        background: isAct ? "var(--green)" : "var(--border)",
                        color: isAct ? "#fff" : "var(--muted)",
                      }}
                    >
                      {entry.name}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {activeFunilItems.map((item) => {
            const sid = (item as { statusId?: number }).statusId;
            const isAct = activeStageDrawer?.key === item.key && activeStageDrawer?.pipelineId === pid;
            return (
              <KPICard
                key={item.key}
                title={item.label}
                value={item.value}
                subtitle="leads no período"
                icon={<Users size={14} />}
                color={item.color ?? "var(--green)"}
                loading={loading}
                active={isAct}
                onClick={sid ? () => {
                  setActiveDrawer(null);
                  setActiveStageDrawer(isAct ? null : { key: item.key, label: item.label, statusId: sid, pipelineId: pid });
                } : undefined}
              />
            );
          })}
        </div>
      </div>
    );
  }

  function renderVisaoGeral() {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div
            draggable
            onDragStart={() => onDragStart("visao-geral")}
            onDragEnd={onDragEnd}
            style={{ cursor: "grab", touchAction: "none" }}
            title="Arrastar para reordenar"
          >
            <GripVertical size={14} style={{ color: "var(--muted)", opacity: 0.5 }} />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Visão Geral
            <span className="font-normal opacity-60"> · {periodLabel(period)}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPICard
            title="Leads no Período"
            value={kpis?.totalLeads ?? 0}
            subtitle="Entradas no funil"
            icon={<Users size={14} />}
            color="var(--green)"
            loading={loading}
            onClick={() => toggleDrawer("leads")}
            active={activeDrawer === "leads"}
          />
          <KPICard
            title="Convertidos"
            value={kpis?.conversoes ?? 0}
            subtitle="Leads que viraram clientes ativos"
            icon={<CheckCircle2 size={14} />}
            color="#a371f7"
            loading={loading}
            onClick={() => toggleDrawer("convertidos")}
            active={activeDrawer === "convertidos"}
          />
          <KPICard
            title="Conversas"
            value={conversasPeriodoLeads.length}
            subtitle="Mensagens no período"
            icon={<MessageSquare size={14} />}
            color="#58a6ff"
            loading={loading || chatLoading}
            onClick={() => toggleDrawer("conversas-ontem")}
            active={activeDrawer === "conversas-ontem"}
          />
          <KPICard
            title="Taxa de Conversão"
            value={kpis ? `${kpis.taxaConversao}%` : "—"}
            subtitle="Lead → consulta concluída"
            icon={<Percent size={14} />}
            color="#d29922"
            loading={loading}
            trend={
              kpis
                ? kpis.taxaConversao >= 20
                  ? "up"
                  : kpis.taxaConversao < 5 && kpis.totalLeads > 0
                  ? "down"
                  : "neutral"
                : "neutral"
            }
          />
        </div>
      </div>
    );
  }

  function renderSecoes() {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div
            draggable
            onDragStart={() => onDragStart("secoes")}
            onDragEnd={onDragEnd}
            style={{ cursor: "grab", touchAction: "none" }}
            title="Arrastar para reordenar"
          >
            <GripVertical size={14} style={{ color: "var(--muted)", opacity: 0.5 }} />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Análises
            <span className="font-normal opacity-60"> · {periodLabel(period)}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {topStagesData.length > 0 && (
            <div
              className="rounded-xl border p-5 md:col-span-2 xl:col-span-3"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 size={14} style={{ color: "#a371f7" }} />
                  <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>Etapas com Mais Leads</h3>
                </div>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  Top {topStagesData.length} · todos os funis (exceto lixeira)
                </span>
              </div>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-7 rounded animate-pulse" style={{ background: "var(--border)" }} />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {topStagesData.map((item) => {
                    const maxVal = topStagesData[0]?.value ?? 1;
                    const pct = Math.round((item.value / Math.max(maxVal, 1)) * 100);
                    const isActive = activeStageDrawer?.key === item.key && activeStageDrawer?.pipelineId === null;
                    return (
                      <button
                        key={item.key}
                        onClick={() => {
                          setActiveDrawer(null);
                          setActiveStageDrawer(isActive ? null : { key: item.key, label: item.label, statusId: item.statusId, pipelineId: null });
                        }}
                        className="flex items-center gap-3 w-full text-left rounded-lg px-2 py-1 transition-colors"
                        style={{
                          background: isActive ? "#a371f718" : "transparent",
                          outline: isActive ? "1px solid #a371f740" : "none",
                        }}
                      >
                        <div className="text-xs w-48 shrink-0 truncate" style={{ color: "var(--muted)" }}>
                          {item.label}
                        </div>
                        <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: "var(--border)" }}>
                          <div
                            className="h-full rounded transition-all duration-500"
                            style={{ width: `${Math.max(pct, 2)}%`, background: "#a371f7", opacity: 0.85 }}
                          />
                        </div>
                        <span className="text-xs font-bold w-8 text-right shrink-0" style={{ color: "#a371f7" }}>
                          {item.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div
            className="rounded-xl border p-5 md:col-span-2"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={14} style={{ color: "var(--green)" }} />
                <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                  {hasPipelineNames ? "Funis" : "Funil de Vendas"}
                </h3>
              </div>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {activeFunilTotal} total
              </span>
            </div>

            {hasPipelineNames ? (
              <div className="flex flex-wrap gap-1 mb-4">
                {Object.entries(pipelineNames)
                  .filter(([, entry]) => !entry.lixeira)
                  .map(([idStr, entry]) => {
                    const id = Number(idStr);
                    const isActive = (activeFunilPipelineId ?? pipelines.FUNIL_ID) === id;
                    return (
                      <button
                        key={idStr}
                        onClick={() => setActiveFunilPipelineId(id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                        style={{
                          background: isActive ? "var(--green)" : "var(--border)",
                          color: isActive ? "#fff" : "var(--muted)",
                        }}
                      >
                        {entry.name}
                      </button>
                    );
                  })}
              </div>
            ) : (
              clientesItems.length > 0 && (
                <div className="flex gap-1 mb-4">
                  {(["vendas", "negocia"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveFunilTab(tab)}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: activeFunilTab === tab ? "var(--green)" : "var(--border)",
                        color: activeFunilTab === tab ? "#fff" : "var(--muted)",
                      }}
                    >
                      {tab === "vendas" ? "Funil de Vendas" : "Negociação"}
                    </button>
                  ))}
                </div>
              )
            )}

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-7 rounded animate-pulse" style={{ background: "var(--border)" }} />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeFunilItems.map((item) => {
                  const pct = Math.round((item.value / Math.max(activeFunilTotal, 1)) * 100);
                  const sid = (item as { statusId?: number }).statusId;
                  const pid = hasPipelineNames
                    ? (activeFunilPipelineId ?? pipelines.FUNIL_ID)
                    : activeFunilTab === "vendas"
                    ? pipelines.FUNIL_ID
                    : pipelines.CLIENTES_ID;
                  const isActive = activeStageDrawer?.key === item.key && activeStageDrawer?.pipelineId === pid;
                  const color = item.color ?? "var(--green)";
                  return (
                    <button
                      key={item.key}
                      onClick={() => {
                        if (!sid) return;
                        setActiveDrawer(null);
                        setActiveStageDrawer(isActive ? null : { key: item.key, label: item.label, statusId: sid, pipelineId: pid });
                      }}
                      className="flex items-center gap-3 w-full text-left rounded-lg px-2 py-1 transition-colors"
                      style={{
                        background: isActive ? color + "18" : "transparent",
                        cursor: sid ? "pointer" : "default",
                        outline: isActive ? `1px solid ${color}40` : "none",
                      }}
                    >
                      <div className="text-xs w-44 shrink-0 truncate" style={{ color: "var(--muted)" }}>
                        {item.label}
                      </div>
                      <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: "var(--border)" }}>
                        <div
                          className="h-full rounded transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%`, background: color, opacity: 0.85 }}
                        />
                      </div>
                      <span className="text-xs font-bold w-8 text-right shrink-0" style={{ color }}>
                        {item.value}
                      </span>
                    </button>
                  );
                })}
                {activeFunilItems.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Nenhum dado disponível</p>
                )}
              </div>
            )}
          </div>

          {(stageLabels["CONSULTA_PENDENTE"] || stageLabels["CONSULTA_NAO_CONFIRMADA"]) && (
            <div className="rounded-xl border p-5 flex flex-col gap-4"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2">
                <Stethoscope size={14} style={{ color: "#a371f7" }} />
                <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>Consultas por Médico</h3>
              </div>
              {(() => {
                const amandaCount  = kpis?.byStage["CONSULTA_PENDENTE"]       ?? 0;
                const gabrielCount = kpis?.byStage["CONSULTA_NAO_CONFIRMADA"] ?? 0;
                const total        = amandaCount + gabrielCount;
                const amandaLabel  = stageLabels["CONSULTA_PENDENTE"]       ?? "Consulta Pendente";
                const gabrielLabel = stageLabels["CONSULTA_NAO_CONFIRMADA"] ?? "Não Confirmada";
                return (
                  <div className="space-y-3">
                    {[
                      { label: amandaLabel,  count: amandaCount,  color: "#a371f7" },
                      { label: gabrielLabel, count: gabrielCount, color: "#58a6ff" },
                    ].map(({ label, count, color }) => {
                      const pct = total ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={label}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{label}</span>
                            <span className="text-xs font-bold" style={{ color }}>
                              {count} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs pt-1" style={{ color: "var(--muted)" }}>
                      {total} consultas no total
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {availableSections.has("consultas") && (
            <SectionPanel
              title="Clientes Ativos por Plano"
              icon={<UserRound size={14} />}
              loading={loading}
              items={planoItems.filter((i) => i.value > 0)}
              emptyMsg="Nenhum cliente ativo"
              maxCols={1}
            />
          )}

          {Object.keys(kpis?.byOrigem ?? {}).length > 0 && (
            <SectionPanel
              title="Origem dos Leads"
              icon={<TrendingUp size={14} />}
              loading={loading}
              items={Object.entries(kpis?.byOrigem ?? {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([label, value]) => ({ label, value }))}
              emptyMsg="Nenhuma origem registrada no período"
              maxCols={1}
            />
          )}

          {Object.keys(kpis?.byCidade ?? {}).length > 0 && (
            <SectionPanel
              title="Leads por Cidade"
              icon={<MapPin size={14} />}
              loading={loading}
              items={Object.entries(kpis?.byCidade ?? {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([label, value]) => ({ label, value }))}
              emptyMsg="Nenhuma cidade registrada"
              maxCols={1}
            />
          )}

          {Object.keys(kpis?.byObjetivo ?? {}).length > 0 && (
            <SectionPanel
              title="Objetivo do Cliente"
              icon={<Target size={14} />}
              loading={loading}
              items={Object.entries(kpis?.byObjetivo ?? {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([label, value]) => ({ label, value }))}
              emptyMsg="Nenhum objetivo registrado"
              maxCols={1}
            />
          )}

          {Object.keys(kpis?.byMotivoPerde ?? {}).length > 0 && (
            <SectionPanel
              title="Motivo de Perda"
              icon={<AlertCircle size={14} />}
              loading={loading}
              items={Object.entries(kpis?.byMotivoPerde ?? {})
                .sort((a, b) => b[1] - a[1])
                .map(([label, value]) => ({ label, value, color: "#f85149" }))}
              emptyMsg="Nenhum motivo registrado"
              maxCols={1}
            />
          )}
        </div>
      </div>
    );
  }

  function renderAtendimento() {
    const isLoading = notesLoading || funilLoading;
    const sem = responseTimeMetrics
      ? responseTimeMetrics.totalSampled - responseTimeMetrics.respondedCount
      : null;
    return (
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <div
            draggable
            onDragStart={() => onDragStart("atendimento")}
            onDragEnd={onDragEnd}
            style={{ cursor: "grab", touchAction: "none" }}
            title="Arrastar para reordenar"
          >
            <GripVertical size={14} style={{ color: "var(--muted)", opacity: 0.5 }} />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            Tempo de Atendimento
          </span>
          <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
            Seg–Sex · 08h–17h30 · {responseTimeMetrics?.totalSampled ?? "—"} leads recentes
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Tempo médio */}
          <div
            className="rounded-lg border p-4"
            style={{ background: "var(--bg)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock size={12} style={{ color: "#58a6ff" }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Tempo Médio de Resposta
              </span>
            </div>
            {isLoading ? (
              <div className="h-9 rounded animate-pulse" style={{ background: "var(--border)" }} />
            ) : (
              <>
                <div className="text-4xl font-bold tracking-tight" style={{ color: "#58a6ff" }}>
                  {responseTimeMetrics?.avgDisplay ?? "—"}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {responseTimeMetrics
                    ? `${responseTimeMetrics.respondedCount} leads respondidos`
                    : "Calculando..."}
                </p>
              </>
            )}
          </div>

          {/* Conversas encerradas */}
          <div
            className="rounded-lg border p-4"
            style={{ background: "var(--bg)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCheck size={12} style={{ color: "#3fb950" }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Conversas Encerradas
              </span>
            </div>
            {isLoading ? (
              <div className="h-9 rounded animate-pulse" style={{ background: "var(--border)" }} />
            ) : (
              <>
                <div className="text-4xl font-bold tracking-tight" style={{ color: "#3fb950" }}>
                  {responseTimeMetrics?.closedCount ?? "—"}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Despedida detectada (até mais, tchau…)
                </p>
              </>
            )}
          </div>

          {/* Sem resposta ainda */}
          <div
            className="rounded-lg border p-4"
            style={{ background: "var(--bg)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={12} style={{ color: "#f0883e" }} />
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Sem Resposta
              </span>
            </div>
            {isLoading ? (
              <div className="h-9 rounded animate-pulse" style={{ background: "var(--border)" }} />
            ) : (
              <>
                <div className="text-4xl font-bold tracking-tight" style={{ color: "#f0883e" }}>
                  {sem ?? "—"}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Aguardando primeira resposta
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const sectionRenderers: Record<string, () => React.ReactNode> = {
    followup: renderFollowUp,
    "qualificacao-ia": renderQualificacaoIA,
    consultas: renderConsultas,
    "etapas-funil": renderEtapasFunil,
    "visao-geral": renderVisaoGeral,
    secoes: renderSecoes,
    atendimento: renderAtendimento,
  };

  return (
    <div className="flex-1 overflow-y-auto h-full">
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>
            {clientName || "Dashboard"}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
            {activePipelineId
              ? `Visualizando: ${pipelineNames[String(activePipelineId)]?.name ?? "Funil"} · ${pipelineLeadsMap.get(activePipelineId)?.length ?? "..."} leads`
              : funilLeads
              ? `${funilLeads.length} leads no funil · ${clientesLeads?.length ?? 0} clientes ativos`
              : "Carregando dados..."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex rounded-lg overflow-hidden border"
            style={{ borderColor: "var(--border)" }}
          >
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: period === opt.value ? "var(--green)" : "var(--card)",
                  color: period === opt.value ? "#000" : "var(--muted)",
                }}
              >
                {opt.value === "custom" ? (
                  <span className="flex items-center gap-1">
                    <CalendarRange size={11} />
                    Período
                  </span>
                ) : (
                  opt.label
                )}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
              style={{ background: "var(--card)", borderColor: "var(--green)" }}
            >
              <CalendarRange size={11} style={{ color: "var(--green)" }} />
              <label className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "var(--muted)" }}>De</span>
                <input
                  type="date"
                  value={customFromStr}
                  onChange={(e) => setCustomFromStr(e.target.value)}
                  className="bg-transparent text-xs outline-none"
                  style={{ color: "var(--text)", colorScheme: "dark" }}
                />
              </label>
              <span className="text-xs" style={{ color: "var(--muted)" }}>—</span>
              <label className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "var(--muted)" }}>Até</span>
                <input
                  type="date"
                  value={customToStr}
                  onChange={(e) => setCustomToStr(e.target.value)}
                  className="bg-transparent text-xs outline-none"
                  style={{ color: "var(--text)", colorScheme: "dark" }}
                />
              </label>
            </div>
          )}

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--muted)",
              opacity: isFetching ? 0.6 : 1,
            }}
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Pipeline selector ────────────────────────────────────────────── */}
      {Object.keys(pipelineNames).length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActivePipelineId(null)}
            className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
            style={{
              background: activePipelineId === null ? "var(--green)" : "var(--card)",
              borderColor: activePipelineId === null ? "var(--green)" : "var(--border)",
              color: activePipelineId === null ? "#000" : "var(--muted)",
            }}
          >
            Todos
          </button>
          {Object.entries(pipelineNames).map(([idStr, entry]) => {
            const id = Number(idStr);
            const isActive = activePipelineId === id;
            const isLixeira = entry.lixeira;
            return (
              <button
                key={idStr}
                onClick={() => setActivePipelineId(isActive ? null : id)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                style={{
                  background: isActive ? (isLixeira ? "#f85149" : "var(--green)") : "var(--card)",
                  borderColor: isActive ? (isLixeira ? "#f85149" : "var(--green)") : "var(--border)",
                  color: isActive ? (isLixeira ? "#fff" : "#000") : isLixeira ? "#f85149" : "var(--muted)",
                }}
              >
                {entry.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {funilError && (
        <div
          className="flex items-center gap-3 rounded-xl border p-4"
          style={{
            background: "rgba(248,81,73,0.1)",
            borderColor: "rgba(248,81,73,0.3)",
            color: "#f85149",
          }}
        >
          <AlertCircle size={16} />
          <div>
            <p className="text-sm font-medium">Erro ao carregar dados</p>
            <p className="text-xs mt-0.5 opacity-80">{(funilError as Error).message}</p>
          </div>
        </div>
      )}

      {/* ── Seções reordenáveis ────────────────────────────────────────────── */}
      {sectionOrder.filter((id) => availableSections.has(id) && !hiddenSections.includes(id)).map((id) => (
        <div
          key={id}
          onDragOver={(e) => onDragOver(e, id)}
          onDrop={() => onDrop(id)}
          style={{
            outline: dragOverId === id ? "2px solid var(--green)" : "2px solid transparent",
            borderRadius: "12px",
            transition: "outline-color 0.15s",
          }}
        >
          {sectionRenderers[id]?.()}
        </div>
      ))}

      {/* ── Drawers ───────────────────────────────────────────────────────── */}
      {activeDrawer === "leads" && (
        <LeadDrawer
          title={`Leads no Período — ${FILTER_OPTIONS.find((f) => f.value === period)?.label}`}
          leads={leadsInPeriod}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "confirmadas" && (
        <LeadDrawer
          title="Consultas Confirmadas"
          leads={confirmadosLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "convertidos" && (
        <LeadDrawer
          title="Leads Convertidos → Clientes Ativos"
          leads={convertidasLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "fups" && kpis && (
        <LeadDrawer
          title="Follow-ups Pendentes"
          leads={kpis.fupLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "reativados" && (
        <LeadDrawer
          title="Leads Reativados (responderam ao follow-up)"
          leads={reativadosLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "ignorados" && (
        <LeadDrawer
          title="Leads Ignorados (não responderam ao follow-up)"
          leads={ignoradosLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "avulsa" && (
        <LeadDrawer
          title="Clientes — Consulta Avulsa"
          leads={avulsaLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "trimestral" && (
        <LeadDrawer
          title="Clientes — Plano Trimestral"
          leads={trimestralLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "semestral" && (
        <LeadDrawer
          title="Clientes — Plano Semestral"
          leads={semestralLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}
      {activeDrawer === "anual" && (
        <LeadDrawer
          title="Clientes — Plano Anual"
          leads={anualLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}

      {activeDrawer === "conversas-ontem" && (
        <LeadDrawer
          title={`Conversas — ${FILTER_OPTIONS.find(f => f.value === period)?.label ?? period} (${conversasPeriodoLeads.length})`}
          leads={conversasPeriodoLeads}
          onClose={() => setActiveDrawer(null)}
          subdomain={subdomain}
        />
      )}

      {activeStageDrawer && (
        <LeadDrawer
          title={`${activeStageDrawer.label} — ${FILTER_OPTIONS.find((f) => f.value === period)?.label ?? period}`}
          leads={stageDrawerLeads}
          onClose={() => setActiveStageDrawer(null)}
          subdomain={subdomain}
        />
      )}

      {/* Footer */}
      <div className="text-center pt-2 pb-4">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Dados via Kommo API · Cache 2min · Conta: {clientName} ({subdomain}.kommo.com)
        </p>
      </div>
    </div>
    </div>
  );
}
