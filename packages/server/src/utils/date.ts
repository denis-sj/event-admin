import { config } from '../config.js';

/**
 * Format a Date as a human-readable Russian date string (date only, no time).
 *
 * Uses the configured timezone (TZ env var, defaults to Europe/Moscow) via
 * Intl.DateTimeFormat so the displayed calendar day matches the organizer's
 * intent regardless of which timezone the server process runs in.
 *
 * Both the diploma PDF and the public verification page call this function,
 * guaranteeing they always show the same date.
 *
 * Example: formatDateRu(new Date('2025-05-31T21:30:00Z'))
 *   TZ=Europe/Moscow → "1 июня 2025"  (UTC+3, so June 1 00:30 local)
 *   TZ=UTC           → "31 мая 2025"
 */
export function formatDateRu(date: Date): string {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: config.TZ,
  });

  const parts = formatter.formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';

  return `${day} ${month} ${year}`;
}
