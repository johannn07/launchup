import { RoadblockController } from './roadblock.controller';
import { Role } from '../entities/enums/role.enum';
import { RnsStatus } from '../entities/enums/rns.enum';

function buildController() {
  const roadblockService = {
    statusChange: jest.fn().mockResolvedValue({ id: 7 }),
  };
  const controller = new RoadblockController(
    roadblockService as any,
    {} as any,
  );
  return { controller, roadblockService };
}

describe('RoadblockController.roleStatusUpdate', () => {
  it('forwards the drag to statusChange', async () => {
    const { controller, roadblockService } = buildController();

    await controller.roleStatusUpdate(7, { user: { role: Role.Mentor } }, {
      status: RnsStatus.Completed,
    } as any);

    expect(roadblockService.statusChange).toHaveBeenCalledWith(7, Role.Mentor, {
      status: RnsStatus.Completed,
    });
  });

  // The board also sends ?role=, which a startup could set to Mentor to skip approval.
  it('takes the role from the token, not the request', async () => {
    const { controller, roadblockService } = buildController();

    await controller.roleStatusUpdate(7, { user: { role: Role.Startup } }, {
      status: RnsStatus.Completed,
    } as any);

    expect(roadblockService.statusChange).toHaveBeenCalledWith(
      7,
      Role.Startup,
      expect.anything(),
    );
  });
});
