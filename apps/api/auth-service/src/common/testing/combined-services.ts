/**
 * Several services as ONE object, for tests written against a class that has
 * since been split by job. Reading a member finds the service that owns it
 * (its own method first, then an inherited one); SETTING a member (a test
 * replacing a shared helper) sets it on every service, so it is replaced
 * everywhere at once. Test code only.
 */
export function combinedServices<T>(...services: object[]): T {
  const all = services as Array<Record<string | symbol, unknown>>;
  return new Proxy({} as Record<string | symbol, unknown>, {
    get(_t, name) {
      // A value the test set on the instance first, then the class's own method, then an inherited one.
      const owner =
        all.find((svc) => Object.prototype.hasOwnProperty.call(svc, name) && svc[name] !== undefined) ??
        all.find((svc) => Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(svc), name)) ??
        all.find((svc) => name in svc);
      const value = owner?.[name];
      // A value a test set on the instance (a jest.fn) is returned as is — binding would drop `.mock`.
      if (owner && Object.prototype.hasOwnProperty.call(owner, name)) return value;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(owner) : value;
    },
    set(_t, name, value) {
      for (const svc of all) svc[name] = value;
      return true;
    },
  }) as unknown as T;
}
