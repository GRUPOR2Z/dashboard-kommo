import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, Users, PhoneForwarded, CheckCircle,
  Zap, Loader2, RefreshCw, CalendarRange, AlarmClock,
  Clock, UserPlus, CreditCard, BarChart2, TrendingUp,
} from "lucide-react";
import { fetchAllInteractions, fetchWorkspaceReports } from "../lib/gptmaker";
import { useClientConfig } from "../contexts/ClientConfigContext";
import type { GptInteraction } from "../lib/gptmaker";
import type { FilterPeriod } from "../lib/types";

// ── Filter helpers ─────────────────────────────────────────────────────────────

const FILTER_OPTIONS: { label: string; value: FilterPeriod }[] = [
  { label: "Hoje", value: "hoje" },
  { label: "Ontem", value: "ontem" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "Todos", value: "todos" },
  { label: "Período", value: "custom" },
];

function toMs(dateStr: string, endOfDay = false): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function interactionInPeriod(
  startAt: number,
  period: FilterPeriod,
  todayStart: number,
  now: number,
  customMs?: { from: number; to: number }
): boolean {
  if (period === "todos") return true;
  if (period === "custom" && customMs) return startAt >= customMs.from && startAt <= customMs.to;
  const DAY = 86400000;
  switch (period) {
    case "hoje":  return startAt >= todayStart && startAt <= now;
    case "ontem": return startAt >= todayStart - DAY && startAt < todayStart;
    case "7d":    return startAt >= todayStart - 7 * DAY && startAt <= now;
    case "30d":   return startAt >= todayStart - 30 * DAY && startAt <= now;
    default:      return true;
  }
}

function periodToTimestamps(
  period: FilterPeriod,
  customMs?: { from: number; to: number }
): { from: number; to: number } {
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const DAY = 86400000;
  if (period === "custom" && customMs) return customMs;
  switch (period) {
    case "hoje":  return { from: todayStart, to: now };
    case "ontem": return { from: todayStart - DAY, to: todayStart - 1 };
    case "7d":    return { from: todayStart - 7 * DAY, to: now };
    case "30d":   return { from: todayStart - 30 * DAY, to: now };
    default:      return { from: 0, to: now };
  }
}

// ── Metrics helpers ────────────────────────────────────────────────────────────

function avgDurationMinutes(interactions: GptInteraction[]): string {
  const resolved = interactions.filter((i) => i.resolvedAt && i.startAt);
  if (!resolved.length) return "—";
  const avg = resolved.reduce((sum, i) => sum + (i.resolvedAt! - i.startAt), 0) / resolved.length;
  const mins = Math.floor(avg / 1000 / 60);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

// ── Follow-up buckets ─────────────────────────────────────────────────────────

const FUP_BUCKETS = [
  { key: "fresh", label: "Sem follow-up", sub: "< 30 min",   color: "#58a6ff" },
  { key: "fup1",  label: "Follow-up 1",  sub: "30 min – 2h", color: "#a371f7" },
  { key: "fup2",  label: "Follow-up 2",  sub: "2h – 1 dia",  color: "#f0883e" },
  { key: "fup3",  label: "Follow-up 3",  sub: "1 – 3 dias",  color: "#d29922" },
  { key: "fup4",  label: "Follow-up 4",  sub: "3 – 7 dias",  color: "#f85149" },
  { key: "final", label: "Encerramento", sub: "> 7 dias",     color: "#6e7681" },
] as const;

type BucketKey = typeof FUP_BUCKETS[number]["key"];

const MIN30 = 30 * 60 * 1000;
const H2    = 2  * 60 * 60 * 1000;
const D1    = 24 * 60 * 60 * 1000;
const D3    = 3  * 24 * 60 * 60 * 1000;
const D7    = 7  * 24 * 60 * 60 * 1000;

function bucketByElapsed(elapsed: number): BucketKey {
  if      (elapsed < MIN30) return "fresh";
  else if (elapsed < H2)    return "fup1";
  else if (elapsed < D1)    return "fup2";
  else if (elapsed < D3)    return "fup3";
  else if (elapsed < D7)    return "fup4";
  else                      return "final";
}

function emptyBuckets(): Record<BucketKey, number> {
  return { fresh: 0, fup1: 0, fup2: 0, fup3: 0, fup4: 0, final: 0 };
}

function computeFollowUpBuckets(waiting: GptInteraction[]) {
  const now = Date.now();
  const counts = emptyBuckets();
  for (const i of waiting) counts[bucketByElapsed(now - i.startAt)]++;
  return counts;
}

function computeReactivationBuckets(resolved: GptInteraction[]) {
  const counts = emptyBuckets();
  for (const i of resolved) {
    if (!i.resolvedAt) continue;
    counts[bucketByElapsed(i.resolvedAt - i.startAt)]++;
  }
  return counts;
}

// ── Components ────────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color, wide = false }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string; wide?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 flex flex-col gap-3${wide ? " col-span-2" : ""}`}
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: color + "22" }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{sub}</p>}
      </div>
    </div>
  );
}

function StatusBar({ running, waiting, resolved, total }: {
  running: number; waiting: number; resolved: number; total: number;
}) {
  if (!total) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-medium mb-3" style={{ color: "var(--muted)" }}>Distribuição de status</p>
      <div className="flex rounded-full overflow-hidden h-3 mb-3">
        <div style={{ width: `${(running / total) * 100}%`, background: "#58a6ff" }} />
        <div style={{ width: `${(waiting / total) * 100}%`, background: "#f0883e" }} />
        <div style={{ width: `${(resolved / total) * 100}%`, background: "#3fb950" }} />
      </div>
      <div className="flex gap-4 text-xs" style={{ color: "var(--muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#58a6ff" }} />
          Em andamento · {running}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#f0883e" }} />
          Aguardando · {waiting}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#3fb950" }} />
          Resolvidos · {resolved}
        </span>
      </div>
    </div>
  );
}

function HourlyTimeline({ interactions }: { interactions: GptInteraction[] }) {
  const { counts, maxCount, top3 } = useMemo(() => {
    const c = new Array(24).fill(0);
    for (const i of interactions) {
      const hour = new Date(i.startAt).getHours();
      c[hour]++;
    }
    const max = Math.max(...c, 1);
    const sorted = c.map((v, h) => ({ h, v })).sort((a, b) => b.v - a.v);
    return { counts: c, maxCount: max, top3: sorted.slice(0, 3) };
  }, [interactions]);

  const peakHour = counts.indexOf(maxCount);

  return (
    <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 size={14} style={{ color: "#d29922" }} />
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Timeline de Consumo</span>
        <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
          Pico de atendimentos por hora do dia
        </span>
      </div>

      {/* Top 3 peak hours */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {top3.map(({ h, v }, idx) => (
          <div key={h} className="rounded-lg p-3 text-center"
            style={{
              background: idx === 0 ? "#d2992220" : "var(--bg)",
              border: `1px solid ${idx === 0 ? "#d29922" : "var(--border)"}`,
            }}>
            {idx === 0 && (
              <p className="text-xs font-medium mb-1" style={{ color: "#d29922" }}>☀ Pico</p>
            )}
            {idx === 1 && (
              <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>☀ 2°</p>
            )}
            {idx === 2 && (
              <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>↗ 3°</p>
            )}
            <p className="text-xl font-bold" style={{ color: idx === 0 ? "#d29922" : "var(--text)" }}>
              {String(h).padStart(2, "0")}:00
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{v} atendimento{v !== 1 ? "s" : ""}</p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-0.5" style={{ height: "64px" }}>
        {counts.map((count, hour) => {
          const pct = maxCount > 0 ? (count / maxCount) : 0;
          const isPeak = hour === peakHour && count > 0;
          const isTop3 = top3.slice(0, 3).some((t) => t.h === hour && t.v > 0);
          return (
            <div key={hour} className="flex-1 flex flex-col justify-end relative group"
              style={{ height: "100%" }}
              title={`${String(hour).padStart(2, "0")}h: ${count} atendimentos`}>
              <div className="w-full rounded-t transition-all duration-300"
                style={{
                  height: count > 0 ? `${Math.max(pct * 100, 5)}%` : "2px",
                  background: isPeak ? "#d29922" : isTop3 ? "#a371f755" : "var(--border)",
                  minHeight: "2px",
                }}
              />
              {/* Hover tooltip label */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1 py-0.5 rounded text-xs whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 z-10"
                style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis */}
      <div className="flex justify-between mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}h</span>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardIA() {
  const { gptmakerWorkspaceId, loading: configLoading } = useClientConfig();

  const [period, setPeriod] = useState<FilterPeriod>("30d");
  const todayStr = new Date().toISOString().split("T")[0];
  const thirtyAgoStr = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [customFromStr, setCustomFromStr] = useState(thirtyAgoStr);
  const [customToStr, setCustomToStr] = useState(todayStr);

  const customMs =
    period === "custom" && customFromStr && customToStr
      ? { from: toMs(customFromStr, false), to: toMs(customToStr, true) }
      : undefined;

  const { data: interactions = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["gptmaker-interactions", gptmakerWorkspaceId],
    queryFn: () => fetchAllInteractions(gptmakerWorkspaceId!),
    enabled: !!gptmakerWorkspaceId && !configLoading,
    staleTime: 5 * 60 * 1000,
  });

  // Credits / reports (optional — gracefully ignored if endpoint unavailable)
  const { from: rFrom, to: rTo } = periodToTimestamps(period, customMs);
  const { data: creditsReport } = useQuery({
    queryKey: ["gptmaker-reports", gptmakerWorkspaceId, period, rFrom, rTo],
    queryFn: () => fetchWorkspaceReports(gptmakerWorkspaceId!, rFrom, rTo),
    enabled: !!gptmakerWorkspaceId && !configLoading,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  const filteredInteractions = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const now = Date.now();
    return interactions.filter((i) =>
      interactionInPeriod(i.startAt, period, todayStart, now, customMs)
    );
  }, [interactions, period, customMs]);

  const metrics = useMemo(() => {
    const total       = filteredInteractions.length;
    const running     = filteredInteractions.filter((i) => i.status === "RUNNING").length;
    const waiting     = filteredInteractions.filter((i) => i.status === "WAITING").length;
    const resolved    = filteredInteractions.filter((i) => i.status === "RESOLVED").length;
    const transferred = filteredInteractions.filter((i) => i.transferAt !== null).length;
    const autonomous  = filteredInteractions.filter((i) => i.status === "RESOLVED" && !i.transferAt).length;
    const newContacts = new Set(filteredInteractions.map((i) => i.contactId)).size;

    // Credits from interaction objects (if API returns them)
    const hasCreditsInData = filteredInteractions.some((i) => (i.credits ?? 0) > 0);
    const totalCreditsLocal = hasCreditsInData
      ? filteredInteractions.reduce((s, i) => s + (i.credits ?? 0), 0)
      : null;
    const avgCreditsLocal = (hasCreditsInData && total > 0)
      ? Math.round((totalCreditsLocal! / total) * 10) / 10
      : null;

    // Message counts from interaction objects
    const hasMsgData = filteredInteractions.some((i) => (i.messages ?? 0) > 0);
    const msgCounts = hasMsgData ? filteredInteractions.map((i) => i.messages ?? 0) : [];
    const avgMessages = msgCounts.length > 0
      ? Math.round(msgCounts.reduce((a, b) => a + b, 0) / msgCounts.length * 10) / 10
      : null;

    const transferRate   = total   ? Math.round((transferred / total)   * 100) : 0;
    const resolveRate    = total   ? Math.round((resolved   / total)   * 100) : 0;
    const efficiencyRate = resolved ? Math.round((autonomous / resolved) * 100) : 0;
    const avgDuration    = avgDurationMinutes(filteredInteractions);

    return {
      total, running, waiting, resolved, transferred, autonomous, newContacts,
      totalCreditsLocal, avgCreditsLocal, avgMessages,
      transferRate, resolveRate, efficiencyRate, avgDuration,
    };
  }, [filteredInteractions]);

  // Credits from reports endpoint (preferred over interaction-level data)
  const creditsDisplay = useMemo(() => {
    if (!creditsReport) return metrics.totalCreditsLocal !== null ? {
      total: metrics.totalCreditsLocal!,
      avg: metrics.avgCreditsLocal ?? 0,
      cost: null,
    } : null;

    const total = (creditsReport.totalCredits ?? creditsReport.credits ?? null);
    const cost  = (creditsReport.totalCost ?? creditsReport.cost ?? null);
    const avg   = (total !== null && metrics.total > 0) ? Math.round((total / metrics.total) * 10) / 10 : null;
    if (total === null && cost === null) return null;
    return {
      total: typeof total === "number" ? total : null,
      avg: typeof avg === "number" ? avg : null,
      cost: typeof cost === "number" ? cost : null,
    };
  }, [creditsReport, metrics]);

  const avgInteractions = useMemo(() => {
    if (metrics.avgMessages !== null) return metrics.avgMessages;
    if (creditsReport?.interactions && metrics.total > 0) {
      return Math.round(((creditsReport.interactions as number) / metrics.total) * 10) / 10;
    }
    return null;
  }, [metrics.avgMessages, creditsReport, metrics.total]);

  const followUpBuckets = useMemo(() => {
    const waiting  = filteredInteractions.filter((i) => i.status === "WAITING");
    const resolved = filteredInteractions.filter((i) => i.status === "RESOLVED" && !!i.resolvedAt);
    const reactivated = resolved.filter((i) => (i.resolvedAt! - i.startAt) > MIN30).length;
    const reactivationRate = resolved.length ? Math.round((reactivated / resolved.length) * 100) : 0;
    return {
      waiting:      { counts: computeFollowUpBuckets(waiting),      total: waiting.length },
      reactivation: { counts: computeReactivationBuckets(resolved), total: resolved.length },
      reactivated,
      reactivationRate,
    };
  }, [filteredInteractions]);

  if (!gptmakerWorkspaceId && !configLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ background: "var(--bg)" }}>
        <Bot size={36} style={{ color: "var(--border)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Agente IA não configurado</p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>Este cliente não possui integração com Agente IA</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--green-dim)" }}>
              <Bot size={18} style={{ color: "var(--green)" }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>Dashboard IA</h1>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Métricas da IA — Agente IA</p>
            </div>
            {isLoading && <Loader2 size={16} className="animate-spin" style={{ color: "var(--muted)" }} />}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              {FILTER_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => setPeriod(opt.value)}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: period === opt.value ? "var(--green)" : "var(--card)",
                    color: period === opt.value ? "#000" : "var(--muted)",
                  }}>
                  {opt.value === "custom"
                    ? <span className="flex items-center gap-1"><CalendarRange size={11} />Período</span>
                    : opt.label}
                </button>
              ))}
            </div>

            {period === "custom" && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                style={{ background: "var(--card)", borderColor: "var(--green)" }}>
                <CalendarRange size={11} style={{ color: "var(--green)" }} />
                <label className="flex items-center gap-1">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>De</span>
                  <input type="date" value={customFromStr} onChange={(e) => setCustomFromStr(e.target.value)}
                    className="bg-transparent text-xs outline-none"
                    style={{ color: "var(--text)", colorScheme: "dark" }} />
                </label>
                <span className="text-xs" style={{ color: "var(--muted)" }}>—</span>
                <label className="flex items-center gap-1">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Até</span>
                  <input type="date" value={customToStr} onChange={(e) => setCustomToStr(e.target.value)}
                    className="bg-transparent text-xs outline-none"
                    style={{ color: "var(--text)", colorScheme: "dark" }} />
                </label>
              </div>
            )}

            <button onClick={() => refetch()} disabled={isFetching}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted)", opacity: isFetching ? 0.6 : 1 }}>
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
              Atualizar
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "#f8514922", color: "#f85149" }}>
            Erro ao carregar dados: {(error as Error).message}
          </div>
        )}

        {/* Row 1 — main metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={Users}      label="Total de Atendimentos" value={metrics.total}        color="#58a6ff" />
          <MetricCard icon={UserPlus}   label="Novos Contatos"        value={metrics.newContacts}   color="#a371f7"
            sub="contatos únicos no período" />
          <MetricCard icon={CheckCircle} label="Resolvidos"           value={metrics.resolved}      color="#3fb950"
            sub={`${metrics.resolveRate}% do total`} />
          <MetricCard icon={PhoneForwarded} label="Transferências"    value={metrics.transferred}   color="#f0883e"
            sub={`${metrics.transferRate}% do total`} />
        </div>

        {/* Row 2 — secondary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={Clock} label="Tempo Médio de Resolução" value={metrics.avgDuration} color="#58a6ff"
            sub={`${metrics.resolved} atendimentos resolvidos`} />
          <MetricCard icon={TrendingUp} label="Eficiência da IA" value={`${metrics.efficiencyRate}%`} color="#3fb950"
            sub={`${metrics.autonomous} resolvidos sem humano`} />
          {creditsDisplay?.total !== null && creditsDisplay !== null && (
            <MetricCard icon={CreditCard} label="Créditos Gastos" value={creditsDisplay.total!} color="#d29922"
              sub={creditsDisplay.avg !== null ? `média ${creditsDisplay.avg} por atendimento` : undefined} />
          )}
          {avgInteractions !== null && (
            <MetricCard icon={BarChart2} label="Média de Interações" value={avgInteractions} color="#a371f7"
              sub="interações por atendimento" />
          )}
        </div>

        {/* Status bar */}
        <StatusBar running={metrics.running} waiting={metrics.waiting} resolved={metrics.resolved} total={metrics.total} />

        {/* Timeline de Consumo */}
        {filteredInteractions.length > 0 && (
          <HourlyTimeline interactions={filteredInteractions} />
        )}

        {/* Follow-ups da IA */}
        {(followUpBuckets.waiting.total > 0 || followUpBuckets.reactivation.total > 0) && (
          <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
              <AlarmClock size={14} style={{ color: "#f0883e" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Follow-ups da IA</span>
              <span className="ml-auto flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "#f0883e22", color: "#f0883e" }}>
                  {followUpBuckets.waiting.total} aguardando
                </span>
                {followUpBuckets.reactivation.total > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: "#3fb95022", color: "#3fb950" }}>
                    {followUpBuckets.reactivationRate}% reativação
                  </span>
                )}
              </span>
            </div>

            {followUpBuckets.waiting.total > 0 && (
              <div className="p-4 space-y-3">
                <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                  Aguardando resposta — {followUpBuckets.waiting.total} leads
                </p>
                {FUP_BUCKETS.map((bucket) => {
                  const count = followUpBuckets.waiting.counts[bucket.key];
                  const pct   = followUpBuckets.waiting.total
                    ? Math.round((count / followUpBuckets.waiting.total) * 100) : 0;
                  return (
                    <div key={bucket.key} className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
                        <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{bucket.label}</p>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>{bucket.sub}</p>
                      </div>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${count > 0 ? Math.max(pct, 1) : 0}%`, background: bucket.color }} />
                      </div>
                      <span className="text-xs font-bold w-8 text-right shrink-0" style={{ color: bucket.color }}>{count}</span>
                      <span className="text-xs w-8 shrink-0" style={{ color: "var(--muted)" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {followUpBuckets.reactivation.total > 0 && (
              <div className="p-4 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                    Reativados (responderam após follow-up) — {followUpBuckets.reactivated} de {followUpBuckets.reactivation.total}
                  </p>
                  <span className="text-xs font-bold" style={{ color: "#3fb950" }}>
                    {followUpBuckets.reactivationRate}%
                  </span>
                </div>
                {FUP_BUCKETS.filter((b) => b.key !== "fresh").map((bucket) => {
                  const count = followUpBuckets.reactivation.counts[bucket.key];
                  const pct   = followUpBuckets.reactivated > 0
                    ? Math.round((count / followUpBuckets.reactivated) * 100) : 0;
                  if (!count) return null;
                  return (
                    <div key={bucket.key} className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
                        <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{bucket.label}</p>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>{bucket.sub}</p>
                      </div>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${count > 0 ? Math.max(pct, 1) : 0}%`, background: "#3fb950" }} />
                      </div>
                      <span className="text-xs font-bold w-8 text-right shrink-0" style={{ color: "#3fb950" }}>{count}</span>
                      <span className="text-xs w-8 shrink-0" style={{ color: "var(--muted)" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-4 py-2 border-t" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Estimativa baseada no tempo desde o início da interação. Reativação = resolvidos após 30min.
              </p>
            </div>
          </div>
        )}

        {/* Atendimentos ativos */}
        <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
            <Zap size={14} style={{ color: "var(--green)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Atendimentos ativos</span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--green-dim)", color: "var(--green)" }}>
              {metrics.running + metrics.waiting}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {filteredInteractions
              .filter((i) => i.status !== "RESOLVED")
              .slice(0, 10)
              .map((i) => (
                <div key={i.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: "var(--green-dim)", color: "var(--green)" }}>
                    {(i.contactName || "?").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{i.contactName}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{i.agentName} · #{i.protocol}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: i.status === "RUNNING" ? "#58a6ff22" : "#f0883e22",
                      color:      i.status === "RUNNING" ? "#58a6ff"   : "#f0883e",
                    }}>
                    {i.status === "RUNNING" ? "Em andamento" : "Aguardando"}
                  </span>
                </div>
              ))}
            {metrics.running + metrics.waiting === 0 && (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                Nenhum atendimento ativo no momento
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
