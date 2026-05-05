export interface KommoTag {
  id: number;
  name: string;
}

export interface KommoCustomField {
  field_id: number;
  field_name: string;
  values: Array<{ value: string; enum_id?: number }>;
}

export interface KommoContact {
  id: number;
  name: string;
}

export interface KommoLead {
  id: number;
  name: string;
  price: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  pipeline_id: number;
  status_id: number;
  custom_fields_values: KommoCustomField[] | null;
  _embedded?: {
    tags?: KommoTag[];
    contacts?: KommoContact[];
  };
}

export interface KommoStatus {
  id: number;
  name: string;
  color: string;
  sort: number;
}

export interface KommoPipeline {
  id: number;
  name: string;
  _embedded?: {
    statuses?: KommoStatus[];
  };
}

export type FilterPeriod = "hoje" | "ontem" | "7d" | "30d" | "todos" | "custom";

export interface KommoNote {
  id: number;
  entity_id: number;
  lead_id: number;
  created_by: number;
  created_at: number;
  updated_at: number;
  note_type: string;
  params: {
    text?: string;
    duration?: number;
    source?: string;
    phone?: string;
    link?: string;
    uniq?: string;
    is_read?: boolean;
    origin?: string;
    // WhatsApp Lite / service messages
    service?: string;
    initiator?: string;
  };
}

export interface StatusEvent {
  id: string;
  lead_id: number;
  created_at: number;
  status_before: number;
  status_after: number;
  pipeline_id: number;        // pipeline DEPOIS da transição
  pipeline_id_before: number; // pipeline ANTES da transição
}
