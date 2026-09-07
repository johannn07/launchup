import { ReadinesslevelController } from './readinesslevel.controller';
import { JwtGuard } from '../auth/guard';

/**
 * Guards were applied per method here, so four routes shipped without one and
 * answered unauthenticated. Asserting the whole handler set rather than four
 * names means a route added later without a guard fails here too, which is the
 * way this went wrong in the first place.
 */
const GUARDS_METADATA = '__guards__';

function guardsOf(target: object): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[]) ?? [];
}

function handlerNames(controller: { prototype: unknown }): string[] {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter(
    (name) => name !== 'constructor' && typeof proto[name] === 'function',
  );
}

describe('ReadinesslevelController authentication', () => {
  it('requires a JWT on every route', () => {
    const classGuards = guardsOf(ReadinesslevelController);
    const proto = ReadinesslevelController.prototype as unknown as Record<
      string,
      object
    >;

    const unguarded = handlerNames(ReadinesslevelController).filter(
      (name) =>
        ![...classGuards, ...guardsOf(proto[name])].includes(JwtGuard),
    );

    expect(unguarded).toEqual([]);
  });
});
