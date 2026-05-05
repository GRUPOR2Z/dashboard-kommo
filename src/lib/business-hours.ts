// Business hours: Mon–Fri, 08:00–17:30
const BIZ_START = 8 * 60;       // 480 min
const BIZ_END   = 17 * 60 + 30; // 1050 min

function advanceToBusinessTime(d: Date): Date {
  const r = new Date(d.getTime());
  // Skip weekends → next Monday 8:00
  while (r.getDay() === 0 || r.getDay() === 6) {
    r.setDate(r.getDate() + 1);
    r.setHours(8, 0, 0, 0);
  }
  const minsInDay = r.getHours() * 60 + r.getMinutes();
  if (minsInDay < BIZ_START) {
    r.setHours(8, 0, 0, 0);
  } else if (minsInDay >= BIZ_END) {
    // After 17:30 → next weekday 8:00
    r.setDate(r.getDate() + 1);
    r.setHours(8, 0, 0, 0);
    while (r.getDay() === 0 || r.getDay() === 6) {
      r.setDate(r.getDate() + 1);
    }
  }
  return r;
}

export function businessMinutesBetween(startTs: number, endTs: number): number {
  if (startTs >= endTs) return 0;
  let cursor = advanceToBusinessTime(new Date(startTs * 1000));
  const end = new Date(endTs * 1000);
  let total = 0;

  while (cursor < end) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(17, 30, 0, 0);
    const segEnd = end < dayEnd ? end : dayEnd;
    const mins = (segEnd.getTime() - cursor.getTime()) / 60_000;
    if (mins > 0) total += mins;

    // Jump to next business day at 08:00
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(8, 0, 0, 0);
    while (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return total;
}

// 9.5 business hours per day (8:00–17:30)
const BIZ_HOURS_PER_DAY = 9.5;

export function formatBizTime(minutes: number): string {
  if (minutes < 1) return "< 1min";
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const hours = minutes / 60;
  if (hours < BIZ_HOURS_PER_DAY) {
    return `${Math.floor(hours)}h ${Math.round(minutes % 60)}min`;
  }
  const days = Math.floor(hours / BIZ_HOURS_PER_DAY);
  const remH  = Math.floor(hours % BIZ_HOURS_PER_DAY);
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

const CLOSING_WORDS = [
  "até mais", "até logo", "tchauzinho", "tchau", "flw", "falou",
  "bye", "boa tarde", "boa noite", "boa sorte",
  "obrigado", "obrigada", "muito obrigado", "muito obrigada",
  "valeu", "agradeço", "agradecida", "agradecido",
];

type NoteForClosure = { created_by: number; params: { text?: string } };
type NoteForResponse = { created_by: number; created_at: number; params: { text?: string; duration?: number } };

/** Returns true if the last incoming message looks like a farewell */
export function detectClosure(notes: NoteForClosure[]): boolean {
  const incoming = notes.filter((n) => n.created_by === 0 && !!n.params?.text);
  if (incoming.length === 0) return false;
  const lastText = (incoming[incoming.length - 1].params.text ?? "").toLowerCase();
  return CLOSING_WORDS.some((w) => lastText.includes(w));
}

/** Returns business minutes from first incoming to first outgoing response, or null if no response yet */
export function firstResponseMinutes(notes: NoteForResponse[]): number | null {
  const relevant = notes.filter((n) => !!n.params?.text || n.params?.duration !== undefined);
  const firstIn  = relevant.find((n) => n.created_by === 0);
  if (!firstIn) return null;
  const firstOut = relevant.find((n) => n.created_by !== 0 && n.created_at > firstIn.created_at);
  if (!firstOut) return null;
  return businessMinutesBetween(firstIn.created_at, firstOut.created_at);
}
