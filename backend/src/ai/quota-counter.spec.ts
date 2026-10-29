import { countGenerateContent, remainingRequests } from './quota-counter';

const QUOTA = new Error(
  'got status: 429 Too Many Requests. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}',
);
const BUSY = new Error(
  'got status: 503 Service Unavailable. {"error":{"code":503,"status":"UNAVAILABLE"}}',
);

function build(impl: (req: any) => Promise<any>) {
  const models = { generateContent: jest.fn(impl) };
  const hooks = {
    onCall: jest.fn().mockResolvedValue(undefined),
    onQuotaExhausted: jest.fn().mockResolvedValue(undefined),
  };
  countGenerateContent(models, hooks);
  return { models, hooks };
}

describe('countGenerateContent', () => {
  it('counts each request against its model and returns the response', async () => {
    const { models, hooks } = build(async () => ({ text: 'ok' }));

    await expect(
      models.generateContent({ model: 'gemini-3.6-flash', contents: 'x' }),
    ).resolves.toEqual({ text: 'ok' });

    expect(hooks.onCall).toHaveBeenCalledWith('gemini-3.6-flash');
    expect(hooks.onQuotaExhausted).not.toHaveBeenCalled();
  });

  it('marks the model exhausted on a quota error and rethrows it unchanged', async () => {
    const { models, hooks } = build(() => Promise.reject(QUOTA));

    await expect(
      models.generateContent({ model: 'gemini-3.6-flash' }),
    ).rejects.toBe(QUOTA);

    expect(hooks.onQuotaExhausted).toHaveBeenCalledWith('gemini-3.6-flash');
  });

  it('does not mark a busy model exhausted', async () => {
    const { models, hooks } = build(() => Promise.reject(BUSY));

    await expect(models.generateContent({ model: 'm' })).rejects.toBe(BUSY);

    expect(hooks.onCall).toHaveBeenCalledWith('m');
    expect(hooks.onQuotaExhausted).not.toHaveBeenCalled();
  });

  // The count is advisory; losing it must never cost a generation.
  it('still makes the call when counting fails', async () => {
    const { models, hooks } = build(async () => ({ text: 'ok' }));
    hooks.onCall.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(models.generateContent({ model: 'm' })).resolves.toEqual({
      text: 'ok',
    });
  });

  it('still rethrows the quota error when recording it fails', async () => {
    const { models, hooks } = build(() => Promise.reject(QUOTA));
    hooks.onQuotaExhausted.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(models.generateContent({ model: 'm' })).rejects.toBe(QUOTA);
  });
});

describe('remainingRequests', () => {
  it('is the limit less what was used', () => {
    expect(remainingRequests({ used: 7, exhausted: false, limit: 20 })).toBe(13);
  });

  it('never goes below zero', () => {
    expect(remainingRequests({ used: 23, exhausted: false, limit: 20 })).toBe(0);
  });

  // Gemini's refusal is the ground truth; the count misses calls made outside the app.
  it('is zero once Gemini has refused for quota, whatever the count says', () => {
    expect(remainingRequests({ used: 4, exhausted: true, limit: 20 })).toBe(0);
  });
});
