/** Guards array-valued i18n reads: `t(key,{returnObjects:true})` returns the key
 *  STRING if the key is missing/renamed, which crashes any .map/.split. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
