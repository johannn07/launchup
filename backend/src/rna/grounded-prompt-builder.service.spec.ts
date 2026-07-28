import { GroundedPromptBuilderService } from './grounded-prompt-builder.service';
import { RAGContext } from './rag-query.service';

const ctx = (over: Partial<RAGContext> = {}): RAGContext => ({
  verifiedFrameworks: [],
  businessModels: [],
  similarProfiles: [],
  lowConfidence: false,
  ...over,
});

const service = new GroundedPromptBuilderService();
const profile = {
  title: 'AgroLink PH',
  description: 'Cooperative market access',
};

describe('buildGroundedPrompt', () => {
  it('emits the retrieved text of a similar profile, not just its id and score', () => {
    // The whole point of retrieval. This previously printed ID + similarity +
    // metadata and dropped content entirely, so generation was ungrounded.
    const prompt = service.buildGroundedPrompt(
      ctx({
        similarProfiles: [
          {
            sourceType: 'capsule_proposal',
            title: 'MediSync',
            content: 'referral coordination for rural health units',
            similarity: 0.82,
            startupId: 2,
          },
        ],
      }),
      profile,
      ['Technology'],
    );

    expect(prompt).toContain('referral coordination for rural health units');
  });

  it('emits rubric content with its provenance and citation', () => {
    const prompt = service.buildGroundedPrompt(
      ctx({
        verifiedFrameworks: [
          {
            sourceType: 'readiness_rubric',
            title: 'TRL 3',
            content: 'experimental proof of concept',
            provenance: 'standard',
            citation: 'Horizon Europe Annex B',
          },
        ],
      }),
      profile,
      ['Technology'],
    );

    expect(prompt).toContain('experimental proof of concept');
    expect(prompt).toContain('Horizon Europe Annex B');
  });

  it('does not JSON.stringify framework objects', () => {
    const prompt = service.buildGroundedPrompt(
      ctx({
        businessModels: [
          {
            sourceType: 'business_framework',
            title: 'Lean Canvas',
            content: 'problem, solution, key metrics',
            provenance: 'framework-derived',
            citation: 'Maurya (2012)',
          },
        ],
      }),
      profile,
      ['Market'],
    );

    expect(prompt).toContain('problem, solution, key metrics');
    expect(prompt).not.toContain('{"sourceType"');
  });

  it('orders sections rubrics, then frameworks, then peers', () => {
    const prompt = service.buildGroundedPrompt(
      ctx({
        verifiedFrameworks: [
          {
            sourceType: 'readiness_rubric',
            title: 'R',
            content: 'rubric text',
          },
        ],
        businessModels: [
          {
            sourceType: 'business_framework',
            title: 'F',
            content: 'framework text',
          },
        ],
        similarProfiles: [
          { sourceType: 'capsule_proposal', title: 'P', content: 'peer text' },
        ],
      }),
      profile,
      ['Technology'],
    );

    expect(prompt.indexOf('rubric text')).toBeLessThan(
      prompt.indexOf('framework text'),
    );
    expect(prompt.indexOf('framework text')).toBeLessThan(
      prompt.indexOf('peer text'),
    );
  });

  it('labels peer material as unverified so it is not read as authoritative', () => {
    // Peer text is another startup's AI-parsed application. Presenting it
    // alongside a transcribed standard without distinction is how extraction
    // errors get laundered into grounding.
    const prompt = service.buildGroundedPrompt(
      ctx({
        similarProfiles: [
          { sourceType: 'capsule_proposal', title: 'P', content: 'peer text' },
        ],
      }),
      profile,
      ['Technology'],
    );

    expect(prompt).toMatch(/unverified/i);
  });

  it('keeps the custom task block for RNS', () => {
    const prompt = service.buildGroundedPrompt(
      ctx(),
      profile,
      ['Market'],
      '\n--- Task ---\nmake tasks\n',
    );
    expect(prompt).toContain('make tasks');
  });
});
