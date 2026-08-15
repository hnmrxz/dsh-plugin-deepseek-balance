/**
 * dsh-plugin-deepseek-balance — Host half
 *
 * Registers a same-origin HTTP route (`/dsh-deepseek-balance`) that answers the
 * DeepSeek account balance as JSON. The client bundle polls this route; the
 * API key never leaves the Host process (it is resolved per request through
 * the `credentials` seam, the same `DEEPSEEK_API_KEY` reference the built-in
 * `llm-deepseek` adapter uses).
 *
 * This is a packaged Cordis plugin (not a dynamic plugin), so it runs with the
 * full Node runtime: global `fetch` is available and no subprocess/curl shim
 * is needed.
 */

export const name = 'deepseek-balance'

/**
 * No hard service dependency: every capability below is read via `ctx.get`
 * and degrades gracefully when absent, so the plugin can be mounted in any
 * profile without forcing a webServer/credentials/settings provider.
 */
export const inject = ['webServer']

/** Public API default; a custom base URL from `llm-deepseek` settings is honored. */
const PUBLIC_BASE_URL = 'https://api.deepseek.com'
/** The credential reference shared with the llm-deepseek adapter. */
const API_KEY_REF = 'DEEPSEEK_API_KEY'
/** Route path answering balance JSON (same origin as the web app). */
const ROUTE_PATH = '/dsh-deepseek-balance'
/** In-memory result cache TTL — several sessions poll the same route. */
const CACHE_MS = 10000

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    ctx.logger?.warn?.('[deepseek-balance] webServer service absent; status bar balance route not registered')
    return
  }

  let cache = { at: 0, value: null }

  /** Resolve the API key through the credentials seam (per-operation read). */
  async function resolveApiKey() {
    const credentials = ctx.get('credentials')
    if (credentials === undefined) return undefined
    const hit = await credentials.resolve(API_KEY_REF)
    return hit === undefined ? undefined : hit.value
  }

  /** Best-effort base URL from the llm-deepseek settings section. */
  function resolveBaseUrl() {
    try {
      const settings = ctx.get('settings')
      const cfg = settings === undefined ? undefined : settings.get('llm-deepseek')
      if (cfg && typeof cfg.baseURL === 'string' && cfg.baseURL.length > 0) {
        return cfg.baseURL.replace(/\/+$/, '')
      }
    } catch (error) {
      // settings unreadable — fall through to the public default
    }
    return PUBLIC_BASE_URL
  }

  /** Fetch and normalize the balance; cached for CACHE_MS. */
  async function fetchBalance() {
    const now = Date.now()
    if (cache.value !== null && now - cache.at < CACHE_MS) return cache.value

    const apiKey = await resolveApiKey()
    if (!apiKey || apiKey.length === 0) {
      return { ok: false, error: '未配置 DeepSeek API Key（DEEPSEEK_API_KEY）' }
    }

    const baseURL = resolveBaseUrl()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    let value
    try {
      const response = await fetch(`${baseURL}/user/balance`, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        value = { ok: false, error: `请求失败 HTTP ${response.status}` }
      } else {
        const data = await response.json()
        const infos = Array.isArray(data.balance_infos)
          ? data.balance_infos.map((info) => ({
              currency: info.currency,
              totalBalance: info.total_balance,
              grantedBalance: info.granted_balance,
              toppedUpBalance: info.topped_up_balance,
            }))
          : []
        value = { ok: true, available: data.is_available === true, infos }
      }
    } catch (error) {
      value = { ok: false, error: String((error && error.message) || error) }
    } finally {
      clearTimeout(timer)
    }

    cache = { at: Date.now(), value }
    return value
  }

  // Register the route inside an effect so the returned disposer is the
  // fiber cleanup: stopping/updating the plugin removes the route.
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      try {
        const payload = await fetchBalance()
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(payload))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: String((error && error.message) || error) }))
      }
    },
  }))
}
