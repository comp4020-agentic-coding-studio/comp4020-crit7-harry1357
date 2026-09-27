// Shared by the pages and by the clash message, so a booking reads the same
// wherever it is named.

// `date` is a bare calendar date, so it has no timezone and must not be given
// one. `new Date("2026-10-01")` is midnight UTC; formatting that in Canberra
// time renders it as the 1st, but the same code in a westward timezone
// renders the 30th. Pinning the formatter to UTC keeps the label the day the
// string says.
const DAY = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : DAY.format(parsed);
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}
