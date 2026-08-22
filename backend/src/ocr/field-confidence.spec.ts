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
    expect(classifyField('', PAGE, 'vision')).toBe('failed');
    expect(classifyField('   ', PAGE, 'vision')).toBe('failed');
  });

  it('verifies a field whose wording comes off the page', () => {
    const target = 'Small-to-medium agricultural cooperatives and cold-chain trucking services in Luzon and Visayas';
    expect(classifyField(target, PAGE, 'vision')).toBe('verified');
  });

  // The bug this whole rule exists to catch. `scope` has no section in either
  // sample proposal, so the model invents one — and the prompt orders it to
  // write at least 40 characters, which is precisely what the old rule rewarded.
  it('does not verify a long field the page does not support', () => {
    const invented =
      'The engagement encompasses discovery workshops, stakeholder alignment sessions and a phased quality assurance programme across all deliverables';
    expect(invented.length).toBeGreaterThan(40);
    expect(classifyField(invented, PAGE, 'vision')).toBe('low');
  });

  it('does not verify anything when there is no transcription to check against', () => {
    const target = 'Small-to-medium agricultural cooperatives and cold-chain trucking services in Luzon';
    expect(classifyField(target, '', 'vision')).toBe('low');
  });

  it('does not verify a field made only of function words', () => {
    expect(classifyField('the of and to', PAGE, 'vision')).toBe('low');
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
      'vision',
    );

    expect(result).toEqual({ title: 'verified', scope: 'low', methodology: 'failed' });
  });
});

describe('classifyField — circular evidence', () => {
  // When Gemini Vision is down, production feeds Tesseract's text to the model
  // and asks it to extract fields FROM that text. Checking those fields against
  // the same text checks the output against its own input, so overlap is
  // guaranteed. Observed live 2026-08-22: a garbage field scored ratio 1.0.
  const garbage = "Tinda % an otfline - sy Acdend cexvdit %9 in urder Rue $eesnds sendy sms eMinde s o0 due dovtes";

  it('scores a verbatim copy as fully supported, which is why source matters', () => {
    expect(supportRatio(garbage, garbage)).toBe(1);
  });

  it('refuses to verify a field derived from the text it is checked against', () => {
    expect(classifyField(garbage, garbage, 'derived')).toBe('low');
  });

  it('still verifies when the transcription is independent evidence', () => {
    expect(classifyField(garbage, garbage, 'vision')).toBe('verified');
  });

  it('still reports an empty derived field as failed', () => {
    expect(classifyField('', garbage, 'derived')).toBe('failed');
  });

  it('caps every derived field at low, however well it matches', () => {
    const result = scoreFields(
      { title: garbage, scope: garbage, methodology: '' },
      garbage,
      'derived',
    );
    expect(result).toEqual({ title: 'low', scope: 'low', methodology: 'failed' });
  });
});
