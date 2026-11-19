const DAY_MS = 86_400_000;

export const todayStr = () => new Date().toISOString().slice(0, 10);

const toUtc = (s) => Date.parse(`${s}T00:00:00Z`);

export function addDays(dateStr, days) {
  return new Date(toUtc(dateStr) + days * DAY_MS).toISOString().slice(0, 10);
}

// Whole days from `a` to `b` (positive when b is later).
export function daysBetween(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export const isValidDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s));
