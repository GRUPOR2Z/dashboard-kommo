import { supabase } from "./supabaseClient";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/uazapi-proxy`;

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function uazapiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeader() });
  if (!res.ok) throw new Error(`uazapi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function uazapiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`uazapi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export interface UazapiChat {
  id: string;
  wa_chatid: string;
  wa_contactName: string;
  name: string;
  phone: string;
  imagePreview: string;
  wa_lastMessageTextVote: string;
  wa_lastMsgTimestamp: number;
  wa_unreadCount: number;
  wa_isGroup: boolean;
  wa_isPinned: boolean;
  lead_name: string;
}

export interface UazapiMessage {
  id: string;
  messageid: string;
  chatid: string;
  text: string;
  fromMe: boolean;
  messageTimestamp: number;
  messageType: string;
  senderName: string;
  fileURL: string;
  content: {
    text?: string;
    caption?: string;
    url?: string;
  };
}

export async function fetchUazapiChats(limit = 50): Promise<UazapiChat[]> {
  const data = await uazapiPost<{ chats: UazapiChat[] }>("/chat/find", { limit });
  return data.chats ?? [];
}

export async function fetchUazapiMessages(
  chatid: string,
  limit = 40
): Promise<UazapiMessage[]> {
  const data = await uazapiPost<{ messages: UazapiMessage[]; hasMore: boolean }>(
    "/message/find",
    { chatid, limit }
  );
  return (data.messages ?? []).reverse();
}

// ── Send WhatsApp message via instance ───────────────────────────────────────
export async function sendWhatsAppMessage(
  instance: string,
  phone: string,
  text: string
): Promise<void> {
  const number = phone.replace(/\D/g, "");
  const res = await fetch(`${BASE}/message/sendText/${instance}`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`UaZAPI ${res.status}: ${err.slice(0, 200)}`);
  }
}
