import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, Users, PhoneForwarded, CheckCircle,
  Zap, Loader2, RefreshCw, CalendarRange, AlarmClock,
} from "lucide-react";
import { fetchAllInteractions } from "../lib/gptmaker";
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

// ── Metrics helpers ────────────────────────────────────────────────────────────

function avgDurationMinutes(interactions: GptInteraction[]): string {
  const resolved = interactions.filter((i) => i.resolvedAt && i.startAt);
  if (!resolved.length) return "—";
  const avg = resolved.reduce((sum, i) => sum + (i.resolvedAt! - i.startAt), 0) / resolved.length;
  const mins = Math.floor(avg / 1000 / 60);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

// ── Follow-up / reactivation buckets ──────────────────────────────────────────

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

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3"
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

// ── Status bar ────────────────────────────────────────────────────────────────

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
    const transferRate   = total   ? Math.round((transferred / total)   * 100) : 0;
    const resolveRate    = total   ? Math.round((resolved   / total)   * 100) : 0;
    const efficiencyRate = resolved ? Math.round((autonomous / resolved) * 100) : 0;
    const avgDuration    = avgDurationMinutes(filteredInteractions);
    return { total, running, waiting, resolved, transferred, autonomous,
             transferRate, resolveRate, efficiencyRate, avgDuration };
  }, [filteredInteractions]);

  const followUpBuckets = useMemo(() => {
    const waiting  = filteredInteractions.filter((i) => i.status === "WAITING");
    const resolved = filteredInteractions.filter((i) => i.status === "RESOLVED" && !!i.resolvedAt);
    const reactivated = resolved.filter((i) => (i.resolvedAt! - i.startAt) > MIN30).length;
    const reactivationRate = resolved.length ? Math.round((reactivated / resolved.length) * 100) : 0;
    return {
      waiting:      { counts: computeFollowUpBuckets(waiting),            total: waiting.length },
      reactivation: { counts: computeReactivationBuckets(resolved),       total: resolved.length },
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

        {/* Main metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <MetricCard icon={Users}         label="Total de atendimentos" value={metrics.total}           color="#58a6ff" />
          <MetricCard icon={PhoneForwarded} label="Transferências"        value={metrics.transferred}
            sub={`${metrics.transferRate}% do total`}                                                    color="#f0883e" />
          <MetricCard icon={CheckCircle}   label="Resolvidos"             value={metrics.resolved}
            sub={`${metrics.resolveRate}% do total`}                                                     color="#3fb950" />

        </div>

        {/* Status bar */}
        <StatusBar running={metrics.running} waiting={metrics.waiting} resolved={metrics.resolved} total={metrics.total} />

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

            {/* Em espera */}
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

            {/* Reativados */}
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
                Estimativa baseada no tempo desde o início da interação. Reativação = resolvidos após 30min (provável resposta pós follow-up).
              </p>
            </div>
          </div>
        )}

        {/* Active conversations */}
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
