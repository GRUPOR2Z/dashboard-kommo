import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
  RotateCcw,
  XCircle,
  Percent,
  CalendarCheck,
  CalendarRange,
  GripVertical,
  MessageSquare,
  CheckCheck,
} from "lucide-react";
import type { FilterPeriod } from "../lib/types";
import {
  fetchLeadsByPipeline,
  fetchStatusEvents,
  fetchNotesSample,
  leadInPeriod,
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
  | null;

const FILTER_OPTIONS: { label: string; value: FilterPeriod }[] = [
  { label: "Hoje", value: "hoje" },
  { label: "Ontem", value: "ontem" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "Todos", value: "todos" },
  { label: "Período", value: "custom" },
];

const DEFAULT_SECTION_ORDER = ["followup", "consultas", "visao-geral", "secoes", "atendimento"];
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
  const { subdomain, clientName, pipelines, fieldIds, loading: configLoading } = useClientConfig();

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
      const from = now - 90 * 86400;
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

  const loading = configLoading || funilLoading || clientesLoading || statusLoading;

  // ── Sections available for this client's pipeline config ───────────────────
  const availableSections = useMemo(() => {
    const hasFup = pipelines.FUP_1 > 0 || pipelines.FUP_2 > 0 || pipelines.FUP_3 > 0;
    const hasPlanos = pipelines.AVULSA > 0 || pipelines.TRIMESTRAL > 0 || pipelines.SEMESTRAL > 0 || pipelines.ANUAL > 0;
    return new Set([
      ...(hasFup ? ["followup"] : []),
      ...(hasPlanos ? ["consultas"] : []),
      "visao-geral",
      "secoes",
      "atendimento",
    ]);
  }, [pipelines]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!funilLeads || !clientesLeads || !statusEvents) return null;
    return computeKPIs(funilLeads, clientesLeads, period, statusEvents, customDates, pipelines, fieldIds);
  }, [funilLeads, clientesLeads, statusEvents, period, customDates, pipelines, fieldIds]);

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

  const avulsaLeads = useMemo(
    () => (clientesLeads ?? []).filter((l) => l.status_id === pipelines.AVULSA),
    [clientesLeads, pipelines]
  );
  const trimestralLeads = useMemo(
    () => (clientesLeads ?? []).filter((l) => l.status_id === pipelines.TRIMESTRAL),
    [clientesLeads, pipelines]
  );
  const semestralLeads = useMemo(
    () => (clientesLeads ?? []).filter((l) => l.status_id === pipelines.SEMESTRAL),
    [clientesLeads, pipelines]
  );
  const anualLeads = useMemo(
    () => (clientesLeads ?? []).filter((l) => l.status_id === pipelines.ANUAL),
    [clientesLeads, pipelines]
  );

  function toggleDrawer(d: ActiveDrawer) {
    setActiveDrawer((prev) => (prev === d ? null : d));
  }

  const funilItems = FUNIL_STAGES.map((s) => ({
    label: s.label,
    value: kpis?.byStage[s.key] ?? 0,
    color:
      s.key === "GANHO"
        ? "var(--green)"
        : s.key.includes("PERDIDO")
        ? "#f85149"
        : s.key.includes("FUP")
        ? "#f0883e"
        : s.key.includes("CONFIRMADA")
        ? "#58a6ff"
        : undefined,
  })).filter((i) => i.value > 0);

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
              <GripVertical size={14} style={{ color: "var(--muted)", opacity: 0.5 }} />
            </div>
            <RotateCcw size={14} style={{ color: "#3fb950" }} />
            <h2 className="font-semibold text-sm" style={{ color: "var(--text)" }}>
              Follow-up
            </h2>
          </div>
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
            <div className="text-3xl font-bold" style={{ color: "var(--text)" }}>
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
            <div className="text-3xl font-bold" style={{ color: "#3fb950" }}>
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
            <div className="text-3xl font-bold" style={{ color: "#f85149" }}>
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
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Consultas
          </h2>
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
            subtitle="Clientes com plano avulso"
            icon={<UserRound size={14} />}
            color="#f0883e"
            loading={loading}
            onClick={() => toggleDrawer("avulsa")}
            active={activeDrawer === "avulsa"}
          />
          <KPICard
            title="Trimestral"
            value={trimestralLeads.length}
            subtitle="Clientes trimestrais"
            icon={<Activity size={14} />}
            color="var(--green)"
            loading={loading}
            onClick={() => toggleDrawer("trimestral")}
            active={activeDrawer === "trimestral"}
          />
          <KPICard
            title="Semestral"
            value={semestralLeads.length}
            subtitle="Clientes semestrais"
            icon={<TrendingUp size={14} />}
            color="#58a6ff"
            loading={loading}
            onClick={() => toggleDrawer("semestral")}
            active={activeDrawer === "semestral"}
          />
          <KPICard
            title="Anual"
            value={anualLeads.length}
            subtitle="Clientes anuais"
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
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Visão Geral
          </h2>
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
            title="Clientes Ativos"
            value={kpis?.totalClientesAtivos ?? 0}
            subtitle="Total em acompanhamento"
            icon={<Activity size={14} />}
            color="#f0883e"
            loading={loading}
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
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Análises
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            className="rounded-xl border p-5 md:col-span-2"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 size={14} style={{ color: "var(--green)" }} />
                <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>
                  Funil de Vendas — Todos os leads
                </h3>
              </div>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {funilLeads?.length ?? 0} total
              </span>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-7 rounded animate-pulse" style={{ background: "var(--border)" }} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {funilItems.map((item) => {
                  const pct = Math.round(((item.value / Math.max(funilLeads?.length ?? 1, 1)) * 100));
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="text-xs w-44 shrink-0 truncate" style={{ color: "var(--muted)" }}>
                        {item.label}
                      </div>
                      <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: "var(--border)" }}>
                        <div
                          className="h-full rounded flex items-center px-2 transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%`, background: item.color ?? "var(--green)", opacity: 0.85 }}
                        />
                      </div>
                      <span className="text-xs font-bold w-8 text-right shrink-0" style={{ color: item.color ?? "var(--green)" }}>
                        {item.value}
                      </span>
                    </div>
                  );
                })}
                {funilItems.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Nenhum dado disponível</p>
                )}
              </div>
            )}
          </div>

          <SectionPanel
            title="Clientes Ativos por Plano"
            icon={<UserRound size={14} />}
            loading={loading}
            items={planoItems.filter((i) => i.value > 0)}
            emptyMsg="Nenhum cliente ativo"
            maxCols={1}
          />

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
          <Clock size={14} style={{ color: "#58a6ff" }} />
          <h2 className="font-semibold text-sm" style={{ color: "var(--text)" }}>
            Tempo de Atendimento
          </h2>
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
                <div className="text-3xl font-bold" style={{ color: "#58a6ff" }}>
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
                <div className="text-3xl font-bold" style={{ color: "#3fb950" }}>
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
                <div className="text-3xl font-bold" style={{ color: "#f0883e" }}>
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
    consultas: renderConsultas,
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
            {funilLeads
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
      {sectionOrder.filter((id) => availableSections.has(id)).map((id) => (
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
