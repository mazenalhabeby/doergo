import { MODULE_METADATA } from '@nestjs/common/constants';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AssetsModule } from '../assets.module';

/**
 * The /assets controllers in the ORDER THE MODULE REGISTERS THEM — which is the
 * order Express matches in. One AssetsController until 2026-10-17; split by job
 * since, so "is this static path declared before `:id`" spans several classes.
 */
export function assetControllers(): Array<new (...a: never[]) => object> {
  const all = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AssetsModule) ?? []) as Array<
    new (...a: never[]) => object
  >;
  return all.filter((C) => Reflect.getMetadata(PATH_METADATA, C) === 'assets');
}

/** Every handler of every /assets controller, in registration order. */
export function assetHandlers(): Array<(...a: unknown[]) => unknown> {
  return assetControllers().flatMap((C) =>
    Object.getOwnPropertyNames(C.prototype)
      .filter((n) => n !== 'constructor')
      .map((n) => (C.prototype as unknown as Record<string, unknown>)[n])
      .filter((fn): fn is (...a: unknown[]) => unknown => typeof fn === 'function'),
  );
}

/** One /assets handler by method name, from whichever controller owns it. */
export function assetRoute(name: string): (...a: unknown[]) => unknown {
  for (const C of assetControllers()) {
    if (Object.prototype.hasOwnProperty.call(C.prototype, name))
      return (C.prototype as unknown as Record<string, never>)[name];
  }
  throw new Error(`no /assets route ${name}`);
}
