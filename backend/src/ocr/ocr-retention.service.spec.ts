import { OcrRetentionService } from './ocr-retention.service';
import { OcrDocument } from 'src/entities/ocr-document.entity';

type DeleteCall = { entity: unknown; where: Record<string, unknown> };

function buildService(retentionDays?: string) {
  const calls: DeleteCall[] = [];
  const em = {
    nativeDelete: jest.fn((entity: unknown, where: Record<string, unknown>) => {
      calls.push({ entity, where });
      return Promise.resolve(3);
    }),
  };
  const config = { get: jest.fn(() => retentionDays) };

  return {
    service: new OcrRetentionService(em as never, config as never),
    em,
    calls,
  };
}

describe('OcrRetentionService.prune', () => {
  // These rows are parse leftovers; a row attached to a startup is a record.
  it('only ever deletes rows with no startup attached', async () => {
    const { service, calls } = buildService('30');

    await service.prune(new Date('2026-09-06T00:00:00.000Z'));

    expect(calls[0].entity).toBe(OcrDocument);
    expect(calls[0].where.startup).toBeNull();
  });

  it('deletes only rows older than the retention window', async () => {
    const { service, calls } = buildService('30');

    await service.prune(new Date('2026-09-06T00:00:00.000Z'));

    expect(calls[0].where.createdAt).toEqual({
      $lt: new Date('2026-08-07T00:00:00.000Z'),
    });
  });

  it('reports how many rows it removed', async () => {
    const { service } = buildService('30');

    await expect(service.prune(new Date())).resolves.toBe(3);
  });

  it('deletes nothing when retention is disabled', async () => {
    const { service, em } = buildService('0');

    await expect(service.prune(new Date())).resolves.toBe(0);
    expect(em.nativeDelete).not.toHaveBeenCalled();
  });
});

/**
 * Applies the where clause to rows instead of recording it, so the tests below
 * show which documents survive rather than which filter was passed.
 */
function buildWithRows(rows: Array<{ id: number; startup: unknown; createdAt: Date }>) {
  const table = [...rows];
  const em = {
    nativeDelete: jest.fn(async (_entity: unknown, where: any) => {
      const doomed = table.filter(
        (row) =>
          (where.startup === null ? row.startup == null : true) &&
          row.createdAt < where.createdAt.$lt,
      );
      doomed.forEach((row) => table.splice(table.indexOf(row), 1));
      return doomed.length;
    }),
  };
  const config = { get: jest.fn(() => '30') };
  return { service: new OcrRetentionService(em as never, config as never), table };
}

describe('OcrRetentionService.prune — linked documents (KD-17)', () => {
  const now = new Date('2026-09-06T00:00:00.000Z');
  const old = new Date('2026-01-01T00:00:00.000Z');

  it('keeps an old document linked to a startup', async () => {
    const { service, table } = buildWithRows([{ id: 1, startup: { id: 42 }, createdAt: old }]);

    await expect(service.prune(now)).resolves.toBe(0);
    expect(table.map((row) => row.id)).toEqual([1]);
  });

  it('deletes an old document never linked to an application', async () => {
    const { service, table } = buildWithRows([
      { id: 1, startup: { id: 42 }, createdAt: old },
      { id: 2, startup: null, createdAt: old },
    ]);

    await expect(service.prune(now)).resolves.toBe(1);
    expect(table.map((row) => row.id)).toEqual([1]);
  });
});
