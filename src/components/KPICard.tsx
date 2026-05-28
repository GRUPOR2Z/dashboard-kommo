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
      className="text-left w-full rounded-xl p-5 transition-all"
      style={{
        background: "var(--card)",
        border: `1px solid ${active ? color : "var(--border)"}`,
        borderLeft: `3px solid ${active ? color : "transparent"}`,
        cursor: onClick ? "pointer" : "default",
        outline: "none",
        boxShadow: active ? `0 0 0 1px ${color}30` : "none",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--muted)" }}
        >
          {title}
        </span>
        <span style={{ color: active ? color : "var(--muted)", opacity: active ? 1 : 0.5 }}>
          {icon}
        </span>
      </div>

      {loading ? (
        <>
          <div className="h-10 w-20 rounded-lg animate-pulse mb-2" style={{ background: "var(--border)" }} />
          <div className="h-3 w-28 rounded animate-pulse" style={{ background: "var(--border)" }} />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-bold tracking-tight"
              style={{ color: active ? color : "var(--text)" }}
            >
              {value}
            </span>
            {trend === "up" && <TrendingUp size={13} style={{ color: "var(--green)" }} />}
            {trend === "down" && <TrendingDown size={13} style={{ color: "#f85149" }} />}
          </div>
          {subtitle && (
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {subtitle}
            </p>
          )}
        </>
      )}
    </button>
  );
}
