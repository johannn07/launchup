/**
 * Prints the assembled grounded prompt for a startup, without generating.
 *
 *   pnpm build && node inspect-prompt.js <startupId> [--dimension T]
 *
 * Answers a question `rag_retrieval_log` cannot: retrieval finding rows and
 * those rows' text reaching the prompt are two different things, and the defect
 * this corpus work fixed lived in the gap between them — buildGroundedPrompt
 * rendered peer docs as id/similarity/metadata and never emitted `content`, so
 * retrieval logs looked healthy while the model received nothing. Reading the
 * assembled string is the only direct check.
 *
 * Spends NO generation quota: it stops at GroundedPromptBuilderService and
 * never reaches sendToGemini. The framework channel still embeds its query
 * (a separate, far larger quota bucket than GenerateRequestsPerDay), and in
 * the default `deterministic` rubric mode the rubric channel embeds nothing.
 *
 * Not side-effect free: queryVectorDatabase writes a rag_retrieval_log row, by
 * design — it is the same row the corpus-toggle test reads, so what you audit
 * afterwards includes what you inspected here. Nothing else is written.
 */
process.chdir(__dirname);

const fs = require('fs');
const DIST = fs.existsSync(`${__dirname}/dist/src/mikro-orm.config.js`) ? './dist/src' : './dist';
const req = (p) => require(`${DIST}/${p}`);

const { NestFactory } = require('@nestjs/core');
const { MikroORM, RequestContext } = require('@mikro-orm/core');
const { AppModule } = req('app.module');
const { AiConfigService } = req('ai/ai-config.service');
const { RagQueryService } = req('rna/rag-query.service');
const { GroundedPromptBuilderService } = req('rna/grounded-prompt-builder.service');
const { Startup } = req('entities/startup.entity');
const { StartupReadinessLevel } = req('entities/startup-readiness-level.entity');
const { ReadinessType } = req('entities/enums/readiness-type.enum');

const args = process.argv.slice(2);
const startupId = Number(args.find((a) => !a.startsWith('--')));
const dimensionIdx = args.indexOf('--dimension');
const dimensionArg = dimensionIdx >= 0 ? args[dimensionIdx + 1] : null;

if (!Number.isInteger(startupId)) {
  console.error('Usage: node inspect-prompt.js <startupId> [--dimension T|M|A|O|R|I]');
  process.exit(1);
}

// ReadinessType is a string enum keyed T/M/A/O/R/I but *valued* Technology/
// Market/... and it is the value that is stored and compared. Accept either, so
// `--dimension T` and `--dimension Technology` both work.
const onlyDimension = dimensionArg
  ? (ReadinessType[dimensionArg.toUpperCase()] ?? dimensionArg)
  : null;

const rule = (label) => `\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`;

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    // Same reason as seed-rag-corpus.js: createApplicationContext never runs the
    // HTTP middleware that opens a MikroORM RequestContext per request, so every
    // injected EntityManager reached from this call would otherwise reject use.
    const orm = app.get(MikroORM);
    // mikro-orm.config.ts hard-codes debug: true, which echoes every statement —
    // including the full 768-float pgvector literal the framework channel sends,
    // twice per query. That buries the prompt this tool exists to show.
    orm.config.set('debug', false);
    await RequestContext.create(orm.em, async () => {
      const em = orm.em;
      const startup = await em.findOne(
        Startup,
        { id: startupId },
        { populate: ['capsuleProposal'] },
      );
      if (!startup) {
        console.error(`No startup with id ${startupId}`);
        process.exitCode = 1;
        return;
      }

      const readinessLevels = await em.find(
        StartupReadinessLevel,
        { startup },
        { populate: ['readinessLevel'] },
      );
      if (readinessLevels.length === 0) {
        console.error(`Startup ${startupId} has no readiness levels — nothing to ground against`);
        process.exitCode = 1;
        return;
      }

      // Driven off StartupReadinessLevel rather than off existing RNAs (which is
      // what rns.service.ts does) so this works on any startup regardless of what
      // has already been generated for it.
      const dimensions = readinessLevels.map((srl) => ({
        readinessType: srl.readinessLevel.readinessType,
        level: srl.readinessLevel.level,
      }));

      const proposal = startup.capsuleProposal;
      const startupProfile = {
        title: proposal?.title,
        description: proposal?.description,
        objectives: proposal?.objectives,
        scope: proposal?.scope,
        readinessLevels: dimensions.map((d) => ({ type: d.readinessType, level: d.level })),
      };

      const config = app.get(AiConfigService).resolve();
      console.log(rule('RESOLVED PIPELINE CONFIG'));
      console.log(config);

      const context = await app
        .get(RagQueryService)
        .queryVectorDatabase(String(startupId), { config, dimensions });

      console.log(rule('RETRIEVAL RESULT'));
      console.log({
        rubrics: context.verifiedFrameworks.length,
        frameworks: context.businessModels.length,
        peers: context.similarProfiles.length,
        lowConfidence: context.lowConfidence,
      });

      if (context.lowConfidence) {
        // Mirrors the guard in rna.service.ts and rns.service.ts: all three
        // channels empty means neither service builds a grounded prompt at all.
        console.log(
          '\nAll three channels came back empty, so generation would fall back to the\n' +
            'plain (ungrounded) prompt. Nothing to inspect. Check that the corpus is\n' +
            'seeded (node seed-rag-corpus.js) and AI_RAG_CORPUS_ENABLED is not false.',
        );
        return;
      }

      const builder = app.get(GroundedPromptBuilderService);
      const targets = onlyDimension
        ? dimensions.filter((d) => d.readinessType === onlyDimension)
        : dimensions;

      if (targets.length === 0) {
        console.error(`\nStartup ${startupId} has no "${onlyDimension}" readiness level`);
        process.exitCode = 1;
        return;
      }

      for (const { readinessType, level } of targets) {
        // Per-dimension scoping reproduced from rns.service.ts: one ragContext is
        // fetched for every dimension, so verifiedFrameworks holds rubric rows for
        // dimensions other than the one a given task prompt is generating for.
        const scoped = {
          ...context,
          verifiedFrameworks: context.verifiedFrameworks.filter(
            (doc) => doc.readinessType === readinessType,
          ),
        };
        const prompt = builder.buildGroundedPrompt(
          scoped,
          startupProfile,
          [readinessType],
          `\n--- Task ---\n[task block omitted — this tool inspects grounding, not the task]\n`,
        );

        console.log(
          rule(`PROMPT — ${readinessType} (level ${level}) — ${scoped.verifiedFrameworks.length} rubric row(s)`),
        );
        console.log(prompt);
      }
    });
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
