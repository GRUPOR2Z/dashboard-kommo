import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Zap, MessageSquare, ArrowLeft,
  Loader2, ExternalLink, RefreshCw,
} from "lucide-react";
import { fetchUazapiChats, fetchUazapiMessages } from "../lib/uazapi";
import type { UazapiChat, UazapiMessage } from "../lib/uazapi";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ms: number): string {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "hoje";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = ["#3fb950", "#58a6ff", "#f0883e", "#a371f7", "#d29922", "#f85149"];
function avatarColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function msgText(msg: UazapiMessage): string {
  return msg.text || msg.content?.text || msg.content?.caption || "(mídia)";
}

// ── Contacts sidebar ──────────────────────────────────────────────────────────

function ContactsSidebar({
  chats, selectedId, onSelect, loading, onRefresh, isFetching,
}: {
  chats: UazapiChat[];
  selectedId: string | null;
  onSelect: (c: UazapiChat) => void;
  loading: boolean;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return chats
      .filter((c) => !c.wa_isGroup)
      .filter((c) =>
        !q || c.wa_contactName.toLowerCase().includes(q) || c.phone.includes(q)
      )
      .sort((a, b) => b.wa_lastMsgTimestamp - a.wa_lastMsgTimestamp);
  }, [chats, search]);

  return (
    <div
      className="flex flex-col h-full border-r flex-shrink-0"
      style={{ width: 280, background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={15} style={{ color: "#f0883e" }} />
          <span className="font-semibold text-sm flex-1" style={{ color: "var(--text)" }}>
            Conversas Uaizap
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(240,136,62,0.15)", color: "#f0883e" }}
          >
            {filtered.length}
          </span>
          <button
            onClick={onRefresh}
            disabled={isFetching}
            className="p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: "var(--muted)" }}
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
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

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--muted)" }} />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: "var(--muted)" }}>
            Nenhuma conversa encontrada
          </p>
        )}
        {filtered.map((chat) => {
          const isActive = chat.wa_chatid === selectedId;
          const color = avatarColor(chat.wa_chatid);
          const name = chat.wa_contactName || chat.name || chat.phone;

          return (
            <button
              key={chat.wa_chatid}
              onClick={() => onSelect(chat)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{
                background: isActive ? "rgba(240,136,62,0.1)" : "transparent",
                borderLeft: isActive ? "3px solid #f0883e" : "3px solid transparent",
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: color + "28", color }}
              >
                {initials(name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: isActive ? "#f0883e" : "var(--text)" }}
                  >
                    {name}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>
                    {relativeTime(chat.wa_lastMsgTimestamp)}
                  </span>
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>
                  {chat.wa_lastMessageTextVote || "..."}
                </p>
              </div>
              {chat.wa_unreadCount > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                  style={{ background: "#f0883e", color: "#000" }}
                >
                  {chat.wa_unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Chat thread ───────────────────────────────────────────────────────────────

function ChatThread({ chat, onBack }: { chat: UazapiChat; onBack: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const name = chat.wa_contactName || chat.name || chat.phone;

  const { data: messages = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["uazapi-messages", chat.wa_chatid],
    queryFn: () => fetchUazapiMessages(chat.wa_chatid, 60),
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Group by date
  const groups: { date: string; messages: UazapiMessage[] }[] = [];
  let currentDate = "";
  for (const msg of messages) {
    const label = formatDateLabel(msg.messageTimestamp);
    if (label !== currentDate) {
      currentDate = label;
      groups.push({ date: label, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  const color = avatarColor(chat.wa_chatid);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <button onClick={onBack} className="p-1.5 rounded hover:opacity-70 transition-opacity"
          style={{ color: "var(--muted)" }}>
          <ArrowLeft size={16} />
        </button>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: color + "28", color }}
        >
          {initials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{name}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>{chat.phone}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded hover:opacity-70 transition-opacity"
          style={{ color: "var(--muted)" }}
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
        <a
          href={`https://wa.me/${chat.phone?.replace(/\D/g, "")}`}
          target="_blank" rel="noopener noreferrer"
          className="p-1.5 rounded hover:opacity-70 transition-opacity"
          style={{ color: "var(--muted)" }}
          title="Abrir no WhatsApp"
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
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <MessageSquare size={32} style={{ color: "var(--border)" }} />
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nenhuma mensagem encontrada
            </p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.date}>
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
                const isSent = msg.fromMe;
                const text = msgText(msg);

                return (
                  <div key={msg.id} className={`flex ${isSent ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[75%] rounded-2xl px-3 py-2"
                      style={{
                        background: isSent ? "#f0883e" : "var(--card)",
                        color: isSent ? "#000" : "var(--text)",
                        borderBottomRightRadius: isSent ? 4 : undefined,
                        borderBottomLeftRadius: !isSent ? 4 : undefined,
                      }}
                    >
                      <p className="text-sm leading-snug whitespace-pre-wrap break-words">{text}</p>
                      <p
                        className="text-xs mt-1 text-right"
                        style={{ color: isSent ? "rgba(0,0,0,0.5)" : "var(--muted)" }}
                      >
                        {formatTime(msg.messageTimestamp)}
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

      <div
        className="px-4 py-2 border-t text-center flex-shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Histórico somente leitura · Envie mensagens pelo WhatsApp
        </p>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UaizapChat() {
  const [selected, setSelected] = useState<UazapiChat | null>(null);

  const { data: chats = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["uazapi-chats"],
    queryFn: () => fetchUazapiChats(100),
    staleTime: 60 * 1000,
  });

  return (
    <div className="flex h-full overflow-hidden">
      <ContactsSidebar
        chats={chats}
        selectedId={selected?.wa_chatid ?? null}
        onSelect={setSelected}
        loading={isLoading}
        onRefresh={refetch}
        isFetching={isFetching}
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {selected ? (
          <ChatThread chat={selected} onBack={() => setSelected(null)} />
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-3"
            style={{ background: "var(--bg)" }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <Zap size={28} style={{ color: "#f0883e" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {isLoading ? "Carregando conversas..." : "Selecione uma conversa"}
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {!isLoading && chats.length > 0 ? `${chats.filter(c => !c.wa_isGroup).length} contatos disponíveis` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
