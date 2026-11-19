import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const formatDate = (d) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const pct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`);

export const titleCase = (s) => String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
