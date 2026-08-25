import { RnaController } from './rna.controller';
import { Role } from '../entities/enums/role.enum';

// `track` wraps the service call, so invoking the callback is what lets these
// tests observe what the controller forwarded to RnaService.
function buildController() {
  const rnaService = { generateRNA: jest.fn().mockResolvedValue([]) };
  const aiRunService = {
    track: jest.fn((_id, _kind, _cfg, _priv, fn) =>
      fn({ run: {}, config: {} }),
    ),
  };
  const controller = new RnaController(rnaService as any, aiRunService as any);
  return { controller, rnaService };
}

const mentor = { user: { role: Role.Mentor } };

describe('RnaController.generateTasks dimension selection', () => {
  it('forwards the selected readiness types to the service', async () => {
    const { controller, rnaService } = buildController();

    await controller.generateTasks(1, mentor, ['Market', 'Technology']);

    expect(rnaService.generateRNA).toHaveBeenCalledWith(1, expect.anything(), [
      'Market',
      'Technology',
    ]);
  });

  it('forwards undefined when no types are selected, preserving gap-fill', async () => {
    const { controller, rnaService } = buildController();

    await controller.generateTasks(1, mentor);

    expect(rnaService.generateRNA).toHaveBeenCalledWith(
      1,
      expect.anything(),
      undefined,
    );
  });

  it('rejects a readiness type outside the enum before any AI run starts', async () => {
    const { controller, rnaService } = buildController();

    await expect(
      controller.generateTasks(1, mentor, ['Marketing']),
    ).rejects.toThrow('Marketing');
    expect(rnaService.generateRNA).not.toHaveBeenCalled();
  });
});
