/**
 * Countdown block logic for in-app messages, with no rendering in it.
 * Same file in `@tappd/web-sdk`, the React Native SDK and the dashboard: keep them in sync.
 */

export type CountdownUnit = 'days' | 'hours' | 'minutes' | 'seconds';

export interface CountdownSettings {
  /** 'date' and 'dynamic' count down to `endAt`; 'duration' starts when the message is first shown. */
  mode?: 'date' | 'dynamic' | 'duration';
  /** ISO date, or epoch seconds or milliseconds. Liquid is resolved before delivery. */
  endAt?: string;
  durationSeconds?: number;
  showDays?: boolean;
  showHours?: boolean;
  showMinutes?: boolean;
  showSeconds?: boolean;
}

export interface CountdownPart {
  unit: CountdownUnit;
  label: string;
  value: string;
}

const UNIT_MS: Record<CountdownUnit, number> = {
  days: 86400000,
  hours: 3600000,
  minutes: 60000,
  seconds: 1000,
};

const UNIT_LABELS: Record<CountdownUnit, string> = {
  days: 'Days',
  hours: 'Hours',
  minutes: 'Min',
  seconds: 'Sec',
};

const UNIT_ORDER: CountdownUnit[] = ['days', 'hours', 'minutes', 'seconds'];

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function shownUnits(settings: CountdownSettings): CountdownUnit[] {
  const units = UNIT_ORDER.filter((unit) => {
    if (unit === 'days') return settings.showDays !== false;
    if (unit === 'hours') return settings.showHours !== false;
    if (unit === 'minutes') return settings.showMinutes !== false;
    return settings.showSeconds !== false;
  });
  return units.length ? units : UNIT_ORDER;
}

/** Parses an end date. Returns null for anything unusable, such as Liquid that resolved to nothing. */
export function parseCountdownEnd(value: unknown): number | null {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n < 100000000000 ? n * 1000 : n;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

// Pages re-render as customers swipe, so a running timer is remembered instead of restarting.
const durationStarts: Record<string, number> = {};

/**
 * When this countdown ends, as a timestamp, or null when it has nothing valid to count to.
 * A duration timer keeps running for the session and starts again once it has finished.
 */
export function resolveCountdownEnd(
  settings: CountdownSettings,
  blockId: string,
  now: number = Date.now(),
): number | null {
  if (settings.mode !== 'duration') return parseCountdownEnd(settings.endAt);
  const seconds = Number(settings.durationSeconds);
  if (!(seconds > 0)) return null;
  const durationMs = seconds * 1000;
  const started = durationStarts[blockId];
  if (started !== undefined && now < started + durationMs) return started + durationMs;
  durationStarts[blockId] = now;
  return now + durationMs;
}

/**
 * Remaining time split into the units being shown. A hidden unit rolls into the next one down,
 * and the smallest unit rounds up so a timer never reads zero while time is left.
 */
export function countdownParts(remainingMs: number, settings: CountdownSettings): CountdownPart[] {
  const units = shownUnits(settings);
  const smallest = UNIT_MS[units[units.length - 1]];
  let left = Math.ceil(Math.max(0, remainingMs) / smallest) * smallest;
  return units.map((unit) => {
    const amount = Math.floor(left / UNIT_MS[unit]);
    left -= amount * UNIT_MS[unit];
    return { unit, label: UNIT_LABELS[unit], value: pad(amount) };
  });
}

/** The same time as a sentence for screen readers. */
export function countdownSpokenText(parts: CountdownPart[]): string {
  const words = parts.map((part) => {
    const amount = Number(part.value);
    return `${amount} ${amount === 1 ? part.unit.slice(0, -1) : part.unit}`;
  });
  return `${words.join(', ')} remaining`;
}
