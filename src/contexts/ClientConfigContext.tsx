import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import type { PipelineConfig, FieldConfig } from "../lib/config";

interface ClientConfigValue {
  subdomain: string;
  clientName: string;
  pipelines: PipelineConfig;
  fieldIds: FieldConfig;
  stageLabels: Record<string, string>;
  uazapiUrl: string | null;
  gptmakerWorkspaceId: string | null;
  loading: boolean;
  error: string | null;
}

const ClientConfigContext = createContext<ClientConfigValue | undefined>(undefined);

const EMPTY_PIPELINES = {} as PipelineConfig;
const EMPTY_FIELDS = {} as FieldConfig;

export function ClientConfigProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subdomain, setSubdomain] = useState("");
  const [clientName, setClientName] = useState("");
  const [pipelines, setPipelines] = useState<PipelineConfig>(EMPTY_PIPELINES);
  const [fieldIds, setFieldIds] = useState<FieldConfig>(EMPTY_FIELDS);
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({});
  const [uazapiUrl, setUazapiUrl] = useState<string | null>(null);
  const [gptmakerWorkspaceId, setGptmakerWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from("client_configs")
      .select("subdomain, client_name, pipelines, field_ids, stage_labels, uazapi_url, gptmaker_workspace_id")
      .eq("user_id", user.id)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError("Configuração não encontrada para este usuário.");
        } else {
          setSubdomain(data.subdomain);
          setClientName(data.client_name ?? "");
          setPipelines(data.pipelines as PipelineConfig);
          setFieldIds(data.field_ids as FieldConfig);
          setStageLabels((data.stage_labels as Record<string, string>) ?? {});
          setUazapiUrl(data.uazapi_url ?? null);
          setGptmakerWorkspaceId(data.gptmaker_workspace_id ?? null);
        }
        setLoading(false);
      });
  }, [user?.id]);

  return (
    <ClientConfigContext.Provider value={{ subdomain, clientName, pipelines, fieldIds, stageLabels, uazapiUrl, gptmakerWorkspaceId, loading, error }}>
      {children}
    </ClientConfigContext.Provider>
  );
}

export function useClientConfig() {
  const ctx = useContext(ClientConfigContext);
  if (!ctx) throw new Error("useClientConfig deve ser usado dentro de ClientConfigProvider");
  return ctx;
}
