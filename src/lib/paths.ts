/**
 * Base-path aware URL helper. The site is served from a sub-path on GitHub Pages
 * (e.g. /learn-cissp/), so root-absolute links like "/exams" must be prefixed.
 */
const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '');

/** Prefix an app-root path ("/exams?tab=full") with the deployment base. */
export function withBase(path: string): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Strip the deployment base from a pathname so route checks work in any deployment. */
export function stripBase(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) {
    return pathname.slice(BASE.length) || '/';
  }
  return pathname;
}
