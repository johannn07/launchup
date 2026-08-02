/**
 * Seeds the verified-knowledge RAG corpus (Objective 1b).
 *
 *   pnpm build && node seed-rag-corpus.js
 *
 * Additive and idempotent. A re-run with no data-file changes performs no
 * writes and spends no embedding quota — check the "unchanged" count.
 *
 * Uses NestFactory.createApplicationContext rather than a bare MikroORM
 * connection: the seeding path needs EmbeddingIndexService, and building the
 * real DI graph is what makes this exercise the server's own code.
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
    // createApplicationContext skips the HTTP middleware that normally opens a
    // RequestContext, so every injected EntityManager in the graph would reject
    // direct use. Establishing it here covers all of them, not just the
    // seeder's own.
    const orm = app.get(MikroORM);
    const result = await RequestContext.create(orm.em, () =>
      app.get(RagCorpusSeederService).seed(),
    );
    console.log(result);
    const needingVectors = result.created + result.updated + result.reindexed;
    if (result.embedded < needingVectors) {
      // Partial shortfall, not just embedded === 0: embedBatch turns a
      // transient error or dimension mismatch into null, so 60 of 64 rows can
      // embed and still leave rows unvectored behind a clean exit code.
      console.error(
        `WARNING: ${needingVectors - result.embedded} of ${needingVectors} rows that needed a ` +
          'vector did not get one (missing GEMINI_API_KEY, embedding failure, or a DB error — ' +
          `see result.failed = ${result.failed}) — semantic retrieval will not see them`,
      );
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
