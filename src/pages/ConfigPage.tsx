import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Save, RefreshCw, CheckCircle, AlertCircle, Search, Plus, Trash2, Tag } from "lucide-react";
import type { FieldConfig } from "../lib/config";
import { testConnection, fetchCustomFields } from "../lib/kommo-api";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useClientConfig } from "../contexts/ClientConfigContext";

export default function ConfigPage() {
  const { user } = useAuth();
  const { subdomain, fieldIds, stageLabels, loading: configLoading } = useClientConfig();

  const [apiToken, setApiToken] = useState("");
  const [editedFieldIds, setEditedFieldIds] = useState<FieldConfig | null>(null);
  const [editedStageLabels, setEditedStageLabels] = useState<[string, string][] | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const initialized = useRef(false);

  // Load api_token from Supabase (not in context)
  useEffect(() => {
    if (!user) return;
    supabase
      .from("client_configs")
      .select("api_token")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.api_token && data.api_token !== "pendente") {
          setApiToken(data.api_token);
        }
      });
  }, [user?.id]);

  // Sync from context once loaded
  useEffect(() => {
    if (!configLoading && !initialized.current) {
      initialized.current = true;
      setEditedFieldIds({ ...fieldIds });
      setEditedStageLabels(Object.entries(stageLabels));
    }
  }, [configLoading, fieldIds, stageLabels]);

  const currentFieldIds = editedFieldIds ?? fieldIds;
  const currentStageLabels = editedStageLabels ?? Object.entries(stageLabels);

  const {
    data: connData,
    isLoading: connLoading,
    error: connError,
    refetch: testConn,
    isFetching: connFetching,
  } = useQuery({
    queryKey: ["test-connection"],
    queryFn: testConnection,
    enabled: false,
    retry: 0,
  });

  const {
    data: fields,
    isLoading: fieldsLoading,
    refetch: loadFields,
  } = useQuery({
    queryKey: ["custom-fields"],
    queryFn: fetchCustomFields,
    enabled: false,
    retry: 0,
  });

  async function handleSave() {
    setSaveError(null);
    if (!user) return;

    const stageLabelsObj = Object.fromEntries(
      currentStageLabels.filter(([k]) => k.trim())
    );

    const { error } = await supabase
      .from("client_configs")
      .update({
        api_token: apiToken,
        field_ids: currentFieldIds,
        stage_labels: stageLabelsObj,
      })
      .eq("user_id", user.id);

    if (error) {
      setSaveError("Erro ao salvar: " + error.message);
      return;
    }

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      window.location.reload();
    }, 1500);
  }

  function updateFieldId(key: keyof FieldConfig, val: number) {
    setEditedFieldIds((prev) => ({ ...(prev ?? fieldIds), [key]: val }));
  }

  function updateLabelKey(idx: number, key: string) {
    setEditedStageLabels((prev) =>
      prev ? prev.map((e, i) => (i === idx ? [key, e[1]] : e)) : prev
    );
  }

  function updateLabelValue(idx: number, value: string) {
    setEditedStageLabels((prev) =>
      prev ? prev.map((e, i) => (i === idx ? [e[0], value] : e)) : prev
    );
  }

  function addLabel() {
    setEditedStageLabels((prev) => [...(prev ?? []), ["", ""]]);
  }

  function removeLabel(idx: number) {
    setEditedStageLabels((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  const inputCls = "w-full rounded-lg px-3 py-2 text-sm outline-none font-mono";
  const inputStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  } as React.CSSProperties;

  if (configLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>
            Configurações
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Conta: <span className="font-mono" style={{ color: "var(--green)" }}>{subdomain}.kommo.com</span>
          </p>
        </div>

        {/* Conexão */}
        <Section title="Conexão Kommo">
          <div className="space-y-4">
            <Field label="Subdomínio">
              <input
                className={inputCls}
                style={{ ...inputStyle, opacity: 0.6 }}
                value={subdomain}
                readOnly
              />
            </Field>

            <Field label="API Token (Bearer JWT)">
              <textarea
                className={inputCls}
                style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </Field>

            <div className="flex items-center gap-3">
              <button
                onClick={() => testConn()}
                disabled={connFetching}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--green)", color: "#000", opacity: connFetching ? 0.7 : 1 }}
              >
                <RefreshCw size={13} className={connFetching ? "animate-spin" : ""} />
                Testar conexão
              </button>
              {connData?.success && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--green)" }}>
                  <CheckCircle size={14} />
                  Conectado · {(connData.account as { name?: string }).name}
                </div>
              )}
              {connError && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "#f85149" }}>
                  <AlertCircle size={14} />
                  {(connError as Error).message.slice(0, 80)}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Campos Personalizados */}
        <Section title="Campos Personalizados">
          <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
            Clique em "Descobrir campos" para listar os IDs da sua conta.
          </p>

          <button
            onClick={() => loadFields()}
            disabled={fieldsLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border mb-4"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--muted)" }}
          >
            <Search size={11} className={fieldsLoading ? "animate-spin" : ""} />
            Descobrir campos da minha conta
          </button>

          {fields && fields.length > 0 && (
            <div
              className="rounded-lg border p-3 mb-4 max-h-48 overflow-y-auto"
              style={{ background: "var(--bg)", borderColor: "var(--border)" }}
            >
              <div className="space-y-1">
                {fields.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--text)" }}>{f.name}</span>
                    <span
                      className="font-mono px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80"
                      style={{ background: "var(--green-dim)", color: "var(--green)" }}
                      onClick={() => navigator.clipboard?.writeText(String(f.id))}
                      title="Clique para copiar"
                    >
                      {f.id}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs font-medium mb-3" style={{ color: "var(--muted)" }}>
            Campos fixos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(
              [
                ["DATA_HORARIO", "Data e Horário"],
                ["PAGAMENTO", "Pagamento"],
                ["ORIGEM_LEAD", "Origem do Lead"],
                ["TIPO_CONSULTA", "Tipo de Consulta"],
                ["CIDADE", "Cidade"],
                ["OBJETIVO_CLIENTE", "Objetivo do Cliente"],
                ["CONSULTA_CONFIRMADA_FIELD", "Consulta Confirmada"],
                ["PROXIMA_CONSULTA", "Próxima Consulta"],
                ["MOTIVO_PERDA", "Motivo de Perda"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={`${label} (field_id)`}>
                <input
                  type="number"
                  className={inputCls}
                  style={inputStyle}
                  value={currentFieldIds[key] || ""}
                  onChange={(e) => updateFieldId(key, parseInt(e.target.value) || 0)}
                />
              </Field>
            ))}
          </div>
        </Section>

        {/* Nomes das Colunas */}
        <Section title="Nomes das Colunas">
          <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
            Personalize o nome de cada etapa do funil exibida no dashboard. Use a chave de config
            (ex: <span className="font-mono">FUP_1</span>) ou o ID da etapa (ex:{" "}
            <span className="font-mono">status_106144984</span>).
          </p>

          <div className="space-y-2">
            {currentStageLabels.map(([key, value], idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className={inputCls}
                  style={{ ...inputStyle, flex: "1", minWidth: 0 }}
                  placeholder="Chave (ex: FUP_1 ou status_123456)"
                  value={key}
                  onChange={(e) => updateLabelKey(idx, e.target.value)}
                />
                <span style={{ color: "var(--muted)", flexShrink: 0 }}>→</span>
                <input
                  className={inputCls}
                  style={{ ...inputStyle, flex: "1", minWidth: 0 }}
                  placeholder="Nome exibido"
                  value={value}
                  onChange={(e) => updateLabelValue(idx, e.target.value)}
                />
                <button
                  onClick={() => removeLabel(idx)}
                  className="p-2 rounded-md hover:opacity-80 flex-none"
                  style={{ color: "#f85149" }}
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {currentStageLabels.length === 0 && (
            <div
              className="rounded-lg border border-dashed px-4 py-6 text-center text-xs mb-3"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Nenhum nome personalizado configurado.
            </div>
          )}

          <button
            onClick={addLabel}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border mt-3 transition-colors hover:opacity-80"
            style={{ background: "var(--green-dim)", borderColor: "var(--green)", color: "var(--green)" }}
          >
            <Plus size={11} />
            Adicionar nome
          </button>
        </Section>

        {/* Ações */}
        {saveError && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "#f85149" }}>
            <AlertCircle size={14} />
            {saveError}
          </div>
        )}

        <div className="flex items-center gap-3 pb-4">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--green)", color: "#000" }}
          >
            {saved ? (
              <>
                <CheckCircle size={14} />
                Salvo!
              </>
            ) : (
              <>
                <Save size={14} />
                Salvar configurações
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <h2 className="font-semibold text-sm mb-4" style={{ color: "var(--text)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
