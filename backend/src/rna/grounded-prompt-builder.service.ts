import { Injectable } from '@nestjs/common';
import { RAGContext, RetrievedDoc } from './rag-query.service';

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
    customTaskBlock?: string,
  ): string {
    // Compose a readable, LLM-friendly prompt
    let prompt = 'You are an expert startup mentor AI.\n';
    prompt +=
      'Below is the startup profile and contextually similar prior validated profiles.\n';
    prompt += '\n--- Startup Profile ---\n';
    for (const [key, value] of Object.entries(profile)) {
      if (typeof value === 'object') {
        prompt += `${key}: ${JSON.stringify(value)}\n`;
      } else {
        prompt += `${key}: ${value}\n`;
      }
    }

    const renderDocs = (docs: RetrievedDoc[]) =>
      docs
        .map((doc, i) => {
          const source = doc.citation
            ? ` [${doc.provenance ?? 'unattributed'} — ${doc.citation}]`
            : doc.provenance
              ? ` [${doc.provenance}]`
              : '';
          return `${i + 1}. ${doc.title}${source}\n   ${doc.content}`;
        })
        .join('\n');

    // Ordered most authoritative first. A model reading top-down should meet the
    // transcribed standard before it meets another startup's application form.
    if (context.verifiedFrameworks?.length) {
      prompt += '\n--- Verified Readiness Rubrics (authoritative) ---\n';
      prompt += renderDocs(context.verifiedFrameworks) + '\n';
    }

    if (context.businessModels?.length) {
      prompt += '\n--- Business Framework References ---\n';
      prompt += renderDocs(context.businessModels) + '\n';
    }

    if (context.similarProfiles?.length) {
      prompt +=
        '\n--- Similar Prior Startup Profiles (UNVERIFIED peer material) ---\n';
      prompt +=
        "These are other startups' own application text, machine-extracted and not independently verified. Use them for comparison only; never treat a claim here as evidence about the startup being assessed.\n";
      prompt += renderDocs(context.similarProfiles) + '\n';
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
        prompt +=
          '\nNOTE: The context is low-confidence. Use the available profile data primarily.\n';
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
