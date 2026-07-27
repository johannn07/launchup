import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { Startup } from 'src/entities/startup.entity';
import { AiService, RAG_MIN_SIMILARITY, RAG_TOP_K } from './ai.service';
import { AiConfigService } from './ai-config.service';
import { AiMetricsService } from './ai-metrics.service';
import { BaselineService } from './baseline.service';
import { EmbeddingIndexService } from './embedding-index.service';
import { EmbeddingService } from './embedding.service';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({ models: {} })),
}));

const startup = (over: Partial<Startup> = {}) =>
  ({
    id: 7,
    name: 'MediSync Cebu',
    capsuleProposal: {
      title: 'Referral Coordination',
      description: 'Links rural health units with district hospitals.',
    },
    ...over,
  }) as Startup;

/** EntityManager double exposing both the ORM path and the raw-SQL path. */
const emDouble = (sqlRows: unknown[] = [], ormRows: unknown[] = []) => {
  const execute = jest.fn().mockResolvedValue(sqlRows);
  const find = jest.fn().mockResolvedValue(ormRows);
  return {
    em: {
      find,
      getConnection: () => ({ execute }),
    } as unknown as EntityManager,
    execute,
    find,
  };
};

const build = (embed: jest.Mock) =>
  new AiService(
    { get: jest.fn() } as unknown as ConfigService,
    {} as unknown as AiMetricsService,
    {} as unknown as BaselineService,
    {} as unknown as EntityManager,
    new AiConfigService({ get: () => undefined } as unknown as ConfigService),
    {} as unknown as EmbeddingIndexService,
    { embed } as unknown as EmbeddingService,
  );

describe('getRelevantRagContexts', () => {
  it('defaults to keyword so an un-updated caller does not silently switch arms', async () => {
    const embed = jest.fn();
    const { em } = emDouble([], []);

    await build(embed).getRelevantRagContexts(startup(), em);

    expect(embed).not.toHaveBeenCalled();
  });

  it('returns nothing when the startup has no text to search with', async () => {
    const embed = jest.fn();
    const { em } = emDouble();
    const blank = { id: 7, name: '', capsuleProposal: undefined } as unknown as Startup;

    const result = await build(embed).getRelevantRagContexts(blank, em, 'semantic');

    expect(result).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  describe('keyword arm', () => {
    it('keeps only contexts sharing tokens with the startup', async () => {
      const embed = jest.fn();
      const { em } = emDouble(
        [],
        [
          { title: 'Referral networks', content: 'district hospitals coordination', sourceType: 'a', confidence: null },
          { title: 'Poultry logistics', content: 'cold chain trucking', sourceType: 'b', confidence: null },
        ],
      );

      const result = await build(embed).getRelevantRagContexts(startup(), em, 'keyword');

      expect(result.map((r) => r.title)).toEqual(['Referral networks']);
    });
  });

  describe('semantic arm', () => {
    const row = (similarity: number, title = 'Some context') => ({
      source_type: 'capsule_proposal',
      title,
      content: 'body',
      confidence: null,
      similarity,
    });

    it('embeds the query and ranks in the database', async () => {
      const embed = jest.fn().mockResolvedValue([0.1, 0.2]);
      const { em, execute, find } = emDouble([row(0.9)]);

      const result = await build(embed).getRelevantRagContexts(startup(), em, 'semantic');

      expect(embed).toHaveBeenCalled();
      expect(execute).toHaveBeenCalled();
      // The whole point is not loading every vector into Node.
      expect(find).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('excludes the startup from its own results', async () => {
      // Retrieving your own capsule proposal back as a "verified prior
      // profile" lets the model read its own input as corroboration.
      const embed = jest.fn().mockResolvedValue([0.1]);
      const { em, execute } = emDouble([]);

      await build(embed).getRelevantRagContexts(startup({ id: 42 } as Partial<Startup>), em, 'semantic');

      expect(execute.mock.calls[0][1]).toContain(42);
      expect(execute.mock.calls[0][0]).toMatch(/startup_id is distinct from/);
    });

    it('caps the result set at the configured top K', async () => {
      const embed = jest.fn().mockResolvedValue([0.1]);
      const { em, execute } = emDouble([]);

      await build(embed).getRelevantRagContexts(startup(), em, 'semantic');

      expect(execute.mock.calls[0][1]).toContain(RAG_TOP_K);
    });

    it('drops matches below the similarity floor', async () => {
      // Without a floor, nearest-neighbour search always returns its top K, so
      // unrelated text would be presented to the model as verified context.
      const embed = jest.fn().mockResolvedValue([0.1]);
      const { em } = emDouble([
        row(RAG_MIN_SIMILARITY + 0.05, 'relevant'),
        row(RAG_MIN_SIMILARITY - 0.05, 'unrelated'),
      ]);

      const result = await build(embed).getRelevantRagContexts(startup(), em, 'semantic');

      expect(result.map((r) => r.title)).toEqual(['relevant']);
    });

    it('falls back to similarity when the row carries no stored confidence', async () => {
      const embed = jest.fn().mockResolvedValue([0.1]);
      const { em } = emDouble([row(0.88)]);

      const [context] = await build(embed).getRelevantRagContexts(startup(), em, 'semantic');

      expect(context.confidence).toBeCloseTo(0.88);
    });

    it('returns nothing rather than dropping back to keyword when embedding fails', async () => {
      // A silent keyword fallback would report a semantic run that never
      // happened, contaminating the arm comparison.
      const embed = jest.fn().mockResolvedValue(null);
      const { em, find, execute } = emDouble([], [{ title: 'x', content: 'y', sourceType: 'z' }]);

      const result = await build(embed).getRelevantRagContexts(startup(), em, 'semantic');

      expect(result).toEqual([]);
      expect(find).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
