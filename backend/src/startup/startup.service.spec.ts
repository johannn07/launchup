import { StartupService } from './startup.service';
import { Startup } from 'src/entities/startup.entity';
import { StartupApplicationDto } from './dto';
import { AiRunContext } from '../ai/ai-run.service';
import { StartupAnalysisSummary } from '../ai/ai.service';
import { OcrDocument } from 'src/entities/ocr-document.entity';

/**
 * First spec for src/startup/. Scoped to the summary path only — the service is
 * ~1400 lines and broad coverage is a different task. This path had none, which
 * is why widening generateStartupAnalysisSummary's return type to an object was
 * invisible to `pnpm test`.
 */

const dto: StartupApplicationDto = {
  title: 'AgroLink PH',
  description: 'd',
  problemStatement: 'p',
  targetMarket: 'm',
  solutionDescription: 's',
  historicalTimeline: [],
  competitiveAdvantageAnalysis: [],
  objectives: [],
  members: [],
};

const ctx = {
  runId: 77,
  run: { id: 77 },
  tokens: { promptTokens: 0, completionTokens: 0, recorded: false },
  config: Object.freeze({ model: 'gemini-2.5-flash-lite', temperature: 0 }),
} as unknown as AiRunContext;

function build(analysis: StartupAnalysisSummary) {
  // Created capsule proposals, in creation order. Nothing outside the
  // em.transactional callback can push here, so a non-empty array is proof the
  // callback actually ran — a `transactional: jest.fn()` double that never
  // invokes its argument passes every assertion about the mocks otherwise.
  const proposals: any[] = [];

  const startup: any = {
    id: 42,
    members: { add: jest.fn() },
    capsuleProposal: undefined,
  };

  const em = {
    transactional: jest.fn((cb: (em: unknown) => unknown) => cb(em)),
    findOne: jest.fn().mockResolvedValue({ id: 7 }),
    create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
      if (entity === Startup) return Object.assign(startup, data);
      const proposal = { ...data };
      proposals.push(proposal);
      return proposal;
    }),
    persistAndFlush: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };

  const aiService = {
    generateStartupAnalysisSummary: jest.fn().mockResolvedValue(analysis),
    recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
    recordRagContext: jest.fn().mockResolvedValue(undefined),
  };

  const aiRunService = { attribute: jest.fn().mockResolvedValue(undefined) };

  const service = new StartupService(
    em as any,
    aiService as any,
    aiRunService as any,
    {} as any, // OcrService — the summary path never reaches it
  );

  return { service, em, aiService, proposals };
}

const notesOf = (aiService: { recordAiRecommendation: jest.Mock }) =>
  JSON.parse(aiService.recordAiRecommendation.mock.calls[0][0].notes);

/** Bare service with a stubbed `em.find`, for the read paths. */
function buildWithRows(rows: unknown[]) {
  const em = { find: jest.fn().mockResolvedValue(rows) };
  const service = new StartupService(em as any, {} as any, {} as any, {} as any);
  return { service, em };
}

const withSummary = (id: number, aiAnalysisSummary?: string) => ({
  id,
  capsuleProposal: aiAnalysisSummary === undefined ? undefined : { aiAnalysisSummary },
});

describe('StartupService.attachSummaryVerdicts', () => {
  it('recomputes when no row exists, which is every seeded proposal', async () => {
    const { service } = buildWithRows([]);
    const startups: any[] = [
      withSummary(1, 'The venture demonstrates strong market viability. The team is impressive. One risk: revenue is unproven.'),
    ];

    await service.attachSummaryVerdicts(startups);

    expect(startups[0].summaryVerdict).toMatchObject({
      status: 'positive-language-flagged',
      source: 'recomputed',
    });
  });

  it('prefers a recorded row over a fresh reading', async () => {
    const { service } = buildWithRows([
      { startup: { id: 1 }, confidenceStatus: 'balanced', createdAt: new Date('2026-01-01'), generationRun: { id: 5 } },
    ]);
    const startups: any[] = [withSummary(1, 'Strong team. Excellent traction. One risk: no revenue.')];

    await service.attachSummaryVerdicts(startups);

    expect(startups[0].summaryVerdict).toMatchObject({ status: 'balanced', source: 'recorded', runId: 5 });
  });

  // A proposal regenerated after a rejection writes a second row. Showing an
  // older verdict beside newer text is worse than recomputing.
  it('takes the newest row when a startup has several', async () => {
    const { service } = buildWithRows([
      { startup: { id: 1 }, confidenceStatus: 'balanced', createdAt: new Date('2026-01-01'), generationRun: { id: 1 } },
      { startup: { id: 1 }, confidenceStatus: 'positive-language-flagged', createdAt: new Date('2026-06-01'), generationRun: { id: 9 } },
    ]);
    const startups: any[] = [withSummary(1, 'Some summary text.')];

    await service.attachSummaryVerdicts(startups);

    expect(startups[0].summaryVerdict).toMatchObject({ status: 'positive-language-flagged', runId: 9 });
  });

  it('leaves a startup with no summary untouched', async () => {
    const { service } = buildWithRows([]);
    const startups: any[] = [withSummary(1), { id: 2, capsuleProposal: { aiAnalysisSummary: null } }];

    await service.attachSummaryVerdicts(startups);

    expect(startups[0].summaryVerdict).toBeUndefined();
    expect(startups[1].summaryVerdict).toBeUndefined();
  });

  // The Manager list is every startup in the system. An N+1 here passes every
  // behavioural assertion above while issuing a query per row.
  it('issues one query regardless of how many startups it is given', async () => {
    const { service, em } = buildWithRows([]);
    const startups: any[] = Array.from({ length: 25 }, (_, i) => withSummary(i + 1, 'Demand is unvalidated.'));

    await service.attachSummaryVerdicts(startups);

    expect(em.find).toHaveBeenCalledTimes(1);
    expect(startups.every((s) => s.summaryVerdict.status === 'balanced')).toBe(true);
  });

  it('does not query at all when no startup has a summary', async () => {
    const { service, em } = buildWithRows([]);

    await service.attachSummaryVerdicts([withSummary(1) as any]);

    expect(em.find).not.toHaveBeenCalled();
  });
});

describe('StartupService analysis summary persistence', () => {
  it('stores only the summary text on the proposal', async () => {
    const { service, aiService, proposals } = build({
      summary: 'S.',
      unmetCriteria: [{ criterion: 'c', proposalField: 'f', whyUnmet: 'w' }],
      criticalRisks: [],
      source: 'schema',
    });

    await service.create(dto, 7, ctx);

    expect(proposals).toHaveLength(1);
    // The whole return object in a text column reaches Postgres as
    // "[object Object]" and the Manager reads that.
    expect(proposals[0].aiAnalysisSummary).toBe('S.');
    expect(aiService.generateStartupAnalysisSummary).toHaveBeenCalledTimes(1);
  });

  it('records the criteria and the tone verdict as an ai_recommendation', async () => {
    // Verified against the real analyzeTone: positiveCount 1, criticalCount 0.
    const summary = 'The venture shows strong potential.';
    const { service, aiService, proposals } = build({
      summary,
      unmetCriteria: [{ criterion: 'No revenue evidence', proposalField: 'historicalTimeline', whyUnmet: 'no figure given' }],
      criticalRisks: [{ risk: 'Buyer demand unvalidated', severity: 'high' }],
      source: 'legacy',
    });

    await service.create(dto, 7, ctx);

    expect(proposals).toHaveLength(1);
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        startupId: 42,
        dimensionKey: 'overall',
        recommendationKind: 'analysis_summary',
        content: summary,
        confidenceStatus: 'positive-language-flagged',
        generationRun: ctx.run,
      }),
    );

    const notes = notesOf(aiService);
    expect(notes.unmetCriteria[0].proposalField).toBe('historicalTimeline');
    expect(notes.criticalRisks[0].severity).toBe('high');
    expect(notes.tone).toEqual({ positiveCount: 1, criticalCount: 0, ratio: 0 });
    // Task 7 reads this as a validity gate: a degraded run used the baseline
    // arm's prompt, so without it the row looks like a genuine adversarial one.
    expect(notes.source).toBe('legacy');
  });

  it('does not flag a summary carrying a critical observation', async () => {
    // Verified against the real analyzeTone: criticalCount 1, so flagged false.
    const { service, aiService, proposals } = build({
      summary: 'Strong team, but buyer demand is unvalidated and there is no revenue.',
      unmetCriteria: [],
      criticalRisks: [],
      source: 'schema',
    });

    await service.create(dto, 7, ctx);

    expect(proposals).toHaveLength(1);
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ confidenceStatus: 'balanced' }),
    );
    expect(notesOf(aiService).tone.criticalCount).toBe(1);
  });
});

/**
 * Objective 3a. `parseCapsuleProposal` computes two transcriptions — Tesseract's
 * and Gemini Vision's `raw_transcription` — and stores one of them on the
 * OcrDocument. Which one it stores is the thing under test.
 */
function buildOcr(opts: { tesseractText: string; visionJson: string; visionError?: string }) {
  const ocrDocs: any[] = [];
  const sketchInputs: string[] = [];

  const em = {
    create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
      const row = { ...data };
      if (entity === OcrDocument) ocrDocs.push(row);
      return row;
    }),
    persistAndFlush: jest.fn().mockResolvedValue(undefined),
  };

  const ocrService = {
    checkLegibility: jest
      .fn()
      .mockResolvedValue({ isLegible: true, reason: null, width: 1600, height: 1200 }),
    parseBuffer: jest.fn().mockResolvedValue({ text: opts.tesseractText, avgConfidence: 42 }),
    detectSketch: jest.fn((text: string) => {
      sketchInputs.push(text);
      return { sketchDetected: false, sketchConfidence: 0 };
    }),
    detectWithVision: jest.fn().mockResolvedValue({ labels: [] }),
  };

  const aiService = {
    getCapsuleProposalInfoFromImage: opts.visionError
      ? jest.fn().mockRejectedValue(new Error(opts.visionError))
      : jest.fn().mockResolvedValue(opts.visionJson),
    getCapsuleProposalInfo: jest.fn().mockResolvedValue(opts.visionJson),
  };

  const service = new StartupService(em as any, aiService as any, {} as any, ocrService as any);
  return { service, ocrDocs, sketchInputs };
}

const imageFile = {
  mimetype: 'image/jpeg',
  originalname: 'proposal.jpg',
  buffer: Buffer.from('not-a-real-jpeg'),
} as any;

const VISION_JSON = JSON.stringify({
  title: 'AgriTrace',
  startup_description: 'x'.repeat(60),
  problem_statement: 'x'.repeat(60),
  target_market: 'x'.repeat(60),
  solution_description: 'x'.repeat(60),
  objectives: 'x'.repeat(60),
  scope: 'x'.repeat(60),
  methodology: 'x'.repeat(60),
  raw_transcription: 'AgriTrace: An IoT-Enabled Cold Chain Monitoring System',
});

describe('StartupService.parseCapsuleProposal — which transcription is stored', () => {
  it("stores Gemini's transcription even when Tesseract also returned text", async () => {
    const { service, ocrDocs } = buildOcr({
      tesseractText: 'Agr1Tr4ce l0T-Enab|ed C0|d Cha1n M0n1t0r1ng',
      visionJson: VISION_JSON,
    });

    await service.parseCapsuleProposal(imageFile, ctx);

    expect(ocrDocs[0].extractedText).toBe(
      'AgriTrace: An IoT-Enabled Cold Chain Monitoring System',
    );
  });

  it('never stores the OCR placeholder string as extracted text', async () => {
    const { service, ocrDocs } = buildOcr({
      tesseractText: 'OCR_PLACEHOLDER: parsed proposal.jpg - integrate real OCR engine',
      visionJson: VISION_JSON,
    });

    await service.parseCapsuleProposal(imageFile, ctx);

    expect(ocrDocs[0].extractedText).not.toMatch(/OCR_PLACEHOLDER/);
  });

  // Green before the fix, by design: it pins the behaviour the fix must not
  // break. detectSketch's weights are tuned to Tesseract's output, so feeding it
  // Gemini's clean prose would silently stop sketches from ever being detected.
  it('still scores sketch detection on Tesseract output, not the clean transcription', async () => {
    const tesseractText = '~~~ /\/ ||| ->';
    const { service, sketchInputs } = buildOcr({ tesseractText, visionJson: VISION_JSON });

    await service.parseCapsuleProposal(imageFile, ctx);

    expect(sketchInputs).toEqual([tesseractText]);
  });
});

describe('StartupService.parseCapsuleProposal — field confidence', () => {
  // The old rule was `text.length < 40`, so a short honest title scored `low`
  // and 60 characters of invention scored `verified`. Both are backwards.
  it('labels by support from the page, not by length', async () => {
    const { service } = buildOcr({ tesseractText: 'noise', visionJson: VISION_JSON });

    const result: any = await service.parseCapsuleProposal(imageFile, ctx);

    expect(result.fieldConfidence.title).toBe('verified');
    expect(result.fieldConfidence.scope).toBe('low');
  });
});

describe('StartupService.parseCapsuleProposal — when Gemini Vision is unavailable', () => {
  const BUSY =
    'got status: 503 Service Unavailable. {"error":{"code":503,"status":"UNAVAILABLE"}}';
  const QUOTA = 'got status: 429 Too Many Requests. {"error":{"status":"RESOURCE_EXHAUSTED"}}';

  // Observed live 2026-08-22: a 503 was swallowed, Tesseract produced garbage,
  // a second call extracted fields FROM that garbage, and two of them rendered
  // as green "Verified" badges. Degrading silently is worse than failing.
  it('fails loudly on a 503 rather than storing Tesseract garbage', async () => {
    const { service, ocrDocs } = buildOcr({
      tesseractText: "_h'». PA0E il eo RL Genernl wforvakon",
      visionJson: VISION_JSON,
      visionError: BUSY,
    });

    await expect(service.parseCapsuleProposal(imageFile, ctx)).rejects.toThrow(
      /busy|unavailable/i,
    );
    expect(ocrDocs).toHaveLength(0);
  });

  it('fails loudly on a quota error too', async () => {
    const { service } = buildOcr({
      tesseractText: 'noise',
      visionJson: VISION_JSON,
      visionError: QUOTA,
    });

    await expect(service.parseCapsuleProposal(imageFile, ctx)).rejects.toThrow();
  });

  it('still falls back to Tesseract for a non-service failure', async () => {
    const { service, ocrDocs } = buildOcr({
      tesseractText: 'legible typed text about a startup',
      visionJson: VISION_JSON,
      visionError: 'Unexpected token < in JSON at position 0',
    });

    await service.parseCapsuleProposal(imageFile, ctx);

    // The fallback survives, but nothing it produces may claim `verified` —
    // the fields are extracted from the same text they are scored against.
    expect(ocrDocs).toHaveLength(1);
    expect(Object.values(ocrDocs[0].fieldConfidence)).not.toContain(1);
  });
});
