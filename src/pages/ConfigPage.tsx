import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Save, RefreshCw, CheckCircle, AlertCircle, Search, Plus, Trash2 } from "lucide-react";
import { getConfig, saveConfig, resetConfig } from "../lib/config";
import type { AppConfig, ExtraField } from "../lib/config";
import { testConnection, fetchCustomFields } from "../lib/kommo-api";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

export default function ConfigPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [extraFields, setExtraFields] = useState<ExtraField[]>(getConfig().extraFields);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load api_token from Supabase on mount so the field shows the current saved value
  useEffect(() => {
    if (!user) return;
    supabase
      .from("client_configs")
      .select("api_token")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.api_token && data.api_token !== "pendente") {
          setConfig((c) => ({ ...c, apiToken: data.api_token }));
        }
      });
  }, [user?.id]);

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
    // Save api_token to Supabase so the proxy can read it
    if (user) {
      const { error } = await supabase
        .from("client_configs")
        .update({ api_token: config.apiToken })
        .eq("user_id", user.id);
      if (error) {
        setSaveError("Erro ao salvar token: " + error.message);
        return;
      }
    }
    // Save remaining config to localStorage
    saveConfig({ ...config, extraFields });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    window.location.reload();
  }

  function handleReset() {
    if (confirm("Resetar para as configurações padrão?")) {
      resetConfig();
      window.location.reload();
    }
  }

  function addExtraField() {
    setExtraFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: "", fieldId: 0 },
    ]);
  }

  function removeExtraField(id: string) {
    setExtraFields((prev) => prev.filter((f) => f.id !== id));
  }

  function updateExtraField(id: string, patch: Partial<ExtraField>) {
    setExtraFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  }

  const inputCls =
    "w-full rounded-lg px-3 py-2 text-sm outline-none font-mono";
  const inputStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  } as React.CSSProperties;

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>
          Configurações
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Credenciais e IDs dos campos personalizados da conta Kommo
        </p>
      </div>

      {/* Connection */}
      <Section title="Conexão Kommo">
        <div className="space-y-4">
          <Field label="Subdomínio">
            <input
              className={inputCls}
              style={inputStyle}
              value={config.subdomain}
              onChange={(e) =>
                setConfig((c) => ({ ...c, subdomain: e.target.value }))
              }
            />
          </Field>

          <Field label="API Token (Bearer JWT)">
            <textarea
              className={inputCls}
              style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }}
              value={config.apiToken}
              onChange={(e) =>
                setConfig((c) => ({ ...c, apiToken: e.target.value }))
              }
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              onClick={() => testConn()}
              disabled={connFetching}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--green)",
                color: "#000",
                opacity: connFetching ? 0.7 : 1,
              }}
            >
              <RefreshCw
                size={13}
                className={connFetching ? "animate-spin" : ""}
              />
              Testar conexão
            </button>

            {connData?.success && (
              <div
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--green)" }}
              >
                <CheckCircle size={14} />
                Conectado · {(connData.account as { name?: string }).name}
              </div>
            )}
            {connError && (
              <div
                className="flex items-center gap-2 text-sm"
                style={{ color: "#f85149" }}
              >
                <AlertCircle size={14} />
                {(connError as Error).message.slice(0, 80)}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Fields */}
      <Section title="Campos Personalizados">
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Clique em "Descobrir campos" para listar os IDs da sua conta. Clique
          no ID para copiá-lo.
        </p>

        <button
          onClick={() => loadFields()}
          disabled={fieldsLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border mb-4"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--muted)",
          }}
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
                <div
                  key={f.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span style={{ color: "var(--text)" }}>{f.name}</span>
                  <span
                    className="font-mono px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80"
                    style={{
                      background: "var(--green-dim)",
                      color: "var(--green)",
                    }}
                    onClick={() =>
                      navigator.clipboard?.writeText(String(f.id))
                    }
                    title="Clique para copiar"
                  >
                    {f.id}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fixed fields */}
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
                value={config.fieldIds[key]}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    fieldIds: {
                      ...c.fieldIds,
                      [key]: parseInt(e.target.value) || 0,
                    },
                  }))
                }
              />
            </Field>
          ))}
        </div>

        {/* Extra fields */}
        <div
          className="mt-6 pt-5 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Campos adicionais
            </p>
            <button
              onClick={addExtraField}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors hover:opacity-80"
              style={{
                background: "var(--green-dim)",
                borderColor: "var(--green)",
                color: "var(--green)",
              }}
            >
              <Plus size={11} />
              Adicionar campo
            </button>
          </div>
          <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
            Adicione campos extras do Kommo para exibir informações adicionais dos leads.
          </p>

          {extraFields.length === 0 && (
            <div
              className="rounded-lg border border-dashed px-4 py-6 text-center text-xs"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Nenhum campo adicional configurado. Clique em "Adicionar campo" para começar.
            </div>
          )}

          <div className="space-y-2">
            {extraFields.map((ef) => (
              <div key={ef.id} className="flex items-center gap-2">
                <input
                  className={inputCls}
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Nome do campo"
                  value={ef.label}
                  onChange={(e) =>
                    updateExtraField(ef.id, { label: e.target.value })
                  }
                />
                <input
                  type="number"
                  className={inputCls}
                  style={{ ...inputStyle, width: "140px", flex: "none" }}
                  placeholder="field_id"
                  value={ef.fieldId || ""}
                  onChange={(e) =>
                    updateExtraField(ef.id, {
                      fieldId: parseInt(e.target.value) || 0,
                    })
                  }
                />
                <button
                  onClick={() => removeExtraField(ef.id)}
                  className="p-2 rounded-md transition-colors hover:opacity-80 flex-none"
                  style={{ color: "#f85149" }}
                  title="Remover campo"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Actions */}
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
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded-lg text-sm font-medium border"
          style={{
            background: "transparent",
            borderColor: "var(--border)",
            color: "var(--muted)",
          }}
        >
          Resetar padrão
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <h2
        className="font-semibold text-sm mb-4"
        style={{ color: "var(--text)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
