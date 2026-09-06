import {
  DEFAULT_OCR_RETENTION_DAYS,
  resolveRetentionDays,
  retentionCutoff,
} from './ocr-retention';

describe('retentionCutoff', () => {
  it('sits one retention window behind the given time', () => {
    const now = new Date('2026-09-06T00:00:00.000Z');

    expect(retentionCutoff(now, 30)).toEqual(
      new Date('2026-08-07T00:00:00.000Z'),
    );
  });

  it('is the current time when retention is zero', () => {
    const now = new Date('2026-09-06T00:00:00.000Z');

    expect(retentionCutoff(now, 0)).toEqual(now);
  });
});

describe('resolveRetentionDays', () => {
  it('falls back to the default when unset', () => {
    expect(resolveRetentionDays(undefined)).toBe(DEFAULT_OCR_RETENTION_DAYS);
  });

  it('reads a positive integer from the environment', () => {
    expect(resolveRetentionDays('7')).toBe(7);
  });

  // A typo must not silently turn into "delete everything".
  it('falls back to the default on a non-numeric value', () => {
    expect(resolveRetentionDays('thirty')).toBe(DEFAULT_OCR_RETENTION_DAYS);
  });

  it('falls back to the default on a negative value', () => {
    expect(resolveRetentionDays('-5')).toBe(DEFAULT_OCR_RETENTION_DAYS);
  });

  it('treats 0 as disabled rather than as "prune everything"', () => {
    expect(resolveRetentionDays('0')).toBe(0);
  });
});
