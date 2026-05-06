import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import type { PipelineConfig, FieldConfig } from "../lib/config";

interface ClientConfigValue {
  subdomain: string;
  pipelines: PipelineConfig;
  fieldIds: FieldConfig;
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
  const [pipelines, setPipelines] = useState<PipelineConfig>(EMPTY_PIPELINES);
  const [fieldIds, setFieldIds] = useState<FieldConfig>(EMPTY_FIELDS);
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
      .select("subdomain, pipelines, field_ids, uazapi_url, gptmaker_workspace_id")
      .eq("user_id", user.id)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError("Configuração não encontrada para este usuário.");
        } else {
          setSubdomain(data.subdomain);
          setPipelines(data.pipelines as PipelineConfig);
          setFieldIds(data.field_ids as FieldConfig);
          setUazapiUrl(data.uazapi_url ?? null);
          setGptmakerWorkspaceId(data.gptmaker_workspace_id ?? null);
        }
        setLoading(false);
      });
  }, [user?.id]);

  return (
    <ClientConfigContext.Provider value={{ subdomain, pipelines, fieldIds, uazapiUrl, gptmakerWorkspaceId, loading, error }}>
      {children}
    </ClientConfigContext.Provider>
  );
}

export function useClientConfig() {
  const ctx = useContext(ClientConfigContext);
  if (!ctx) throw new Error("useClientConfig deve ser usado dentro de ClientConfigProvider");
  return ctx;
}
