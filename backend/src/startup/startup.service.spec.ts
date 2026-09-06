import { StartupService } from './startup.service';
import { Startup } from 'src/entities/startup.entity';
import { StartupApplicationDto } from './dto';
import { AiRunContext } from '../ai/ai-run.service';
import { StartupAnalysisSummary } from '../ai/ai.service';
import { OcrDocument } from 'src/entities/ocr-document.entity';
import { ActivityLog } from 'src/entities/activity-log.entity';
import { QualificationStatus } from 'src/entities/enums/qualification-status.enum';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';

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

// A summary the shipped rule flags: praise with no critical observation.
const LENIENT =
  'The venture demonstrates strong market viability. The team is impressive and execution has been excellent.';
// Balanced by the same rule: 4 critical clauses to 1 positive is ratio 0.8,
// clear of the 0.75 threshold. An earlier fixture read 2 critical to 1 positive
// (0.667) and was flagged — the rule counts clauses, not severity.
const BALANCED =
  'Revenue is unproven. Regulatory approval is absent. The team lacks a technical lead. Market validation is insufficient. The founders are impressive.';

/**
 * Builder for the approval gate. `em.find` feeds attachSummaryVerdicts, which
 * approveApplicant reuses so the gate and the Manager's badge cannot disagree.
 */
function buildForApproval(summary: string, recordedRows: unknown[] = []) {
  const startup: any = { id: 42, qualificationStatus: QualificationStatus.PENDING, capsuleProposal: { aiAnalysisSummary: summary } };
  const logs: any[] = [];
  const em = {
    findOne: jest.fn().mockResolvedValue(startup),
    find: jest.fn().mockResolvedValue(recordedRows),
    create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
      if (entity === ActivityLog) logs.push(data);
      return data;
    }),
    flush: jest.fn().mockResolvedValue(undefined),
  };
  const service = new StartupService(em as any, {} as any, {} as any, {} as any);
  return { service, startup, logs, em };
}

describe('StartupService.approveApplicant — SO 4.4 acknowledgement gate', () => {
  it('refuses to approve a flagged summary without an acknowledgement', async () => {
    const { service, startup, logs } = buildForApproval(LENIENT);

    await expect(service.approveApplicant(42)).rejects.toThrow(ConflictException);

    // The refusal has to be the whole outcome: a status written before the
    // throw would qualify the startup anyway.
    expect(startup.qualificationStatus).toBe(QualificationStatus.PENDING);
    expect(logs).toHaveLength(0);
  });

  it('approves a flagged summary once acknowledged, and records who did it', async () => {
    const { service, startup, logs } = buildForApproval(LENIENT);

    await service.approveApplicant(42, {
      acknowledged: true,
      actor: 'manager@launchup.local'
    });

    expect(startup.qualificationStatus).toBe(QualificationStatus.QUALIFIED);
    expect(logs).toHaveLength(1);
    expect(logs[0].actor).toBe('manager@launchup.local');
    expect(logs[0].details).toContain('42');
  });

  it('approves a balanced summary with no acknowledgement and logs nothing', async () => {
    const { service, startup, logs } = buildForApproval(BALANCED);

    await service.approveApplicant(42);

    expect(startup.qualificationStatus).toBe(QualificationStatus.QUALIFIED);
    // The log means "approved against a warning". Logging every approval would
    // dilute it into an access log.
    expect(logs).toHaveLength(0);
  });

  // The one defect in this feature that no mock could catch, pinned at the only
  // level a mock can reach. findOne without this populate loads capsuleProposal
  // as an id-only reference, so aiAnalysisSummary reads undefined and the gate
  // never fires — it shipped past all four tests above and was caught by a live
  // request. The real proof is that probe; this asserts the query keeps asking
  // for the column the gate depends on.
  it('loads the capsule proposal, without which the gate cannot see a summary', async () => {
    const { service, em } = buildForApproval(LENIENT);

    await service.approveApplicant(42, { acknowledged: true });

    expect(em.findOne).toHaveBeenCalledWith(
      expect.anything(),
      { id: 42 },
      expect.objectContaining({ populate: expect.arrayContaining(['capsuleProposal']) }),
    );
  });

  it('gates on the recorded verdict, not a fresh reading, when a row exists', async () => {
    // Balanced text, but the run that generated it recorded a flag. The badge
    // shows the recorded verdict, so the gate must too.
    const { service, startup } = buildForApproval(BALANCED, [
      { startup: { id: 42 }, confidenceStatus: 'positive-language-flagged', createdAt: new Date('2026-01-01'), generationRun: { id: 9 } }
    ]);

    await expect(service.approveApplicant(42)).rejects.toThrow(ConflictException);
    expect(startup.qualificationStatus).toBe(QualificationStatus.PENDING);
  });
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
    flush: jest.fn().mockResolvedValue(undefined),
    assign: jest.fn((row: Record<string, unknown>, data: Record<string, unknown>) =>
      Object.assign(row, data),
    ),
    findOne: jest.fn(async (entity: unknown, where: { contentHash?: string }) => {
      if (entity !== OcrDocument) return null;
      return ocrDocs.find((doc) => doc.contentHash === where?.contentHash) ?? null;
    }),
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

/**
 * Every parse used to insert an OcrDocument unconditionally, so a founder
 * retrying the same scan left a new orphan row behind each time.
 */
describe('StartupService.parseCapsuleProposal — duplicate uploads', () => {
  it('records a content hash of the uploaded bytes', async () => {
    const { service, ocrDocs } = buildOcr({ tesseractText: 'noise', visionJson: VISION_JSON });

    await service.parseCapsuleProposal(imageFile, ctx);

    expect(ocrDocs[0].contentHash).toBe(
      createHash('sha256').update(imageFile.buffer).digest('hex'),
    );
  });

  it('reuses the existing row when the same file is uploaded again', async () => {
    const { service, ocrDocs } = buildOcr({ tesseractText: 'noise', visionJson: VISION_JSON });

    await service.parseCapsuleProposal(imageFile, ctx);
    await service.parseCapsuleProposal(imageFile, ctx);

    expect(ocrDocs).toHaveLength(1);
  });

  it('keeps a separate row for a different file', async () => {
    const { service, ocrDocs } = buildOcr({ tesseractText: 'noise', visionJson: VISION_JSON });
    const otherFile = { ...imageFile, buffer: Buffer.from('a-different-image') };

    await service.parseCapsuleProposal(imageFile, ctx);
    await service.parseCapsuleProposal(otherFile, ctx);

    expect(ocrDocs).toHaveLength(2);
  });

  it('refreshes the stored transcription on a re-upload', async () => {
    const { service, ocrDocs } = buildOcr({ tesseractText: 'noise', visionJson: VISION_JSON });

    await service.parseCapsuleProposal(imageFile, ctx);
    ocrDocs[0].extractedText = 'stale';
    await service.parseCapsuleProposal(imageFile, ctx);

    expect(ocrDocs[0].extractedText).toBe(
      'AgriTrace: An IoT-Enabled Cold Chain Monitoring System',
    );
  });
});
