export interface PipelineConfig {
  FUNIL_ID: number;
  CLIENTES_ID: number;
  // Status IDs — Funil de vendas
  LEADS_ENTRADA: number;
  CONTATO_INICIAL: number;
  QUALIFICADO: number;
  PRE_AGENDAMENTO: number;
  AGENDAMENTO_REALIZADO: number;
  CONSULTA_CONFIRMADA: number;
  CONSULTA_PENDENTE: number;
  CONSULTA_NAO_CONFIRMADA: number;
  PERDIDO: number;
  FUP_1: number;
  FUP_2: number;
  FUP_3: number;
  GANHO: number;
  PERDIDO_FINAL: number;
  // Status IDs — Clientes Ativos
  AVULSA: number;
  TRIMESTRAL: number;
  SEMESTRAL: number;
  ANUAL: number;
}

export interface FieldConfig {
  DATA_HORARIO: number;
  PAGAMENTO: number;
  ORIGEM_LEAD: number;
  TIPO_CONSULTA: number;
  CIDADE: number;
  OBJETIVO_CLIENTE: number;
  CONSULTA_CONFIRMADA_FIELD: number;
  PROXIMA_CONSULTA: number;
  MOTIVO_PERDA: number;
}

export interface ExtraField {
  id: string;
  label: string;
  fieldId: number;
}

export interface AppConfig {
  subdomain: string;
  apiToken: string;
  pipelines: PipelineConfig;
  fieldIds: FieldConfig;
  extraFields: ExtraField[];
}

const STORAGE_KEY = "kommo_dashboard_config";

export const DEFAULT_CONFIG: AppConfig = {
  subdomain: "nutrijosiaspapa",
  extraFields: [],
  apiToken: "",
  pipelines: {
    FUNIL_ID: 13008175,
    CLIENTES_ID: 13008283,
    // Funil de vendas statuses
    LEADS_ENTRADA: 100304419,
    CONTATO_INICIAL: 100305075,
    QUALIFICADO: 100305079,
    PRE_AGENDAMENTO: 100706955,
    AGENDAMENTO_REALIZADO: 100305083,
    CONSULTA_CONFIRMADA: 100305087,
    CONSULTA_PENDENTE: 100305091,
    CONSULTA_NAO_CONFIRMADA: 100305431,
    PERDIDO: 100305435,
    FUP_1: 100305439,
    FUP_2: 100305443,
    FUP_3: 100305447,
    GANHO: 142,
    PERDIDO_FINAL: 143,
    // Clientes Ativos statuses
    AVULSA: 100305483,
    TRIMESTRAL: 100305487,
    SEMESTRAL: 100305491,
    ANUAL: 100305627,
  },
  fieldIds: {
    DATA_HORARIO: 748948,
    PAGAMENTO: 748962,
    ORIGEM_LEAD: 1297648,
    TIPO_CONSULTA: 1297832,
    CIDADE: 1297940,
    OBJETIVO_CLIENTE: 1298056,
    CONSULTA_CONFIRMADA_FIELD: 1863225,
    PROXIMA_CONSULTA: 1983637,
    MOTIVO_PERDA: 748956,
  },
};

export function getConfig(): AppConfig {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CONFIG;
  try {
    const saved = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...saved,
      pipelines: { ...DEFAULT_CONFIG.pipelines, ...(saved.pipelines ?? {}) },
      fieldIds: { ...DEFAULT_CONFIG.fieldIds, ...(saved.fieldIds ?? {}) },
      extraFields: saved.extraFields ?? [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
