/**
 * Prints the assembled grounded prompt for a startup, without generating.
 *
 *   pnpm build && node inspect-prompt.js <startupId> [--dimension T]
 *
 * Answers what `rag_retrieval_log` cannot: retrieval finding rows and those
 * rows' text reaching the prompt are different things. buildGroundedPrompt once
 * rendered peer docs as id/similarity/metadata and never emitted `content`, so
 * the logs looked healthy while the model got nothing. Reading the assembled
 * string is the only direct check.
 *
 * Spends NO generation quota — stops before sendToGemini. The framework channel
 * still embeds its query (a far larger quota bucket); `deterministic` rubric
 * mode embeds nothing.
 *
 * Not side-effect free: queryVectorDatabase writes a rag_retrieval_log row, the
 * same row the corpus-toggle test reads. Nothing else is written.
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

// ReadinessType is keyed T/M/A/O/R/I but valued Technology/Market/..., and the
// value is what's stored. Accept either form.
const onlyDimension = dimensionArg
  ? (ReadinessType[dimensionArg.toUpperCase()] ?? dimensionArg)
  : null;

const rule = (label) => `\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`;

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    // See seed-rag-corpus.js - createApplicationContext opens no RequestContext,
    // so every injected EntityManager would otherwise reject use.
    const orm = app.get(MikroORM);
    // mikro-orm.config.ts hard-codes debug: true, echoing the full 768-float
    // pgvector literal twice per query and burying the prompt.
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

      // Driven off StartupReadinessLevel, not existing RNAs like rns.service.ts,
      // so it works whatever has already been generated.
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
        // Per-dimension scoping from rns.service.ts: one ragContext covers every
        // dimension, so verifiedFrameworks holds other dimensions' rubrics too.
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
