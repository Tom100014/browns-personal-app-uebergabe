const REQUEST_TIMEOUT_MS = 10_000

/**
 * Supabase's client has no request timeout by default, so when the project is
 * unreachable (paused, wrong URL/key, network issue) a call can hang for a very
 * long time with nothing on screen. Every server/browser page depends on an
 * auth check before it can render, so one stalled request stalls the whole app.
 *
 * We abort via a real AbortController (not `AbortSignal.timeout`, which rejects
 * with a `TimeoutError`): postgrest-js only skips its automatic retry loop for
 * errors named `AbortError`, so using a genuine abort makes a stalled request
 * fail once and fast instead of being retried three times.
 */
export function timeoutFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const external = init?.signal
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener("abort", () => controller.abort(), { once: true })
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}
