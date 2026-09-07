import {
  classifyField,
  confidenceScore,
  scoreFields,
  supportRatio,
} from './field-confidence';

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

    expect(result).toEqual({
      title: 'unverified',
      scope: 'unsupported',
      methodology: 'failed',
    });
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

  it('makes no claim about a field derived from the text it is checked against', () => {
    expect(classifyField(garbage, garbage, 'derived')).toBe('unverified');
  });

  it('reaches the same unverified answer on independent evidence, since a high ratio proves nothing', () => {
    expect(classifyField(garbage, garbage, 'vision')).toBe('unverified');
  });

  // What source still decides: a non-match is a finding about the page only
  // when the transcription did not produce the field.
  it('reports a non-match as unsupported on vision, and withholds it on derived', () => {
    const absent = 'quantum entanglement satellite uplink calibration procedures';
    expect(classifyField(absent, PAGE, 'vision')).toBe('unsupported');
    expect(classifyField(absent, PAGE, 'derived')).toBe('unverified');
  });

  it('still reports an empty derived field as failed', () => {
    expect(classifyField('', garbage, 'derived')).toBe('failed');
  });

  it('withholds a claim on every derived field, however well it matches', () => {
    const result = scoreFields(
      { title: garbage, scope: garbage, methodology: '' },
      garbage,
      'derived',
    );
    expect(result).toEqual({
      title: 'unverified',
      scope: 'unverified',
      methodology: 'failed',
    });
  });
});

/**
 * The claim change, 2026-09-07. The threshold is unchanged; what the states
 * assert is not. Measured on 80 labelled observations: at 0.5 sensitivity is
 * 100% and specificity 30.8%, so a ratio below the line is informative (no
 * grounded field fell there) and a ratio above it is not (18 of 26 invented
 * fields did). Nothing may claim verification off this metric.
 */
describe('classifyField — what each state claims', () => {
  it('calls a field the page does not support unsupported, the one measured claim', () => {
    const invented =
      'The engagement encompasses discovery workshops, stakeholder alignment sessions and a phased quality assurance programme across all deliverables';
    expect(classifyField(invented, PAGE, 'vision')).toBe('unsupported');
  });

  it('never claims verification, however well the field matches', () => {
    const target =
      'Small-to-medium agricultural cooperatives and cold-chain trucking services in Luzon and Visayas';
    expect(classifyField(target, PAGE, 'vision')).toBe('unverified');
  });

  it('reports an unverifiable field as unverified, not unsupported', () => {
    // No evidence is not evidence of absence: these must not read as a finding
    // about the page.
    const target = 'Small-to-medium agricultural cooperatives and cold-chain trucking';
    expect(classifyField(target, '', 'vision')).toBe('unverified');
    expect(classifyField(target, PAGE, 'derived')).toBe('unverified');
    expect(classifyField('the of and to', PAGE, 'vision')).toBe('unverified');
  });

  it('still reports an empty field as failed', () => {
    expect(classifyField('', PAGE, 'vision')).toBe('failed');
  });
});

describe('confidenceScore', () => {
  it('encodes the three states distinctly for the stored telemetry column', () => {
    expect(confidenceScore('unverified')).toBe(0.5);
    expect(confidenceScore('unsupported')).toBe(0.25);
    expect(confidenceScore('failed')).toBe(0);
  });
});
