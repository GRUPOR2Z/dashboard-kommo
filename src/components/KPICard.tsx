import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: ReactNode;
  color?: string;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  trend?: "up" | "down" | "neutral";
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon,
  color = "var(--green)",
  onClick,
  active,
  loading,
  trend,
}: Props) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-xl border p-5 transition-all"
      style={{
        background: active ? "rgba(0,182,122,0.08)" : "var(--card)",
        borderColor: active ? color : "var(--border)",
        cursor: onClick ? "pointer" : "default",
        outline: "none",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {title}
        </span>
        <span
          className="w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ background: `${color}22`, color }}
        >
          {icon}
        </span>
      </div>

      {loading ? (
        <div className="h-8 w-20 rounded animate-pulse" style={{ background: "var(--border)" }} />
      ) : (
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
            {value}
          </span>
          {trend === "up" && <TrendingUp size={16} className="mb-1" style={{ color: "var(--green)" }} />}
          {trend === "down" && <TrendingDown size={16} className="mb-1" style={{ color: "#f85149" }} />}
        </div>
      )}

      {subtitle && (
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {subtitle}
        </p>
      )}
    </button>
  );
}
