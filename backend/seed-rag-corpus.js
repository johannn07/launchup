/**
 * Seeds the verified-knowledge RAG corpus (Objective 1b).
 *
 *   pnpm build && node seed-rag-corpus.js
 *
 * Additive and idempotent. A re-run with no data-file changes performs no
 * writes and spends no embedding quota — check the "unchanged" count.
 *
 * Uses NestFactory.createApplicationContext rather than a bare MikroORM
 * connection because the seeding path depends on EmbeddingIndexService, which
 * depends on EmbeddingService and ConfigService. Building the real DI graph is
 * also what makes this exercise the same code the running server uses.
 */
process.chdir(__dirname);

const fs = require('fs');
const DIST = fs.existsSync(`${__dirname}/dist/src/mikro-orm.config.js`) ? './dist/src' : './dist';
const req = (p) => require(`${DIST}/${p}`);

const { NestFactory } = require('@nestjs/core');
const { MikroORM, RequestContext } = require('@mikro-orm/core');
const { AppModule } = req('app.module');
const { RagCorpusSeederService } = req('ai/rag-corpus-seeder.service');

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    // createApplicationContext never runs the HTTP middleware that normally
    // opens a MikroORM RequestContext per request, so any injected
    // EntityManager throughout the DI graph — the seeder's own, and the one
    // EmbeddingIndexService holds internally — would reject direct use.
    // Establishing the context by hand here covers every service reached
    // from this call, not just the seeder's own EntityManager.
    const orm = app.get(MikroORM);
    const result = await RequestContext.create(orm.em, () =>
      app.get(RagCorpusSeederService).seed(),
    );
    console.log(result);
    if (result.embedded === 0 && result.created + result.updated + result.reindexed > 0) {
      // Rows landed (or were flagged as needing a vector) but nothing was
      // indexed means GEMINI_API_KEY is missing or the embedding call failed.
      // Retrieval will not see this corpus at all, so say so loudly rather
      // than reporting success.
      console.error('WARNING: rows were written but none were embedded — semantic retrieval will not see them');
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
