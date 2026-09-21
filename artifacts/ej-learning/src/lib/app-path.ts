/** Prefix root-relative API/file links while preserving external URLs. */
export function appPath(value: string, base = import.meta.env.BASE_URL): string {
  const prefix = base.replace(/\/$/, '');
  if (!prefix || !value.startsWith('/') || value.startsWith('//')) return value;
  if (value === prefix || value.startsWith(prefix + '/')) return value;
  return prefix + value;
}
