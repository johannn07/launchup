import { Injectable } from '@nestjs/common';
import { RAGContext } from './rag-query.service';

export interface StartupProfile {
  // Define fields as needed
  [key: string]: any;
}

@Injectable()
export class GroundedPromptBuilderService {
  buildGroundedPrompt(
    context: RAGContext, 
    profile: StartupProfile, 
    missingReadinessTypes: string[],
    customTaskBlock?: string): string {
    // Compose a readable, LLM-friendly prompt
    let prompt = 'You are an expert startup mentor AI.\n';
    prompt += 'Below is the startup profile and contextually similar prior validated profiles.\n';
    prompt += '\n--- Startup Profile ---\n';
    for (const [key, value] of Object.entries(profile)) {
      if (typeof value === 'object') {
        prompt += `${key}: ${JSON.stringify(value)}\n`;
      } else {
        prompt += `${key}: ${value}\n`;
      }
    }

    if (context.similarProfiles && context.similarProfiles.length > 0) {
      prompt += '\n--- Contextually Similar Profiles ---\n';
      context.similarProfiles.forEach((p, i) => {
        prompt += `Profile ${i + 1}:\n`;
        prompt += `  ID: ${p.source_id}\n`;
        prompt += `  Similarity: ${p.similarity.toFixed(3)}\n`;
        if (p.metadata) prompt += `  Metadata: ${JSON.stringify(p.metadata)}\n`;
      });
    }

    if (context.verifiedFrameworks && context.verifiedFrameworks.length > 0) {
      prompt += '\n--- Verified Frameworks ---\n';
      context.verifiedFrameworks.forEach((f, i) => {
        prompt += `Framework ${i + 1}: ${JSON.stringify(f)}\n`;
      });
    }

    if (context.businessModels && context.businessModels.length > 0) {
      prompt += '\n--- Business Models ---\n';
      context.businessModels.forEach((b, i) => {
        prompt += `Business Model ${i + 1}: ${JSON.stringify(b)}\n`;
      });
    }

  if (customTaskBlock) {
    prompt += customTaskBlock;
  } else {
    prompt += '\n--- Task ---\n';
    prompt += `Generate a Readiness and Needs Assessment (RNA) for the following missing readiness types: ${missingReadinessTypes.join(', ')}.\n`;
    prompt += `Requirement: The response must be a valid JSON array.\n`;
    prompt += `JSON format: [{"readiness_level_type": (string), "rna": (string)}]\n`;
    prompt += `- readiness_level_type must be exactly one of: ${missingReadinessTypes.join(', ')}\n`;
    prompt += `- rna must be a string of max 500 characters\n`;
    prompt += `- Be specific, grounded in the provided data.\n`;
    prompt += `- If you cannot generate a meaningful RNA for a type, use "rna": "Insufficient data for assessment" instead of null.\n`;
    if (context.lowConfidence) {
      prompt += '\nNOTE: The context is low-confidence. Use the available profile data primarily.\n';
    }
  }
  return prompt;

  }

  async sendToGemini(prompt: string): Promise<RecommendationSet> {
    // TODO: Call Gemini API
    return {
      startupId: '',
      dimension: '',
      rnaItems: [],
      rnsItems: [],
    };
  }
}

export interface RecommendationSet {
  startupId: string;
  dimension: string;
  rnaItems: Recommendation[];
  rnsItems: Recommendation[];
}

export interface Recommendation {
  id: string;
  text: string;
  status: string;
  inconsistencyReason?: string;
  mentorDecision?: string;
}
