import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  PhoneIncoming,
  PhoneOutgoing,
  FileText,
  MessageSquare,
  Loader2,
  ExternalLink,
  Info,
} from "lucide-react";
import { fetchLeadNotes } from "../../lib/kommo-api";
import type { KommoLead, KommoNote } from "../../lib/types";

interface Props {
  lead: KommoLead;
  subdomain: string;
  onBack: () => void;
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(ts: number) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

type MessageDirection = "sent" | "received" | "system";

interface ParsedMessage {
  id: number;
  direction: MessageDirection;
  text: string;
  ts: number;
  type: string;
  rawNote: KommoNote;
}

// Kommo API returns note_type as number OR string depending on version
// Numeric: 2=common, 4=call_in, 5=call_out, 12=extended_service, 13=service, 102=amocrm_note
// String (v4): "common", "call_in", "call_out", "service_message", etc.
function isCallIn(t: string | number) {
  return t === "call_in" || t === 4;
}
function isCallOut(t: string | number) {
  return t === "call_out" || t === 5;
}
function isSystemNote(t: string | number) {
  return (
    t === "service_message" || t === 13 ||
    t === "extended_service_message" || t === 12
  );
}

function parseNoteDirection(note: KommoNote): MessageDirection {
  const t = note.note_type as string | number;
  if (isCallIn(t)) return "received";
  if (isCallOut(t)) return "sent";
  if (isSystemNote(t)) return "system";
  // WhatsApp Lite: created_by === 0 = incoming from contact
  if (note.created_by === 0) return "received";
  return "sent";
}

function noteText(note: KommoNote): string {
  const p = note.params;
  if (p.text) return p.text;
  const t = note.note_type as string | number;
  if (isCallIn(t) || isCallOut(t)) {
    const dur = p.duration ? ` · ${Math.floor(p.duration / 60)}min ${p.duration % 60}s` : "";
    const phone = p.phone ? ` — ${p.phone}` : "";
    return `📞 Ligação${phone}${dur}`;
  }
  if (p.link) return `🔗 ${p.link}`;
  return "(sem conteúdo)";
}

function hasContent(note: KommoNote): boolean {
  const t = note.note_type as string | number;
  if (note.params.text) return true;
  if (isCallIn(t) || isCallOut(t)) return true;
  if (note.params.link) return true;
  return false;
}

function noteIcon(type: string | number) {
  if (isCallIn(type)) return <PhoneIncoming size={11} style={{ color: "#3fb950" }} />;
  if (isCallOut(type)) return <PhoneOutgoing size={11} style={{ color: "#58a6ff" }} />;
  if (isSystemNote(type)) return <Info size={11} style={{ color: "var(--muted)" }} />;
  if (type === "common" || type === 2) return <FileText size={11} style={{ color: "var(--muted)" }} />;
  return <MessageSquare size={11} style={{ color: "var(--muted)" }} />;
}

function groupByDate(messages: ParsedMessage[]) {
  const groups: { date: string; messages: ParsedMessage[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const d = formatDate(msg.ts);
    if (d !== currentDate) {
      currentDate = d;
      groups.push({ date: d, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }
  return groups;
}

export default function ChatThread({ lead, subdomain, onBack }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const contactName = lead._embedded?.contacts?.[0]?.name ?? lead.name;

  const { data: notes, isLoading } = useQuery({
    queryKey: ["lead-notes", lead.id],
    queryFn: () => fetchLeadNotes(lead.id),
    staleTime: 60 * 1000,
  });

  const messages: ParsedMessage[] = (notes ?? [])
    .filter((n) => hasContent(n))
    .map((n) => ({
      id: n.id,
      direction: parseNoteDirection(n),
      text: noteText(n),
      ts: n.created_at,
      type: n.note_type,
      rawNote: n,
    }));

  const groups = groupByDate(messages);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <button
          onClick={onBack}
          className="p-1.5 rounded-md transition-colors hover:opacity-70"
          style={{ color: "var(--muted)" }}
        >
          <ArrowLeft size={16} />
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: "var(--green-dim)", color: "var(--green)" }}
        >
          {contactName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
            {contactName}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
            {lead.name}
          </p>
        </div>

        <a
          href={`https://${subdomain}.kommo.com/leads/detail/${lead.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md transition-colors hover:opacity-70"
          style={{ color: "var(--muted)" }}
          title="Abrir no Kommo"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
        style={{ background: "var(--bg)" }}
      >
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare size={32} style={{ color: "var(--border)", marginBottom: 8 }} />
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nenhuma mensagem encontrada
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)", opacity: 0.6 }}>
              As mensagens do WhatsApp Lite aparecem aqui
            </p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="flex items-center justify-center my-4">
              <span
                className="text-xs px-3 py-1 rounded-full"
                style={{ background: "var(--card)", color: "var(--muted)" }}
              >
                {group.date}
              </span>
            </div>

            <div className="space-y-1">
              {group.messages.map((msg) => {
                if (msg.direction === "system") {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <span
                        className="text-xs px-3 py-1 rounded-full flex items-center gap-1.5"
                        style={{ background: "var(--card)", color: "var(--muted)" }}
                      >
                        {noteIcon(msg.type)}
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                const isSent = msg.direction === "sent";

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isSent ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className="max-w-[75%] rounded-2xl px-3 py-2"
                      style={{
                        background: isSent ? "var(--green)" : "var(--card)",
                        color: isSent ? "#000" : "var(--text)",
                        borderBottomRightRadius: isSent ? "4px" : undefined,
                        borderBottomLeftRadius: !isSent ? "4px" : undefined,
                      }}
                    >
                      {/* Note type badge for non-text notes */}
                      {(msg.type === "call_in" || msg.type === "call_out") && (
                        <div className="flex items-center gap-1 mb-1 opacity-70">
                          {noteIcon(msg.type)}
                          <span className="text-xs">
                            {msg.type === "call_in" ? "Ligação recebida" : "Ligação realizada"}
                          </span>
                        </div>
                      )}

                      <p className="text-sm leading-snug whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>

                      <p
                        className="text-xs mt-1 text-right"
                        style={{
                          color: isSent ? "rgba(0,0,0,0.5)" : "var(--muted)",
                        }}
                      >
                        {new Date(msg.ts * 1000).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Footer info */}
      <div
        className="px-4 py-2 border-t text-center flex-shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Histórico somente leitura · Envie mensagens pelo Kommo
        </p>
      </div>
    </div>
  );
}
