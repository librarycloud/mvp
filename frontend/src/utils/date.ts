const displayTimeZone = import.meta.env.VITE_TIME_ZONE ?? "Asia/Shanghai";

const operationTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: displayTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: displayTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatBusinessDate(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : "-";
}

export function formatOperationTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = Object.fromEntries(operationTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function todayBusinessDate(): string {
  const parts = Object.fromEntries(businessDateFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentBusinessMonthStart(): string {
  return `${todayBusinessDate().slice(0, 8)}01`;
}
