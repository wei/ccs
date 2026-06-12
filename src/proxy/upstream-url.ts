/**
 * Resolve upstream URLs for OpenAI-compat proxy requests.
 *
 * Two modes are supported:
 *
 * 1. Default (OpenAI mode) - appends `/chat/completions` or `/models` to the
 *    base URL so requests are routed to the OpenAI-compatible endpoint of the
 *    upstream provider.
 *
 * 2. Anthropic passthrough - some providers (e.g. Kimi, Anthropic API
 *    mirrors) expose an Anthropic-compatible `/v1/messages` endpoint and
 *    REJECT OpenAI-format requests (e.g. Kimi returns 403 when the
 *    User-Agent is not a recognized coding agent or when the request is
 *    not an Anthropic-style body). For these profiles we preserve the
 *    incoming Anthropic body and forward it directly to the
 *    `/v1/messages` endpoint of the provider.
 *
 * Passthrough is enabled when:
 *   - `CCS_OPENAI_PROXY_PASSTHROUGH=1` is set in the profile env, OR
 *   - The base URL already ends with `/v1` or `/v1/` (i.e. the provider
 *     explicitly exposes an Anthropic-style `/v1` prefix), OR
 *   - The base URL is the official Anthropic API.
 */

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '';
}

function ensureSupportedProtocol(parsed: URL): void {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported upstream protocol: ${parsed.protocol}`);
  }
}

function isAnthropicApiHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'api.anthropic.com' ||
    normalized.endsWith('.anthropic.com') ||
    normalized === 'api.kimi.com' ||
    normalized.endsWith('.kimi.com') ||
    normalized === 'api.minimax.com' ||
    normalized.endsWith('.minimax.com') ||
    normalized === 'api.minimax.io' ||
    normalized.endsWith('.minimax.io') ||
    normalized === 'api.minimaxi.com' ||
    normalized.endsWith('.minimaxi.com') ||
    normalized === 'api.minimaxi.chat' ||
    normalized.endsWith('.minimaxi.chat')
  );
}

function isOpenRouterHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'openrouter.ai' || normalized.endsWith('.openrouter.ai');
}

/**
 * Returns true if the profile should pass Anthropic-format requests through
 * directly to the upstream provider, skipping the OpenAI translation.
 */
export function isAnthropicPassthroughProfile(
  baseUrl: string,
  options: { forcePassthrough?: boolean } = {}
): boolean {
  if (options.forcePassthrough) {
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return false;
  }
  ensureSupportedProtocol(parsed);
  if (isAnthropicApiHost(parsed.hostname)) {
    return true;
  }
  const pathname = normalizePathname(parsed.pathname);
  // If the base URL already includes the Anthropic `/v1` prefix, treat
  // the upstream as an Anthropic-style endpoint rather than an OpenAI one.
  if (pathname === '/v1' || pathname === '/v1/' || pathname.endsWith('/v1')) {
    return true;
  }
  return false;
}

/**
 * Build the upstream URL for either the messages path or the models path.
 * When passthrough is enabled, the messages path is appended verbatim
 * (i.e. `/v1/messages`); otherwise the OpenAI suffix is appended.
 */
function buildResolvedUrl(
  baseUrl: string,
  suffix: string,
  options: { passthrough?: boolean } = {}
): string {
  const parsed = new URL(baseUrl);
  ensureSupportedProtocol(parsed);

  const pathname = normalizePathname(parsed.pathname);

  if (options.passthrough) {
    // For Anthropic passthrough, the suffix is always `/v1/messages` or
    // `/v1/models`. If the base URL already ends in `/v1` we drop the
    // duplicated prefix; otherwise we append the suffix verbatim.
    if (pathname.endsWith('/v1') && suffix.startsWith('/v1/')) {
      parsed.pathname = `${pathname}${suffix.slice(3)}`;
      parsed.search = '';
      return parsed.toString();
    }
    parsed.pathname = pathname ? `${pathname}${suffix}` : suffix;
    parsed.search = '';
    return parsed.toString();
  }

  if (pathname.endsWith(suffix)) {
    return parsed.toString();
  }

  if (isOpenRouterHost(parsed.hostname) && pathname.endsWith('/api')) {
    parsed.pathname = `${pathname}/v1${suffix}`;
    return parsed.toString();
  }

  if (pathname.endsWith('/v1') || pathname.endsWith('/api')) {
    parsed.pathname = `${pathname}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
    return parsed.toString();
  }

  parsed.pathname = pathname ? `${pathname}/v1${suffix}` : `/v1${suffix}`;
  return parsed.toString();
}

/**
 * Resolve the upstream URL for a chat completions request.
 *
 * For OpenAI-compatible providers this resolves to
 * `<base>/v1/chat/completions`. For Anthropic passthrough providers this
 * resolves to `<base>/v1/messages`.
 */
export function resolveOpenAIChatCompletionsUrl(
  baseUrl: string,
  options: { passthrough?: boolean } = {}
): string {
  if (options.passthrough) {
    return buildResolvedUrl(baseUrl, '/v1/messages', { passthrough: true });
  }
  return buildResolvedUrl(baseUrl, '/chat/completions');
}

/**
 * Resolve the upstream URL for the models endpoint.
 */
export function resolveOpenAIModelsUrl(
  baseUrl: string,
  options: { passthrough?: boolean } = {}
): string {
  if (options.passthrough) {
    return buildResolvedUrl(baseUrl, '/v1/models', { passthrough: true });
  }
  return buildResolvedUrl(baseUrl, '/models');
}
