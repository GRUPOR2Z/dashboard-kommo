import type { ReactNode } from "react";

interface BarItem {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  title: string;
  icon?: ReactNode;
  items: BarItem[];
  loading?: boolean;
  emptyMsg?: string;
  maxCols?: number;
}

export default function SectionPanel({
  title,
  icon,
  items,
  loading,
  emptyMsg = "Sem dados no período",
  maxCols = 3,
}: Props) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon && (
          <span style={{ color: "var(--green)" }}>{icon}</span>
        )}
        <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>
          {title}
        </h3>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 rounded animate-pulse" style={{ background: "var(--border)" }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>{emptyMsg}</p>
      ) : (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${Math.min(items.length, maxCols)}, minmax(0, 1fr))`,
          }}
        >
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>
                  {item.label}
                </span>
                <span
                  className="text-xs font-bold ml-2 shrink-0"
                  style={{ color: item.color ?? "var(--green)" }}
                >
                  {item.value}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(item.value / max) * 100}%`,
                    background: item.color ?? "var(--green)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
