/**
 * Returns an absolute URL for a public data file, accounting for the
 * Next.js basePath so sub-pages (e.g. /history/) resolve correctly.
 *
 * Relative fetch() calls break on sub-pages because the browser resolves
 * them against the current directory (/history/data/… instead of /data/…).
 */
export function dataUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${base}/${path.replace(/^\//, '')}`;
}
