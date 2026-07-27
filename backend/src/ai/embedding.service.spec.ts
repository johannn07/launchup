import { ConfigService } from '@nestjs/config';
import { EmbeddingService, EMBEDDING_DIMENSIONS } from './embedding.service';

const embedContent = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { embedContent: (...args: unknown[]) => embedContent(...args) },
  })),
}));

const configFrom = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

/** A vector of the correct length, tagged by its first element for identity. */
const vector = (tag: number) => [tag, ...Array(EMBEDDING_DIMENSIONS - 1).fill(0)];

const serviceWithKey = () =>
  new EmbeddingService(configFrom({ GEMINI_API_KEY: 'test-key' }));

describe('EmbeddingService', () => {
  beforeEach(() => {
    embedContent.mockReset();
    // Logger output is noise here; the assertions cover the behaviour.
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('requests the pinned dimension so the vector matches the column', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: vector(1) }] });

    await serviceWithKey().embed('hello');

    expect(embedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      }),
    );
  });

  it('defaults to gemini-embedding-2 and honours AI_EMBEDDING_MODEL', () => {
    expect(serviceWithKey().model).toBe('gemini-embedding-2');
    expect(
      new EmbeddingService(
        configFrom({ GEMINI_API_KEY: 'k', AI_EMBEDDING_MODEL: 'gemini-embedding-001' }),
      ).model,
    ).toBe('gemini-embedding-001');
  });

  it('does not send taskType, which gemini-embedding-2 ignores', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: vector(1) }] });

    await serviceWithKey().embed('hello');

    expect(embedContent.mock.calls[0][0].config).not.toHaveProperty('taskType');
  });

  it('is disabled without an API key rather than throwing', async () => {
    const service = new EmbeddingService(configFrom({}));

    expect(service.enabled).toBe(false);
    await expect(service.embed('hello')).resolves.toBeNull();
    expect(embedContent).not.toHaveBeenCalled();
  });

  it('returns null instead of propagating an API failure', async () => {
    embedContent.mockRejectedValue(new Error('429 quota exceeded'));

    await expect(serviceWithKey().embed('hello')).resolves.toBeNull();
  });

  it('rejects a vector of the wrong length', async () => {
    // A wrong-length vector is rejected by the column anyway, but one that got
    // through would corrupt every later similarity comparison.
    embedContent.mockResolvedValue({ embeddings: [{ values: [0.1, 0.2, 0.3] }] });

    await expect(serviceWithKey().embed('hello')).resolves.toBeNull();
  });

  describe('embedBatch', () => {
    it('keeps results aligned with inputs when a blank is skipped', async () => {
      // The API never sees the blank, so its two results must land back at
      // positions 0 and 2 — not 0 and 1.
      embedContent.mockResolvedValue({
        embeddings: [{ values: vector(10) }, { values: vector(30) }],
      });

      const result = await serviceWithKey().embedBatch(['first', '   ', 'third']);

      expect(embedContent.mock.calls[0][0].contents).toEqual(['first', 'third']);
      expect(result[0]?.[0]).toBe(10);
      expect(result[1]).toBeNull();
      expect(result[2]?.[0]).toBe(30);
    });

    it('returns one slot per input even when every input is blank', async () => {
      const result = await serviceWithKey().embedBatch(['', '  ']);

      expect(result).toEqual([null, null]);
      expect(embedContent).not.toHaveBeenCalled();
    });

    it('nulls only the bad vector when one comes back short', async () => {
      embedContent.mockResolvedValue({
        embeddings: [{ values: vector(1) }, { values: [0.5] }],
      });

      const result = await serviceWithKey().embedBatch(['a', 'b']);

      expect(result[0]?.[0]).toBe(1);
      expect(result[1]).toBeNull();
    });

    it('nulls every input when the whole call fails', async () => {
      embedContent.mockRejectedValue(new Error('network down'));

      await expect(serviceWithKey().embedBatch(['a', 'b'])).resolves.toEqual([null, null]);
    });
  });
});
