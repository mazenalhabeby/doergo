import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';

/**
 * Every handler of every controller a module registers under one path prefix,
 * in the module's REGISTRATION order — which is the order Express matches in.
 * A controller split by job spreads one prefix over several classes, so a
 * route-order guard must read them all, in this order.
 */
export function moduleHandlers(module: object, prefix: string): Array<(...a: unknown[]) => unknown> {
  const controllers = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? []) as Array<{ prototype: object }>;
  return controllers
    .filter((C) => Reflect.getMetadata(PATH_METADATA, C) === prefix)
    .flatMap((C) =>
      Object.getOwnPropertyNames(C.prototype)
        .filter((n) => n !== 'constructor')
        .map((n) => (C.prototype as Record<string, unknown>)[n])
        .filter((fn): fn is (...a: unknown[]) => unknown => typeof fn === 'function'),
    );
}
