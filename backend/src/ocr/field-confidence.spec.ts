import { classifyField, scoreFields, supportRatio } from './field-confidence';

// Abridged from the AgriTrace sample capsule proposal, so the fixtures behave
// like a real page rather than like text written to pass.
const PAGE = `I. General Information
Project Title: Development and Pilot Testing of AgriTrace: An IoT-Enabled Cold
Chain Monitoring System for High-Value Crops
Startup Name: AgriLogix Solutions Inc.
Total Funding Requested: 3,500,000.00
II. Executive Summary
Post-harvest losses in the Philippines reach up to 40% due to poor cold chain
logistics. Smallholder farmers lose revenue because temperature drops during
transport lead to rapid food spoilage.
V. Target Market
Small-to-medium agricultural cooperatives and cold-chain trucking services in
Luzon and Visayas.`;

describe('classifyField', () => {
  it('reports a field with no text as failed', () => {
    expect(classifyField('', PAGE)).toBe('failed');
    expect(classifyField('   ', PAGE)).toBe('failed');
  });

  it('verifies a field whose wording comes off the page', () => {
    const target = 'Small-to-medium agricultural cooperatives and cold-chain trucking services in Luzon and Visayas';
    expect(classifyField(target, PAGE)).toBe('verified');
  });

  // The bug this whole rule exists to catch. `scope` has no section in either
  // sample proposal, so the model invents one — and the prompt orders it to
  // write at least 40 characters, which is precisely what the old rule rewarded.
  it('does not verify a long field the page does not support', () => {
    const invented =
      'The engagement encompasses discovery workshops, stakeholder alignment sessions and a phased quality assurance programme across all deliverables';
    expect(invented.length).toBeGreaterThan(40);
    expect(classifyField(invented, PAGE)).toBe('low');
  });

  it('does not verify anything when there is no transcription to check against', () => {
    const target = 'Small-to-medium agricultural cooperatives and cold-chain trucking services in Luzon';
    expect(classifyField(target, '')).toBe('low');
  });

  it('does not verify a field made only of function words', () => {
    expect(classifyField('the of and to', PAGE)).toBe('low');
  });
});

describe('supportRatio', () => {
  it('returns null rather than 1 when the field has nothing to check', () => {
    expect(supportRatio('the of and', PAGE)).toBeNull();
  });

  it('counts figures as evidence', () => {
    expect(supportRatio('3,500,000.00', PAGE)).toBe(1);
  });
});

describe('scoreFields', () => {
  it('labels each field independently', () => {
    const result = scoreFields(
      {
        title: 'AgriTrace IoT-Enabled Cold Chain Monitoring System',
        scope: 'A phased engagement covering discovery, alignment and assurance workstreams',
        methodology: '',
      },
      PAGE,
    );

    expect(result).toEqual({ title: 'verified', scope: 'low', methodology: 'failed' });
  });
});
