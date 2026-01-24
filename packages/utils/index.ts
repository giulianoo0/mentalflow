export type DateParseResult = {
  timestampMs: number | null;
  iso?: string;
  localDate?: string;
  localTime?: string;
  hasDate: boolean;
  hasTime: boolean;
  reason?: string;
};

export function parseDateTimePt(
  text: string,
  options: {
    baseDateMs: number;
    timezoneOffsetMinutes?: number;
  },
): DateParseResult {
  const timezoneOffsetMinutes =
    options.timezoneOffsetMinutes ?? new Date().getTimezoneOffset();
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const baseLocal = new Date(options.baseDateMs + timezoneOffsetMinutes * 60000);
  const baseYear = baseLocal.getUTCFullYear();
  const baseMonth = baseLocal.getUTCMonth();
  const baseDay = baseLocal.getUTCDate();

  let targetYear = baseYear;
  let targetMonth = baseMonth;
  let targetDay = baseDay;
  let hasDate = false;

  const relativeMatch = normalized.match(/\b(hoje|amanha|depois de amanha)\b/);
  if (relativeMatch) {
    hasDate = true;
    const keyword = relativeMatch[1];
    const offsetDays = keyword === "hoje" ? 0 : keyword === "amanha" ? 1 : 2;
    const localDate = new Date(
      Date.UTC(baseYear, baseMonth, baseDay + offsetDays),
    );
    targetYear = localDate.getUTCFullYear();
    targetMonth = localDate.getUTCMonth();
    targetDay = localDate.getUTCDate();
  }

  const dateMatch = normalized.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (dateMatch) {
    hasDate = true;
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]) - 1;
    let year = dateMatch[3] ? Number(dateMatch[3]) : baseYear;
    if (year < 100) year = 2000 + year;
    targetYear = year;
    targetMonth = month;
    targetDay = day;
  }

  const weekdayMap: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    "segunda-feira": 1,
    terca: 2,
    "terca-feira": 2,
    quarta: 3,
    "quarta-feira": 3,
    quinta: 4,
    "quinta-feira": 4,
    sexta: 5,
    "sexta-feira": 5,
    sabado: 6,
    "sabado-feira": 6,
  };
  const weekdayMatch = Object.keys(weekdayMap).find((name) =>
    normalized.includes(name),
  );
  if (!hasDate && weekdayMatch) {
    hasDate = true;
    const targetWeekday = weekdayMap[weekdayMatch] ?? baseLocal.getUTCDay();
    const baseWeekday = baseLocal.getUTCDay();
    let diff = (targetWeekday - baseWeekday + 7) % 7;
    if (normalized.includes("proxima") || normalized.includes("proximo")) {
      if (diff === 0) diff = 7;
    }
    const localDate = new Date(
      Date.UTC(baseYear, baseMonth, baseDay + diff),
    );
    targetYear = localDate.getUTCFullYear();
    targetMonth = localDate.getUTCMonth();
    targetDay = localDate.getUTCDate();
  }

  const timeMatch = normalized.match(/\b(\d{1,2})(?:[:h](\d{2}))?\b/);
  let hour = 9;
  let minute = 0;
  let hasTime = false;
  if (timeMatch) {
    hasTime = true;
    hour = Number(timeMatch[1]);
    minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
  }

  if (!hasDate) {
    return {
      timestampMs: null,
      hasDate,
      hasTime,
      reason: "No date found",
    };
  }

  const utcMs = Date.UTC(targetYear, targetMonth, targetDay, hour, minute);
  const timestampMs = utcMs - timezoneOffsetMinutes * 60000;
  const iso = new Date(timestampMs).toISOString();
  const localDate = new Date(timestampMs + timezoneOffsetMinutes * 60000);

  return {
    timestampMs,
    iso,
    localDate: localDate.toISOString().slice(0, 10),
    localTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hasDate,
    hasTime,
  };
}
