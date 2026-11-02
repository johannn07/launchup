import { ForbiddenException } from '@nestjs/common';
import * as argon from 'argon2';
import { ActivityLog } from 'src/entities/activity-log.entity';
import { AuthService } from './auth.service';

// SRS 1.1: failed sign-ins are logged to the Manager's activity feed.
describe('AuthService.signin failure logging', () => {
  const build = (user: unknown) => {
    const em = {
      findOne: jest.fn().mockResolvedValue(user),
      create: jest.fn((_entity, data) => data),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    } as any;
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') } as any;
    const config = { get: jest.fn().mockReturnValue('secret') } as any;
    return { em, service: new AuthService(em, jwt, config) };
  };

  it('logs an unknown email and still refuses', async () => {
    const { em, service } = build(null);
    await expect(
      service.signin({ email: 'nobody@x.test', password: 'pw' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(em.create).toHaveBeenCalledWith(
      ActivityLog,
      expect.objectContaining({ action: 'Auth', actor: 'nobody@x.test' }),
    );
    expect(em.persistAndFlush).toHaveBeenCalledTimes(1);
  });

  it('logs a wrong password and still refuses', async () => {
    const hash = await argon.hash('right');
    const { em, service } = build({
      id: 1,
      email: 'a@x.test',
      hash,
      role: 'Startup',
    });
    await expect(
      service.signin({ email: 'a@x.test', password: 'wrong' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(em.create).toHaveBeenCalledWith(
      ActivityLog,
      expect.objectContaining({ action: 'Auth', actor: 'a@x.test' }),
    );
  });

  it('logs nothing on a successful sign-in', async () => {
    const hash = await argon.hash('right');
    const { em, service } = build({
      id: 1,
      email: 'a@x.test',
      hash,
      role: 'Startup',
    });
    await expect(
      service.signin({ email: 'a@x.test', password: 'right' }),
    ).resolves.toEqual({ access_token: 'token' });
    expect(em.persistAndFlush).not.toHaveBeenCalled();
  });

  it('still refuses when the log write itself fails', async () => {
    const { em, service } = build(null);
    em.persistAndFlush.mockRejectedValue(new Error('db down'));
    await expect(
      service.signin({ email: 'nobody@x.test', password: 'pw' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
