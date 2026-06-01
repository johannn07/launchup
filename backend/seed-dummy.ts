import { MikroORM } from '@mikro-orm/core';
import config from './src/mikro-orm.config';
import { TierConfig } from './src/entities/tier-config.entity';
import { OcrDocument } from './src/entities/ocr-document.entity';
import { AiBiasAudit } from './src/entities/ai-bias-audit.entity';

async function seed() {
  const orm = await MikroORM.init(config as any);
  const em = orm.em.fork();

  // Dynamic Tiers
  em.create(TierConfig, {
    tierLabel: 'Bronze',
    threshold: 30,
    weights: { team: 0.2, market: 0.2, product: 0.6 },
    createdAt: new Date(),
    updatedAt: new Date()
  });
  em.create(TierConfig, {
    tierLabel: 'Silver',
    threshold: 60,
    weights: { team: 0.3, market: 0.3, product: 0.4 },
    createdAt: new Date(),
    updatedAt: new Date()
  });
  em.create(TierConfig, {
    tierLabel: 'Gold',
    threshold: 85,
    weights: { team: 0.4, market: 0.4, product: 0.2 },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // OCR Documents
  em.create(OcrDocument, {
    originalFilename: 'business_plan_scan.pdf',
    extractedText: 'We aim to revolutionize the AI space with our new proprietary algorithm. The target market is huge...',
    fieldConfidence: { text: 0.95 },
    processingStatus: 'processed',
    legibilityStatus: 'readable',
    sourcePath: 'https://example.com/business_plan_scan.pdf',
    sketchDetected: false,
    sketchConfidence: 0.1,
    imageWidth: 800,
    imageHeight: 1200,
    createdAt: new Date()
  });
  em.create(OcrDocument, {
    originalFilename: 'napkin_idea.jpg',
    extractedText: 'Idea: an app for dogs to socialize. revenue model: ads.',
    fieldConfidence: { text: 0.45 },
    processingStatus: 'processed',
    legibilityStatus: 'unreadable',
    sourcePath: 'https://example.com/napkin_idea.jpg',
    sketchDetected: true,
    sketchConfidence: 0.98,
    imageWidth: 400,
    imageHeight: 400,
    createdAt: new Date()
  });

  // AI Bias Audits
  em.create(AiBiasAudit, {
    dimensionKey: 'gender_bias',
    rawScore: 0.8,
    correctedScore: 0.95,
    deviation: 0.15,
    threshold: 0.1,
    biasFlagged: true,
    biasStatus: 'normalized',
    justification: 'The model exhibited slight preference for male pronouns in the technical assessment. Normalized by applying parity weights.',
    createdAt: new Date()
  });
  em.create(AiBiasAudit, {
    dimensionKey: 'geographic_bias',
    rawScore: 0.9,
    correctedScore: 0.9,
    deviation: 0.0,
    threshold: 0.15,
    biasFlagged: false,
    biasStatus: 'passed',
    justification: 'No significant geographic bias detected in market viability evaluation.',
    createdAt: new Date()
  });
  em.create(AiBiasAudit, {
    dimensionKey: 'language_complexity',
    rawScore: 0.65,
    correctedScore: 0.85,
    deviation: 0.2,
    threshold: 0.1,
    biasFlagged: true,
    biasStatus: 'normalized',
    justification: 'The evaluation penalized non-native English phrasing. Adjusted score to focus purely on the underlying idea merit.',
    createdAt: new Date()
  });

  await em.flush();
  console.log('Dummy data inserted successfully!');
  await orm.close(true);
}

seed().catch(console.error);
