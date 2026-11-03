import { Injectable } from '@nestjs/common';
import { FactCheckInput, checkRecommendationFacts } from './recommendation-facts';

// unverifiable: contradicts a rated level or cites a figure the sources lack.
export type ValidationStatus = 'validated' | 'flagged' | 'unverifiable';
export type ConfidenceStatus = 'high-confidence' | 'low-confidence';

export interface ValidationVerdict {
  validationStatus: ValidationStatus;
  confidenceStatus: ConfidenceStatus;
  notes: string | null;
}

export interface ValidateInput {
  content: string;
  retrievalLowConfidence: boolean;
  /** Omit when the prompt declared no limit — see the design doc. */
  maxLength?: number;
  /** Rated levels and source text; omit where the prompt had neither (SRS 2.2). */
  facts?: Omit<FactCheckInput, 'content'>;
}

@Injectable()
export class OutputValidatorService {
  validate({ content, retrievalLowConfidence, maxLength, facts }: ValidateInput): ValidationVerdict {
    const confidenceStatus: ConfidenceStatus = retrievalLowConfidence
      ? 'low-confidence'
      : 'high-confidence';

    const trimmed = (content ?? '').trim();

    if (!trimmed) {
      return { validationStatus: 'flagged', confidenceStatus, notes: 'Empty recommendation text.' };
    }

    if (maxLength !== undefined && trimmed.length > maxLength) {
      return {
        validationStatus: 'flagged',
        confidenceStatus,
        notes: `Exceeds the ${maxLength}-character limit declared in the prompt (${trimmed.length}).`,
      };
    }

    if (facts) {
      const { levelMismatches, unsupportedNumbers } = checkRecommendationFacts({
        ...facts,
        // Approved RNAs are stored as HTML; tags carry no claims.
        content: trimmed.replace(/<[^>]*>/g, ' '),
      });
      const problems = [
        ...levelMismatches,
        ...(unsupportedNumbers.length
          ? [`Cites ${unsupportedNumbers.join(', ')}, not found in the profile or capsule proposal.`]
          : []),
      ];
      if (problems.length) {
        return { validationStatus: 'unverifiable', confidenceStatus, notes: problems.join(' ') };
      }
    }

    return { validationStatus: 'validated', confidenceStatus, notes: null };
  }
}
