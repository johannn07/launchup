#!/usr/bin/env node
/**
 * Objective 3a's two owed numbers, from one stored run of 10 calls.
 *
 * Stage 1 calibrates SUPPORT_THRESHOLD against 80 human-labelled
 * (document, field) observations. Stage 2 scores CER against human-typed
 * reference spans drawn by seed.
 *
 * Pre-registered in docs/superpowers/specs/2026-09-05-ocr-accuracy-design.md
 * BEFORE any call. The selection rule, the stopping rule and the confound check
 * are all fixed there; nothing here may relax them after seeing the sweep.
 *
 *   node measurement/measure-ocr-accuracy.js --dry-run   # zero calls, all gates
 *   node measurement/measure-ocr-accuracy.js --run       # spends 10 calls
 *   node measurement/measure-ocr-accuracy.js --score     # stored run, no calls
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { DOCUMENTS, FIELDS, CONTESTED } = require('./lib/ocr-inventory');
const { characterErrorRate, selectSpans, normalize } = require('./lib/cer');

const BACKEND = path.resolve(__dirname, '..');
const DATA = path.join(__dirname, 'data');
const RESULTS = path.join(__dirname, 'results');

/** Pre-registered in the design. Changing it invalidates the draw. */
const SEED = 20260905;

/** Outside the repo: these are photographs of a teammate's handwriting. */
const DEFAULT_IMAGE_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'sample proposals',
);

const SPANS_FILE = path.join(DATA, 'ocr-reference-spans.md');
const RUN_FILE = path.join(RESULTS, '2026-09-05-ocr-accuracy.json');

/** One call per image, and the budget must never silently exceed it. */
const MAX_CALLS = 10;

// --------------------------------------------------------------------------
// Backend module loading
// --------------------------------------------------------------------------

/**
 * ts-node over the checked-out tree, never ./dist — refreshing dist means
 * `pnpm build`, which races `pnpm dev` over the same directory. Lazy, so
 * requiring this file for its pure functions pays none of it.
 */
let _backend = null;
function loadBackend() {
  if (_backend) return _backend;

  require(path.join(BACKEND, 'node_modules/tsconfig-paths')).register({
    baseUrl: BACKEND,
    paths: {},
  });
  require(path.join(BACKEND, 'node_modules/ts-node')).register({
    transpileOnly: true,
    dir: BACKEND,
  });

  const req = (p) => require(path.join(BACKEND, 'src', p));

  _backend = {
    NestFactory: require(path.join(BACKEND, 'node_modules/@nestjs/core')).NestFactory,
    AppModule: req('app.module').AppModule,
    AiService: req('ai/ai.service').AiService,
    AiConfigService: req('ai/ai-config.service').AiConfigService,
    // Production's scorer, imported — never reimplemented. A harness copy would
    // measure the harness.
    supportRatio: req('ocr/field-confidence').supportRatio,
    classifyField: req('ocr/field-confidence').classifyField,
    SUPPORT_THRESHOLD: req('ocr/field-confidence').SUPPORT_THRESHOLD,
  };
  return _backend;
}

// --------------------------------------------------------------------------
// Reference spans
// --------------------------------------------------------------------------

/**
 * Reads the human-typed template. Returns { file -> text } for filled blocks
 * only, so a partially typed file reports exactly which spans are missing
 * rather than scoring the blanks as total misses.
 */
function parseReferenceSpans(markdown) {
  const spans = {};
  const re = /^##\s+(\S+\.jpg)[^\n]*\n+```text\n([\s\S]*?)\n?```/gm;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const [, file, body] = m;
    const text = body.trim();
    if (text.length > 0) spans[file] = text;
  }
  return spans;
}

function loadReferenceSpans() {
  if (!fs.existsSync(SPANS_FILE)) return {};
  return parseReferenceSpans(fs.readFileSync(SPANS_FILE, 'utf8'));
}

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------

function ctxFor(config) {
  return {
    runId: 0,
    // No ai_generation_runs row: this is measurement, not an app request, and
    // AiRunService.begin would need a RequestContext to write one.
    run: {},
    config: Object.freeze({ ...config }),
    tokens: { promptTokens: 0, completionTokens: 0, recorded: false },
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Mirrors startup.service.ts:391-392 — the ONE piece of production behaviour
 * reproduced here rather than imported, because the fence-stripping is inline
 * in the controller path rather than a function.
 *
 * Throws rather than returning {} on a parse failure: a silent empty payload
 * would score every field as a total miss and read as a catastrophic model
 * result, which is the wrong diagnosis and the expensive one to chase.
 */
function parseAiPayload(raw, file) {
  const clean = String(raw ?? '')
    .replace(/^```json\s*/, '')
    .replace(/\s*```$/, '');
  if (!clean.trim()) throw new Error(`${file}: model returned an empty payload`);
  try {
    return JSON.parse(clean);
  } catch (err) {
    throw new Error(
      `${file}: payload did not parse — if the model changed its fencing, this ` +
        `harness's mirror of startup.service.ts:391-392 has drifted. First 200 chars: ` +
        JSON.stringify(clean.slice(0, 200)),
    );
  }
}

/**
 * The 10 extractions. `generate` is the generateContent implementation to
 * install: the real one live, a stub under --dry-run. Everything else — prompt
 * assembly, retry, payload parsing, accounting — is identical in both modes,
 * which is what makes --dry-run a rehearsal rather than a separate program.
 */
async function runExtractions(aiService, config, { imageDir, generate, maxCalls = MAX_CALLS }) {
  const models = aiService.ai.models;
  const impl = generate || models.generateContent.bind(models);

  let apiCalls = 0;
  models.generateContent = async (req) => {
    apiCalls += 1;
    return impl(req);
  };

  const rows = [];
  try {
    for (const doc of DOCUMENTS) {
      if (apiCalls >= maxCalls) {
        rows.push({ file: doc.file, status: 'skipped', reason: `budget: ${apiCalls}/${maxCalls}` });
        continue;
      }

      const imagePath = path.join(imageDir, doc.file);
      const buffer = fs.readFileSync(imagePath);
      const before = apiCalls;
      const t0 = Date.now();

      const ctx = ctxFor(config);
      const raw = await aiService.getCapsuleProposalInfoFromImage(ctx, buffer, 'image/jpeg');
      const payload = parseAiPayload(raw, doc.file);

      rows.push({
        file: doc.file,
        writer: doc.writer,
        status: 'ok',
        imageSha256: sha256(buffer),
        imageBytes: buffer.length,
        transcription: payload.raw_transcription ?? '',
        fields: Object.fromEntries(FIELDS.map((f) => [f, payload[f] ?? ''])),
        apiCalls: apiCalls - before,
        latencyMs: Date.now() - t0,
        tokens: { ...ctx.tokens },
      });
      console.log(`  ${doc.file.padEnd(18)} ${rows[rows.length - 1].transcription.length} chars`);
    }
  } finally {
    models.generateContent = impl;
  }

  return { rows, apiCalls };
}

// --------------------------------------------------------------------------
// Stage 1 — threshold calibration
// --------------------------------------------------------------------------

/**
 * Pre-registered floors. Below these the mechanism has not separated the
 * classes and NO new threshold ships — the finding is the negative.
 */
const MIN_SPECIFICITY = 0.8;
const MIN_SENSITIVITY = 0.5;

/** Every (document, field) observation with its label and production score. */
function observations(rows, supportRatio) {
  const out = [];
  for (const row of rows) {
    if (row.status !== 'ok') continue;
    const doc = DOCUMENTS.find((d) => d.file === row.file);
    for (const field of FIELDS) {
      const ratio = supportRatio(row.fields[field], row.transcription);
      // null means the field had no content words — an absent observation, not
      // a zero. Dropping it is the same rule field-confidence.ts applies.
      if (ratio === null) continue;
      out.push({
        file: row.file,
        writer: row.writer,
        field,
        grounded: doc.fields[field],
        ratio,
      });
    }
  }
  return out;
}

function scoreThreshold(obs, threshold) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const o of obs) {
    const verified = o.ratio >= threshold;
    if (o.grounded && verified) tp += 1;
    else if (o.grounded && !verified) fn += 1;
    else if (!o.grounded && verified) fp += 1;
    else tn += 1;
  }
  const sensitivity = tp + fn === 0 ? null : tp / (tp + fn);
  const specificity = tn + fp === 0 ? null : tn / (tn + fp);
  const youdenJ =
    sensitivity === null || specificity === null ? null : sensitivity + specificity - 1;
  return { threshold, tp, fp, tn, fn, sensitivity, specificity, youdenJ };
}

/**
 * Sweeps every threshold that can change a verdict — the observed ratios
 * themselves, plus 0 and 1 — and applies the pre-registered rule: maximise
 * Youden's J, ties break TOWARD THE HIGHER threshold.
 *
 * The tie-break is not arbitrary. A false `verified` puts a green badge on
 * invented content and tells a Manager to trust it; a false `low` only
 * withholds a claim. The errors are not symmetric, so the conservative end wins.
 */
function sweep(obs) {
  const candidates = [...new Set([0, 1, ...obs.map((o) => o.ratio)])].sort((a, b) => a - b);
  const scored = candidates.map((t) => scoreThreshold(obs, t));

  let best = null;
  for (const s of scored) {
    if (s.youdenJ === null) continue;
    if (!best || s.youdenJ > best.youdenJ || (s.youdenJ === best.youdenJ && s.threshold > best.threshold)) {
      best = s;
    }
  }

  const passes =
    best !== null &&
    best.specificity !== null &&
    best.sensitivity !== null &&
    best.specificity >= MIN_SPECIFICITY &&
    best.sensitivity >= MIN_SENSITIVITY;

  return { scored, best, passes };
}

// --------------------------------------------------------------------------
// Stage 2 — CER
// --------------------------------------------------------------------------

function scoreSpans(rows, spans, selected) {
  const out = [];
  for (const sel of selected) {
    const row = rows.find((r) => r.file === sel.file && r.status === 'ok');
    const reference = spans[sel.file];

    if (!reference) {
      out.push({ ...sel, status: 'missing-reference' });
      continue;
    }
    if (!row) {
      out.push({ ...sel, status: 'missing-run-row' });
      continue;
    }

    const scored = characterErrorRate(reference, row.transcription);
    out.push({
      ...sel,
      status: 'ok',
      refLength: scored.refLength,
      distance: scored.distance,
      cer: scored.cer,
    });
  }
  return out;
}

function pooledCer(scored) {
  const ok = scored.filter((s) => s.status === 'ok');
  if (ok.length === 0) return null;
  // Character-weighted, not the mean of rates: a 20-character span must not
  // carry the same weight as a 400-character one.
  const distance = ok.reduce((a, s) => a + s.distance, 0);
  const chars = ok.reduce((a, s) => a + s.refLength, 0);
  return { n: ok.length, distance, chars, cer: distance / chars };
}

// --------------------------------------------------------------------------
// Reporting
// --------------------------------------------------------------------------

function pct(x) {
  return x === null || x === undefined ? '  n/a' : `${(x * 100).toFixed(1)}%`;
}

function report(rows, spans) {
  const { supportRatio, SUPPORT_THRESHOLD } = loadBackend();
  const selected = selectSpans(DOCUMENTS, SEED);

  console.log('\n=== Stage 1 — SUPPORT_THRESHOLD calibration ===\n');
  const obs = observations(rows, supportRatio);
  const grounded = obs.filter((o) => o.grounded).length;
  console.log(`  observations: ${obs.length} (${grounded} grounded, ${obs.length - grounded} invented)`);

  const pooled = sweep(obs);
  const shipped = scoreThreshold(obs, SUPPORT_THRESHOLD);

  console.log(`\n  shipped threshold ${SUPPORT_THRESHOLD}:`);
  console.log(
    `    sens ${pct(shipped.sensitivity)}  spec ${pct(shipped.specificity)}  J ${shipped.youdenJ?.toFixed(3) ?? 'n/a'}`,
  );

  if (pooled.best) {
    console.log(`\n  best by Youden's J: ${pooled.best.threshold.toFixed(4)}`);
    console.log(
      `    sens ${pct(pooled.best.sensitivity)}  spec ${pct(pooled.best.specificity)}  J ${pooled.best.youdenJ.toFixed(3)}`,
    );
    console.log(
      `    tp ${pooled.best.tp}  fp ${pooled.best.fp}  tn ${pooled.best.tn}  fn ${pooled.best.fn}`,
    );
  }
  console.log(
    `\n  PRE-REGISTERED GATE (spec >= ${MIN_SPECIFICITY}, sens >= ${MIN_SENSITIVITY}): ${pooled.passes ? 'PASS' : 'FAIL — no new threshold ships'}`,
  );

  // The confound check. scope and methodology are the only fields whose label
  // varies while the field is held constant, so this is the read that is not
  // partly a between-field comparison.
  const confoundFree = obs.filter((o) => o.field === 'scope' || o.field === 'methodology');
  const cf = sweep(confoundFree);
  const cfGrounded = confoundFree.filter((o) => o.grounded).length;
  console.log(`\n  --- confound-free (scope + methodology only) ---`);
  console.log(`  observations: ${confoundFree.length} (${cfGrounded} grounded, ${confoundFree.length - cfGrounded} invented)`);
  if (cf.best) {
    console.log(
      `  best J ${cf.best.youdenJ.toFixed(3)} at ${cf.best.threshold.toFixed(4)}  sens ${pct(cf.best.sensitivity)}  spec ${pct(cf.best.specificity)}`,
    );
  }
  console.log('  ⚠ underpowered. If pooled is strong and this is at chance, POOLED IS THE ARTIFACT.');

  console.log('\n=== Stage 2 — CER on sampled spans ===\n');
  const scored = scoreSpans(rows, spans, selected);
  for (const s of scored) {
    const label = `${s.writer}  ${s.file.padEnd(18)} ${s.section}`;
    if (s.status !== 'ok') {
      console.log(`  ${label}  [${s.status}]`);
      continue;
    }
    console.log(`  ${label.padEnd(58)} CER ${pct(s.cer)}  (${s.distance}/${s.refLength})`);
  }

  for (const writer of ['A', 'B']) {
    const p = pooledCer(scored.filter((s) => s.writer === writer));
    if (p) console.log(`\n  writer ${writer}: CER ${pct(p.cer)}  (${p.distance}/${p.chars} chars, n=${p.n})`);
  }
  const all = pooledCer(scored);
  if (all) console.log(`  POOLED:   CER ${pct(all.cer)}  (${all.distance}/${all.chars} chars, n=${all.n})`);

  const missing = scored.filter((s) => s.status === 'missing-reference');
  if (missing.length) {
    console.log(`\n  ⚠ ${missing.length} span(s) not yet typed — CER above is partial:`);
    for (const m of missing) console.log(`      ${m.file} ${m.section}`);
  }

  return { stage1: { obs, pooled, shipped, confoundFree: cf }, stage2: { scored, pooled: all } };
}

// --------------------------------------------------------------------------
// Gates
// --------------------------------------------------------------------------

function gates({ imageDir }) {
  const failures = [];

  if (DOCUMENTS.length !== 10) failures.push(`expected 10 documents, got ${DOCUMENTS.length}`);

  const byWriter = DOCUMENTS.reduce((a, d) => ({ ...a, [d.writer]: (a[d.writer] ?? 0) + 1 }), {});
  if (byWriter.A !== 5 || byWriter.B !== 5) {
    failures.push(`expected 5 pages per writer, got ${JSON.stringify(byWriter)}`);
  }

  for (const doc of DOCUMENTS) {
    const p = path.join(imageDir, doc.file);
    if (!fs.existsSync(p)) failures.push(`image missing: ${p}`);
    const keys = Object.keys(doc.fields).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...FIELDS].sort())) {
      failures.push(`${doc.file}: field labels do not match the eight fields`);
    }
  }

  const selected = selectSpans(DOCUMENTS, SEED);
  if (selected.length !== 10) failures.push(`span selection returned ${selected.length}, expected 10`);
  for (const s of selected) {
    const doc = DOCUMENTS.find((d) => d.file === s.file);
    if (!doc || doc.sections[s.sectionIndex] !== s.section) {
      failures.push(`${s.file}: selected span is not a section of that document`);
    }
  }

  // The template must name exactly the drawn spans — otherwise a human types a
  // section the scorer will not look for.
  if (fs.existsSync(SPANS_FILE)) {
    const md = fs.readFileSync(SPANS_FILE, 'utf8');
    for (const s of selected) {
      if (!md.includes(`## ${s.file}`)) failures.push(`template is missing a block for ${s.file}`);
      else if (!md.includes(`\`${s.section}\``)) {
        failures.push(`template names a different section for ${s.file} than the seed drew`);
      }
    }
  } else {
    failures.push(`reference template missing: ${SPANS_FILE}`);
  }

  return failures;
}

// --------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------

/** A payload shaped exactly like the real one, so --dry-run exercises parsing. */
function stubResponse() {
  return {
    text: JSON.stringify({
      title: 'Stub Project: a dry-run placeholder title',
      startup_description: 'A stub startup description of at least forty characters.',
      problem_statement: 'A stub problem statement of at least forty characters.',
      target_market: 'A stub target market of at least forty characters here.',
      solution_description: 'A stub solution description of at least forty chars.',
      objectives: 'Stub objectives spanning at least forty characters total.',
      scope: 'A stub scope of at least forty characters in length here.',
      methodology: 'A stub methodology of at least forty characters here.',
      raw_transcription: 'Stub transcription. Not scored — --dry-run writes no result file.',
    }),
    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const imageDir = process.env.OCR_IMAGE_DIR || DEFAULT_IMAGE_DIR;

  const mode = has('--run') ? 'run' : has('--score') ? 'score' : 'dry-run';

  console.log(`\nOCR accuracy — objective 3a  [${mode}]`);
  console.log(`  images: ${imageDir}`);
  console.log(`  seed:   ${SEED}`);

  const failures = gates({ imageDir });
  console.log(`\n  gates: ${failures.length === 0 ? 'pass' : `FAIL (${failures.length})`}`);
  for (const f of failures) console.log(`    ✗ ${f}`);
  if (failures.length) process.exit(1);

  const spans = loadReferenceSpans();
  console.log(`  reference spans typed: ${Object.keys(spans).length}/10`);
  if (CONTESTED.length) {
    console.log(`  contested labels (adjudicated, see the design): ${CONTESTED.length}`);
  }

  if (mode === 'score') {
    if (!fs.existsSync(RUN_FILE)) {
      console.error(`\nNo stored run at ${RUN_FILE}. Run with --run first.`);
      process.exit(1);
    }
    const stored = JSON.parse(fs.readFileSync(RUN_FILE, 'utf8'));
    report(stored.rows, spans);
    return;
  }

  const b = loadBackend();
  const app = await b.NestFactory.createApplicationContext(b.AppModule, { logger: ['error', 'warn'] });
  try {
    const aiService = app.get(b.AiService);
    const config = app.get(b.AiConfigService).resolve();

    if (mode === 'dry-run') {
      console.log('\n  --- rehearsal: zero network calls ---');
      const { rows, apiCalls } = await runExtractions(aiService, config, {
        imageDir,
        generate: async () => stubResponse(),
      });
      console.log(`\n  stub calls: ${apiCalls} (no network)`);
      console.log(`  rows built: ${rows.filter((r) => r.status === 'ok').length}/10`);
      console.log('\n  Plan if run live:');
      for (const s of selectSpans(DOCUMENTS, SEED)) {
        console.log(`    ${s.writer}  ${s.file.padEnd(18)} ${s.section}`);
      }
      console.log(`\n  Would spend ${MAX_CALLS} generation calls.`);
      return;
    }

    console.log(`\n  --- LIVE: spending up to ${MAX_CALLS} generation calls ---\n`);
    const started = new Date().toISOString();
    const { rows, apiCalls } = await runExtractions(aiService, config, { imageDir });

    fs.mkdirSync(RESULTS, { recursive: true });
    fs.writeFileSync(
      RUN_FILE,
      JSON.stringify(
        { started, finished: new Date().toISOString(), seed: SEED, config, apiCalls, rows },
        null,
        2,
      ),
    );
    console.log(`\n  ${apiCalls} calls spent. Stored: ${path.relative(BACKEND, RUN_FILE)}`);
    console.log('  Transcriptions are NOT printed — the reference spans must be typed blind.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  parseReferenceSpans,
  observations,
  scoreThreshold,
  sweep,
  scoreSpans,
  pooledCer,
  parseAiPayload,
  gates,
  SEED,
  MIN_SPECIFICITY,
  MIN_SENSITIVITY,
};
