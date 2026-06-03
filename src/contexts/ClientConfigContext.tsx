import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import type { PipelineConfig, FieldConfig, PipelineEntry } from "../lib/config";

interface ClientConfigValue {
  subdomain: string;
  clientName: string;
  pipelines: PipelineConfig;
  fieldIds: FieldConfig;
  stageLabels: Record<string, string>;
  pipelineNames: Record<string, PipelineEntry>;
  uazapiUrl: string | null;
  uazapiInstance: string | null;
  gptmakerWorkspaceId: string | null;
  hiddenSections: string[];
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
  const [pipelineNames, setPipelineNames] = useState<Record<string, PipelineEntry>>({});
  const [uazapiUrl, setUazapiUrl] = useState<string | null>(null);
  const [uazapiInstance, setUazapiInstance] = useState<string | null>(null);
  const [gptmakerWorkspaceId, setGptmakerWorkspaceId] = useState<string | null>(null);
  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
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
      .select("subdomain, client_name, pipelines, field_ids, stage_labels, pipeline_names, uazapi_url, uazapi_instance, gptmaker_workspace_id, hidden_sections")
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
          setPipelineNames((data.pipeline_names as Record<string, PipelineEntry>) ?? {});
          setUazapiUrl(data.uazapi_url ?? null);
          setUazapiInstance(data.uazapi_instance ?? null);
          setGptmakerWorkspaceId(data.gptmaker_workspace_id ?? null);
          setHiddenSections((data.hidden_sections as string[]) ?? []);
        }
        setLoading(false);
      });
  }, [user?.id]);

  return (
    <ClientConfigContext.Provider value={{ subdomain, clientName, pipelines, fieldIds, stageLabels, pipelineNames, uazapiUrl, uazapiInstance, gptmakerWorkspaceId, hiddenSections, loading, error }}>
      {children}
    </ClientConfigContext.Provider>
  );
}

export function useClientConfig() {
  const ctx = useContext(ClientConfigContext);
  if (!ctx) throw new Error("useClientConfig deve ser usado dentro de ClientConfigProvider");
  return ctx;
}
