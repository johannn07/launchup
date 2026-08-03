import { Injectable } from '@nestjs/common';

export type ValidationStatus = 'validated' | 'flagged';
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
}

@Injectable()
export class OutputValidatorService {
  validate({ content, retrievalLowConfidence, maxLength }: ValidateInput): ValidationVerdict {
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

    return { validationStatus: 'validated', confidenceStatus, notes: null };
  }
}
