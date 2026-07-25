import { AiGenerationRun } from './ai-generation-run.entity';

describe('AiGenerationRun', () => {
  it('starts in the running state with a creation timestamp', () => {
    const run = new AiGenerationRun();

    expect(run.status).toBe('running');
    expect(run.createdAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeUndefined();
  });
});
