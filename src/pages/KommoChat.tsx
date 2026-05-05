import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { fetchLeadsByPipeline } from "../lib/kommo-api";
import { useClientConfig } from "../contexts/ClientConfigContext";
import ContactsSidebar from "../components/chat/ContactsSidebar";
import ChatThread from "../components/chat/ChatThread";
import type { KommoLead } from "../lib/types";

export default function KommoChat() {
  const [selectedLead, setSelectedLead] = useState<KommoLead | null>(null);
  const { subdomain, pipelines, loading: configLoading } = useClientConfig();

  const { data: funilLeads, isLoading } = useQuery({
    queryKey: ["funil-leads", pipelines.FUNIL_ID],
    queryFn: () => fetchLeadsByPipeline(pipelines.FUNIL_ID),
    enabled: !configLoading && !!pipelines.FUNIL_ID,
    staleTime: 2 * 60 * 1000,
  });

  const leads = funilLeads ?? [];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Contacts list */}
      <ContactsSidebar
        leads={leads}
        selectedLeadId={selectedLead?.id ?? null}
        onSelect={setSelectedLead}
      />

      {/* Chat area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedLead ? (
          <ChatThread
            lead={selectedLead}
            subdomain={subdomain}
            onBack={() => setSelectedLead(null)}
          />
        ) : (
          <EmptyState loading={isLoading || configLoading} total={leads.length} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ loading, total }: { loading: boolean; total: number }) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-3"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <MessageSquare size={28} style={{ color: "var(--muted)" }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {loading ? "Carregando contatos..." : "Selecione uma conversa"}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          {!loading && total > 0
            ? `${total} leads disponíveis na sidebar`
            : "Conectando ao Kommo..."}
        </p>
      </div>
    </div>
  );
}
