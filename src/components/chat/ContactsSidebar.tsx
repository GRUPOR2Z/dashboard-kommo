import { useState, useMemo } from "react";
import { Search, MessageCircle } from "lucide-react";
import type { KommoLead } from "../../lib/types";

interface Props {
  leads: KommoLead[];
  selectedLeadId: number | null;
  onSelect: (lead: KommoLead) => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function relativeTime(ts: number): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const d = new Date(ts * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "hoje";
  if (diff < 7 * 86400) {
    return d.toLocaleDateString("pt-BR", { weekday: "short" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const AVATAR_COLORS = [
  "#3fb950", "#58a6ff", "#f0883e", "#a371f7",
  "#d29922", "#f85149", "#39d353", "#79c0ff",
];

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

export default function ContactsSidebar({ leads, selectedLeadId, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    return [...leads].sort((a, b) => b.updated_at - a.updated_at);
  }, [leads]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((l) => l.name.toLowerCase().includes(q));
  }, [sorted, search]);

  return (
    <div
      className="flex flex-col h-full border-r"
      style={{
        width: "280px",
        minWidth: "280px",
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle size={15} style={{ color: "var(--green)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>
            Conversas
          </span>
          <span
            className="ml-auto text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: "var(--green-dim)", color: "var(--green)" }}
          >
            {leads.length}
          </span>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        >
          <Search size={12} style={{ color: "var(--muted)" }} />
          <input
            type="text"
            placeholder="Buscar contato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: "var(--text)" }}
          />
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--muted)" }}>
            Nenhum contato encontrado
          </div>
        )}
        {filtered.map((lead) => {
          const isActive = lead.id === selectedLeadId;
          const color = avatarColor(lead.id);
          const contactName =
            lead._embedded?.contacts?.[0]?.name ?? lead.name;

          return (
            <button
              key={lead.id}
              onClick={() => onSelect(lead)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{
                background: isActive ? "var(--green-dim)" : "transparent",
                borderLeft: isActive ? `3px solid var(--green)` : "3px solid transparent",
              }}
            >
              {/* Avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: color + "28", color }}
              >
                {initials(contactName)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: isActive ? "var(--green)" : "var(--text)" }}
                  >
                    {contactName}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>
                    {relativeTime(lead.updated_at)}
                  </span>
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>
                  {lead.name !== contactName ? lead.name : "Ver conversa →"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
