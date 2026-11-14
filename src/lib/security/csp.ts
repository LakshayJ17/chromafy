/**
 * Builds a strict, nonce-based Content-Security-Policy for every page request.
 * Next.js reads the nonce from the request header and applies it to its own
 * scripts and inline styles, so no 'unsafe-inline' script source is needed.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean, options: { turnstile?: boolean } = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Development only: the dev server injects un-nonced <style> tags for hot reloading.
    // A nonce would disable 'unsafe-inline', so dev omits it. Production keeps the nonce.
    isDev ? "style-src-elem 'self' 'unsafe-inline'" : `style-src-elem 'self' 'nonce-${nonce}'`,
    // Inline style attributes (used for animation transforms and colour tokens) cannot carry
    // a nonce; they cannot execute script, so allowing attributes only is a contained trade-off.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    // Cloudflare Turnstile renders its check in an iframe; its script is admitted by nonce + strict-dynamic.
    `frame-src ${options.turnstile ? "https://challenges.cloudflare.com" : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
