import { useState, useCallback } from "react";
import { X, Search, ExternalLink, ChevronDown, MessageSquare, Phone, Loader2 } from "lucide-react";
import type { KommoLead, KommoNote } from "../lib/types";
import { fetchLeadNotes } from "../lib/kommo-api";

interface Props {
  title: string;
  leads: KommoLead[];
  onClose: () => void;
  subdomain: string;
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  common: "Nota",
  call_in: "Ligação recebida",
  call_out: "Ligação realizada",
  mail_message: "E-mail",
  sms_message: "SMS",
  chat_message: "Chat",
};

function formatNoteDate(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteRow({ note }: { note: KommoNote }) {
  const text = note.params?.text?.trim();
  const label = NOTE_TYPE_LABELS[note.note_type] ?? note.note_type;
  const isCall = note.note_type === "call_in" || note.note_type === "call_out";

  if (!text && !isCall) return null;

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className="font-medium px-1.5 py-0.5 rounded text-xs"
          style={{
            background: isCall ? "rgba(88,166,255,0.1)" : "rgba(63,185,80,0.1)",
            color: isCall ? "#58a6ff" : "var(--green)",
          }}
        >
          {isCall && <Phone size={9} className="inline mr-1" />}
          {!isCall && <MessageSquare size={9} className="inline mr-1" />}
          {label}
        </span>
        <span style={{ color: "var(--muted)" }}>{formatNoteDate(note.created_at)}</span>
      </div>
      {text && (
        <p className="mt-1 leading-relaxed" style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>
          {text}
        </p>
      )}
      {isCall && note.params?.duration && (
        <p style={{ color: "var(--muted)" }}>
          Duração: {Math.floor(note.params.duration / 60)}min {note.params.duration % 60}s
        </p>
      )}
    </div>
  );
}

export default function LeadDrawer({ title, leads, onClose, subdomain }: Props) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notesMap, setNotesMap] = useState<Record<number, KommoNote[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());

  const filtered = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      String(l.id).includes(search)
  );

  const handleExpand = useCallback(
    async (leadId: number) => {
      if (expandedId === leadId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(leadId);

      if (notesMap[leadId] !== undefined) return; // já carregado

      setLoadingIds((prev) => new Set(prev).add(leadId));
      try {
        const notes = await fetchLeadNotes(leadId);
        setNotesMap((prev) => ({ ...prev, [leadId]: notes }));
      } catch {
        setNotesMap((prev) => ({ ...prev, [leadId]: [] }));
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
      }
    },
    [expandedId, notesMap]
  );

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--card)", borderColor: "var(--green)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>
            {title}
          </h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(63,185,80,0.15)", color: "var(--green)" }}
          >
            {filtered.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <Search size={12} style={{ color: "var(--muted)" }} />
            <input
              className="bg-transparent text-xs outline-none w-40"
              style={{ color: "var(--text)" }}
              placeholder="Buscar lead..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto" style={{ maxHeight: "480px" }}>
        {filtered.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            Nenhum lead encontrado
          </p>
        ) : (
          filtered.map((lead, i) => {
            const isExpanded = expandedId === lead.id;
            const isLoading = loadingIds.has(lead.id);
            const notes = notesMap[lead.id] ?? [];
            const visibleNotes = notes.filter(
              (n) => n.params?.text || n.note_type === "call_in" || n.note_type === "call_out"
            );

            return (
              <div
                key={lead.id}
                className="border-b"
                style={{
                  borderColor: "var(--border)",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                }}
              >
                {/* Lead row */}
                <div className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "rgba(63,185,80,0.15)", color: "var(--green)" }}
                    >
                      {lead.name[0]?.toUpperCase() ?? "#"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                        {lead.name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        ID #{lead.id}
                        {lead.created_at > 0 &&
                          ` · ${new Date(lead.created_at * 1000).toLocaleDateString("pt-BR")}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {lead.price > 0 && (
                      <span className="text-xs font-medium" style={{ color: "var(--green)" }}>
                        R$ {lead.price.toLocaleString("pt-BR")}
                      </span>
                    )}
                    <a
                      href={`https://${subdomain}.kommo.com/leads/detail/${lead.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded transition-colors hover:opacity-70"
                      style={{ color: "var(--muted)" }}
                    >
                      <ExternalLink size={12} />
                    </a>
                    {/* Expand notes button */}
                    <button
                      onClick={() => handleExpand(lead.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                      style={{
                        background: isExpanded ? "rgba(63,185,80,0.12)" : "var(--bg)",
                        border: "1px solid var(--border)",
                        color: isExpanded ? "var(--green)" : "var(--muted)",
                      }}
                      title="Ver notas"
                    >
                      {isLoading ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <MessageSquare size={11} />
                      )}
                      <ChevronDown
                        size={11}
                        style={{
                          transform: isExpanded ? "rotate(180deg)" : "none",
                          transition: "transform 0.2s",
                        }}
                      />
                    </button>
                  </div>
                </div>

                {/* Notes panel */}
                {isExpanded && (
                  <div
                    className="px-5 pb-4"
                    style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2 py-2" style={{ color: "var(--muted)" }}>
                        <Loader2 size={12} className="animate-spin" />
                        <span className="text-xs">Carregando notas...</span>
                      </div>
                    ) : visibleNotes.length === 0 ? (
                      <p className="text-xs py-2" style={{ color: "var(--muted)" }}>
                        Nenhuma nota registrada para este lead.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                          {visibleNotes.length} nota{visibleNotes.length > 1 ? "s" : ""}
                        </p>
                        {visibleNotes.map((note) => (
                          <NoteRow key={note.id} note={note} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
