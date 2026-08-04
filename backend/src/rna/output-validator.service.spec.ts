import { OutputValidatorService } from './output-validator.service';

describe('OutputValidatorService.validate', () => {
  const svc = new OutputValidatorService();
  const ok = { content: 'A well-formed recommendation.', retrievalLowConfidence: false };

  it('passes well-formed content from confident retrieval', () => {
    expect(svc.validate(ok)).toEqual({
      validationStatus: 'validated',
      confidenceStatus: 'high-confidence',
      notes: null,
    });
  });

  it('flags empty content', () => {
    const v = svc.validate({ ...ok, content: '' });
    expect(v.validationStatus).toBe('flagged');
    expect(v.notes).toMatch(/empty/i);
  });

  it('flags whitespace-only content', () => {
    expect(svc.validate({ ...ok, content: '   \n\t ' }).validationStatus).toBe('flagged');
  });

  it('flags content longer than a declared maxLength, naming both numbers', () => {
    const v = svc.validate({ ...ok, content: 'x'.repeat(501), maxLength: 500 });
    expect(v.validationStatus).toBe('flagged');
    expect(v.notes).toContain('500');
    expect(v.notes).toContain('501');
  });

  it('accepts content exactly at the declared limit', () => {
    // Boundary: a `>=` here would flag correct output.
    expect(svc.validate({ ...ok, content: 'x'.repeat(500), maxLength: 500 }).validationStatus)
      .toBe('validated');
  });

  it('does NOT flag long content when no maxLength was declared', () => {
    // Load-bearing: `maxLength` is optional because not every prompt declares
    // a limit. Enforcing one anyway would flag output the model was never
    // told to keep short — all current callers happen to declare one today,
    // but the validator itself must not assume that.
    expect(svc.validate({ ...ok, content: 'x'.repeat(5000) }).validationStatus).toBe('validated');
  });

  it('reports low confidence without flagging well-formed content', () => {
    // Confidence and validation are independent axes.
    expect(svc.validate({ ...ok, retrievalLowConfidence: true })).toEqual({
      validationStatus: 'validated',
      confidenceStatus: 'low-confidence',
      notes: null,
    });
  });

  it('reports both when low-confidence retrieval produced malformed content', () => {
    const v = svc.validate({ content: '', retrievalLowConfidence: true });
    expect(v.validationStatus).toBe('flagged');
    expect(v.confidenceStatus).toBe('low-confidence');
  });

  it('treats null/undefined content as empty rather than throwing', () => {
    expect(svc.validate({ ...ok, content: undefined as unknown as string }).validationStatus)
      .toBe('flagged');
  });
});
