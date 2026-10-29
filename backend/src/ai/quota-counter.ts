import { isQuotaError } from './retry-transient';

type GenerateContent = (req: any) => Promise<any>;

export interface QuotaHooks {
  onCall(model: string): Promise<void>;
  onQuotaExhausted(model: string): Promise<void>;
}

/**
 * Counts every request sent through `models.generateContent`, in place.
 * Installed on the client rather than inside AiService's call sites, so a
 * harness that later swaps in a stub for a dry run is not counted.
 */
export function countGenerateContent(
  models: { generateContent: GenerateContent },
  hooks: QuotaHooks,
) {
  const send = models.generateContent.bind(models);

  models.generateContent = async (req: any) => {
    // The count is advisory; losing it must never cost a generation.
    await hooks.onCall(req?.model).catch((e) =>
      console.error('AI quota count failed', e),
    );
    try {
      return await send(req);
    } catch (e) {
      if (isQuotaError(e)) {
        await hooks
          .onQuotaExhausted(req?.model)
          .catch((err) => console.error('AI quota flag failed', err));
      }
      throw e;
    }
  };
}

export function remainingRequests(s: {
  used: number;
  exhausted: boolean;
  limit: number;
}) {
  // Gemini's refusal is the ground truth; the count misses calls made outside the app.
  if (s.exhausted) return 0;
  return Math.max(0, s.limit - s.used);
}
