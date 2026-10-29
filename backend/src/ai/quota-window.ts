/**
 * Gemini's free-tier daily quota resets at midnight US Pacific — 15:00 in
 * Manila during US daylight time, 16:00 outside it — so the window follows the
 * zone's calendar, never a fixed UTC hour.
 */
const ZONE = 'America/Los_Angeles';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function zoneParts(at: Date) {
  const p = Object.fromEntries(
    formatter.formatToParts(at).map((part) => [part.type, Number(part.value)]),
  );
  return { y: p.year, m: p.month - 1, d: p.day, h: p.hour, min: p.minute, s: p.second };
}

/** UTC offset of the zone at an instant, in ms; negative west of Greenwich. */
function zoneOffsetMs(at: Date) {
  const { y, m, d, h, min, s } = zoneParts(at);
  return Date.UTC(y, m, d, h, min, s) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant the zone's calendar day (y, m, d) begins. Day overflow is fine. */
function zoneMidnight(y: number, m: number, d: number) {
  const wallClock = Date.UTC(y, m, d);
  // Two passes: the offset is read at the guessed instant, then at the answer.
  const first = wallClock - zoneOffsetMs(new Date(wallClock));
  return new Date(wallClock - zoneOffsetMs(new Date(first)));
}

export function quotaWindow(now: Date): { start: Date; resetAt: Date } {
  const { y, m, d } = zoneParts(now);
  return { start: zoneMidnight(y, m, d), resetAt: zoneMidnight(y, m, d + 1) };
}
