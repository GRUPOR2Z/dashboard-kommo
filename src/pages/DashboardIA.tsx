import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Users, PhoneForwarded, CheckCircle, Clock, Zap, Loader2 } from "lucide-react";
import { fetchAllInteractions } from "../lib/gptmaker";
import { useClientConfig } from "../contexts/ClientConfigContext";
import type { GptInteraction } from "../lib/gptmaker";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FOLLOWUP_KEYWORDS = [
  "retorno", "retornar", "ligar depois", "ligaremos", "follow",
  "follow-up", "acompanhamento", "vou verificar", "vou checar",
];

const ERROR_KEYWORDS = [
  "não entendi", "nao entendi", "não compreendi", "não consegui",
  "erro", "problema", "desculpe", "tente novamente",
];

function detectKeywords(interactions: GptInteraction[], keywords: string[]): number {
  return interactions.filter((i) =>
    keywords.some((kw) => i.contactName?.toLowerCase().includes(kw))
  ).length;
}

function avgDurationMinutes(interactions: GptInteraction[]): string {
  const resolved = interactions.filter((i) => i.resolvedAt && i.startAt);
  if (!resolved.length) return "—";
  const avg = resolved.reduce((sum, i) => sum + (i.resolvedAt! - i.startAt), 0) / resolved.length;
  const mins = Math.floor(avg / 1000 / 60);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: color + "22" }}
        >
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

// ── Status badge ──────────────────────────────────────────────────────────────

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

  const { data: interactions = [], isLoading, error } = useQuery({
    queryKey: ["gptmaker-interactions", gptmakerWorkspaceId],
    queryFn: () => fetchAllInteractions(gptmakerWorkspaceId!),
    enabled: !!gptmakerWorkspaceId && !configLoading,
    staleTime: 5 * 60 * 1000,
  });

  const metrics = useMemo(() => {
    const total = interactions.length;
    const running = interactions.filter((i) => i.status === "RUNNING").length;
    const waiting = interactions.filter((i) => i.status === "WAITING").length;
    const resolved = interactions.filter((i) => i.status === "RESOLVED").length;
    const transferred = interactions.filter((i) => i.transferAt !== null).length;
    const transferRate = total ? Math.round((transferred / total) * 100) : 0;
    const resolveRate = total ? Math.round((resolved / total) * 100) : 0;
    const avgDuration = avgDurationMinutes(interactions);

    return { total, running, waiting, resolved, transferred, transferRate, resolveRate, avgDuration };
  }, [interactions]);

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
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--green-dim)" }}>
            <Bot size={18} style={{ color: "var(--green)" }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: "var(--text)" }}>Dashboard IA</h1>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Métricas da IA — Agente IA</p>
          </div>
          {isLoading && <Loader2 size={16} className="animate-spin ml-auto" style={{ color: "var(--muted)" }} />}
        </div>

        {error && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "#f8514922", color: "#f85149" }}>
            Erro ao carregar dados: {(error as Error).message}
          </div>
        )}

        {/* Main metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon={Users} label="Total de atendimentos" value={metrics.total} color="#58a6ff" />
          <MetricCard icon={PhoneForwarded} label="Transferências" value={metrics.transferred}
            sub={`${metrics.transferRate}% do total`} color="#f0883e" />
          <MetricCard icon={CheckCircle} label="Resolvidos" value={metrics.resolved}
            sub={`${metrics.resolveRate}% do total`} color="#3fb950" />
          <MetricCard icon={Clock} label="Tempo médio" value={metrics.avgDuration}
            sub="atendimentos resolvidos" color="#a371f7" />
        </div>

        {/* Status bar */}
        <StatusBar
          running={metrics.running}
          waiting={metrics.waiting}
          resolved={metrics.resolved}
          total={metrics.total}
        />

        {/* Active conversations */}
        <div className="rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
            <Zap size={14} style={{ color: "var(--green)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Atendimentos ativos
            </span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--green-dim)", color: "var(--green)" }}>
              {metrics.running + metrics.waiting}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {interactions
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
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {i.agentName} · #{i.protocol}
                    </p>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: i.status === "RUNNING" ? "#58a6ff22" : "#f0883e22",
                      color: i.status === "RUNNING" ? "#58a6ff" : "#f0883e",
                    }}
                  >
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
