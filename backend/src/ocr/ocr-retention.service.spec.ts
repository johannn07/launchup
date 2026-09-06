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
