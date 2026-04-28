export function formatRelativeTime(dateStr: string, locale: string): string {
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;

    const diffMs = date.getTime() - Date.now();
    const absMs = Math.abs(diffMs);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    let value: number;
    let unit: Intl.RelativeTimeFormatUnit;

    if (absMs < minute) {
      return locale.startsWith("uk") ? "Щойно" : "Just now";
    } else if (absMs < hour) {
      value = Math.round(diffMs / minute) || -1;
      unit = "minute";
    } else if (absMs < day) {
      value = Math.round(diffMs / hour);
      unit = "hour";
    } else if (absMs < week) {
      value = Math.round(diffMs / day);
      unit = "day";
    } else if (absMs < month) {
      value = Math.round(diffMs / week);
      unit = "week";
    } else if (absMs < year) {
      value = Math.round(diffMs / month);
      unit = "month";
    } else {
      value = Math.round(diffMs / year);
      unit = "year";
    }

    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return formatter.format(value, unit);
  } catch {
    return dateStr;
  }
}
