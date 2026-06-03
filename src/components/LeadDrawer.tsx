import { useState, useCallback } from "react";
import { X, Search, ExternalLink, ChevronDown, MessageSquare, Phone, Loader2, Send } from "lucide-react";
import type { KommoLead, KommoNote } from "../lib/types";
import { fetchLeadNotes, fetchLeadPhone } from "../lib/kommo-api";
import { sendWhatsAppMessage } from "../lib/uazapi";
import { useClientConfig } from "../contexts/ClientConfigContext";

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
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function NoteRow({ note }: { note: KommoNote }) {
  const text = note.params?.text?.trim();
  const label = NOTE_TYPE_LABELS[note.note_type] ?? note.note_type;
  const isCall = note.note_type === "call_in" || note.note_type === "call_out";
  if (!text && !isCall) return null;
  return (
    <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium px-1.5 py-0.5 rounded text-xs" style={{
          background: isCall ? "rgba(88,166,255,0.1)" : "rgba(63,185,80,0.1)",
          color: isCall ? "#58a6ff" : "var(--green)",
        }}>
          {isCall && <Phone size={9} className="inline mr-1" />}
          {!isCall && <MessageSquare size={9} className="inline mr-1" />}
          {label}
        </span>
        <span style={{ color: "var(--muted)" }}>{formatNoteDate(note.created_at)}</span>
      </div>
      {text && <p className="mt-1 leading-relaxed" style={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>{text}</p>}
      {isCall && note.params?.duration && (
        <p style={{ color: "var(--muted)" }}>Duração: {Math.floor(note.params.duration / 60)}min {note.params.duration % 60}s</p>
      )}
    </div>
  );
}

export default function LeadDrawer({ title, leads, onClose, subdomain }: Props) {
  const { uazapiInstance } = useClientConfig();

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notesMap, setNotesMap] = useState<Record<number, KommoNote[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());

  // WhatsApp composer state
  const [waLeadId, setWaLeadId] = useState<number | null>(null);
  const [waPhone, setWaPhone] = useState("");
  const [waText, setWaText] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waPhoneLoading, setWaPhoneLoading] = useState(false);
  const [waResult, setWaResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  const filtered = leads.filter(
    (l) => l.name.toLowerCase().includes(search.toLowerCase()) || String(l.id).includes(search)
  );

  const handleExpand = useCallback(async (leadId: number) => {
    if (expandedId === leadId) { setExpandedId(null); return; }
    setExpandedId(leadId);
    if (notesMap[leadId] !== undefined) return;
    setLoadingIds((prev) => new Set(prev).add(leadId));
    try {
      const notes = await fetchLeadNotes(leadId);
      setNotesMap((prev) => ({ ...prev, [leadId]: notes }));
    } catch {
      setNotesMap((prev) => ({ ...prev, [leadId]: [] }));
    } finally {
      setLoadingIds((prev) => { const n = new Set(prev); n.delete(leadId); return n; });
    }
  }, [expandedId, notesMap]);

  const handleOpenWa = useCallback(async (leadId: number) => {
    if (waLeadId === leadId) { setWaLeadId(null); setWaResult(null); return; }
    setWaLeadId(leadId);
    setWaPhone("");
    setWaText("");
    setWaResult(null);
    setWaPhoneLoading(true);
    try {
      const phone = await fetchLeadPhone(leadId);
      setWaPhone(phone ?? "");
    } catch { /* ignore */ }
    finally { setWaPhoneLoading(false); }
  }, [waLeadId]);

  const handleSend = useCallback(async () => {
    if (!uazapiInstance || !waPhone || !waText.trim() || waSending) return;
    setWaSending(true);
    setWaResult(null);
    try {
      await sendWhatsAppMessage(uazapiInstance, waPhone, waText.trim());
      setWaResult({ ok: true });
      setWaText("");
    } catch (err) {
      setWaResult({ error: (err as Error).message });
    } finally {
      setWaSending(false);
    }
  }, [uazapiInstance, waPhone, waText, waSending]);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--green)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm" style={{ color: "var(--text)" }}>{title}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(63,185,80,0.15)", color: "var(--green)" }}>
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <Search size={12} style={{ color: "var(--muted)" }} />
            <input
              className="bg-transparent text-xs outline-none w-40"
              style={{ color: "var(--text)" }}
              placeholder="Buscar lead..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: "var(--muted)" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto" style={{ maxHeight: "520px" }}>
        {filtered.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>Nenhum lead encontrado</p>
        ) : (
          filtered.map((lead, i) => {
            const isExpanded = expandedId === lead.id;
            const isLoading = loadingIds.has(lead.id);
            const notes = notesMap[lead.id] ?? [];
            const visibleNotes = notes.filter((n) => n.params?.text || n.note_type === "call_in" || n.note_type === "call_out");
            const isWaOpen = waLeadId === lead.id;

            return (
              <div key={lead.id} className="border-b" style={{
                borderColor: "var(--border)",
                background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
              }}>
                {/* Lead row */}
                <div className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "rgba(63,185,80,0.15)", color: "var(--green)" }}>
                      {lead.name[0]?.toUpperCase() ?? "#"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{lead.name}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        ID #{lead.id}
                        {lead.created_at > 0 && ` · ${new Date(lead.created_at * 1000).toLocaleDateString("pt-BR")}`}
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
                      target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded transition-colors hover:opacity-70"
                      style={{ color: "var(--muted)" }}
                    >
                      <ExternalLink size={12} />
                    </a>

                    {/* WhatsApp button */}
                    {uazapiInstance && (
                      <button
                        onClick={() => handleOpenWa(lead.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                        style={{
                          background: isWaOpen ? "rgba(37,211,102,0.12)" : "var(--bg)",
                          border: `1px solid ${isWaOpen ? "#25D366" : "var(--border)"}`,
                          color: isWaOpen ? "#25D366" : "var(--muted)",
                        }}
                        title="Enviar WhatsApp"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </button>
                    )}

                    {/* Notes expand button */}
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
                      {isLoading ? <Loader2 size={11} className="animate-spin" /> : <MessageSquare size={11} />}
                      <ChevronDown size={11} style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                    </button>
                  </div>
                </div>

                {/* WhatsApp composer */}
                {isWaOpen && (
                  <div className="px-5 pb-4" style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: "#25D366" }}>Enviar WhatsApp</p>
                    <div className="flex gap-2 mb-3">
                      <div className="flex-1">
                        <label className="text-xs mb-1 block" style={{ color: "var(--muted)" }}>Número</label>
                        {waPhoneLoading ? (
                          <div className="flex items-center gap-2 h-8" style={{ color: "var(--muted)" }}>
                            <Loader2 size={12} className="animate-spin" />
                            <span className="text-xs">Buscando...</span>
                          </div>
                        ) : (
                          <input
                            className="w-full rounded-lg px-3 py-1.5 text-xs outline-none"
                            style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                            placeholder="55XXXXXXXXXXX"
                            value={waPhone}
                            onChange={(e) => setWaPhone(e.target.value)}
                          />
                        )}
                      </div>
                    </div>
                    <textarea
                      className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none mb-3"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", minHeight: "80px" }}
                      placeholder="Digite a mensagem..."
                      value={waText}
                      onChange={(e) => setWaText(e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      {waResult?.ok && <span className="text-xs" style={{ color: "#25D366" }}>✓ Mensagem enviada!</span>}
                      {waResult?.error && <span className="text-xs" style={{ color: "#f85149" }}>Erro: {waResult.error.slice(0, 60)}</span>}
                      {!waResult && <span />}
                      <button
                        onClick={handleSend}
                        disabled={waSending || !waPhone || !waText.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                        style={{
                          background: "#25D366",
                          color: "#fff",
                          opacity: (waSending || !waPhone || !waText.trim()) ? 0.5 : 1,
                        }}
                      >
                        {waSending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                        {waSending ? "Enviando..." : "Enviar"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Notes panel */}
                {isExpanded && (
                  <div className="px-5 pb-4" style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                    {isLoading ? (
                      <div className="flex items-center gap-2 py-2" style={{ color: "var(--muted)" }}>
                        <Loader2 size={12} className="animate-spin" />
                        <span className="text-xs">Carregando notas...</span>
                      </div>
                    ) : visibleNotes.length === 0 ? (
                      <p className="text-xs py-2" style={{ color: "var(--muted)" }}>Nenhuma nota registrada para este lead.</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                          {visibleNotes.length} nota{visibleNotes.length > 1 ? "s" : ""}
                        </p>
                        {visibleNotes.map((note) => <NoteRow key={note.id} note={note} />)}
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
