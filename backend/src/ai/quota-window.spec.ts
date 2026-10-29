import { quotaWindow } from './quota-window';

// Gemini's daily quota resets at midnight US Pacific, which is 15:00 or 16:00
// in Manila depending on US daylight saving.
describe('quotaWindow', () => {
  it('runs midnight to midnight Pacific during daylight time (UTC-7)', () => {
    const w = quotaWindow(new Date('2026-10-30T10:00:00Z'));

    expect(w.start.toISOString()).toBe('2026-10-30T07:00:00.000Z');
    expect(w.resetAt.toISOString()).toBe('2026-10-31T07:00:00.000Z');
  });

  it('runs midnight to midnight Pacific during standard time (UTC-8)', () => {
    const w = quotaWindow(new Date('2026-11-10T10:00:00Z'));

    expect(w.start.toISOString()).toBe('2026-11-10T08:00:00.000Z');
    expect(w.resetAt.toISOString()).toBe('2026-11-11T08:00:00.000Z');
  });

  it('spans 25 hours on the day daylight time ends', () => {
    const w = quotaWindow(new Date('2026-11-01T12:00:00Z'));

    expect(w.start.toISOString()).toBe('2026-11-01T07:00:00.000Z');
    expect(w.resetAt.toISOString()).toBe('2026-11-02T08:00:00.000Z');
  });

  it('spans 23 hours on the day daylight time starts', () => {
    const w = quotaWindow(new Date('2026-03-08T12:00:00Z'));

    expect(w.start.toISOString()).toBe('2026-03-08T08:00:00.000Z');
    expect(w.resetAt.toISOString()).toBe('2026-03-09T07:00:00.000Z');
  });

  it('belongs to the previous Pacific day just before the reset', () => {
    // 14:59 Manila on 30 Oct is still 29 Oct in California.
    const w = quotaWindow(new Date('2026-10-30T06:59:00Z'));

    expect(w.start.toISOString()).toBe('2026-10-29T07:00:00.000Z');
    expect(w.resetAt.toISOString()).toBe('2026-10-30T07:00:00.000Z');
  });

  it('opens a new window exactly at the reset', () => {
    const w = quotaWindow(new Date('2026-10-30T07:00:00Z'));

    expect(w.start.toISOString()).toBe('2026-10-30T07:00:00.000Z');
    expect(w.resetAt.toISOString()).toBe('2026-10-31T07:00:00.000Z');
  });
});
