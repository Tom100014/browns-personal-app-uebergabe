// Request timeout wrapper for Supabase clients to prevent indefinite hangs
// on slow or unreachable databases. Uses AbortController for clean cancellation.

interface AbortControllerWithTimeout extends AbortController {
  __timeoutId?: NodeJS.Timeout
}

export function createTimeoutAbortController(timeoutMs: number = 10000): AbortControllerWithTimeout {
  const controller = new AbortController() as AbortControllerWithTimeout
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  controller.__timeoutId = timeoutId
  return controller
}

export function clearTimeoutAbortController(controller: AbortControllerWithTimeout) {
  const timeoutId = controller.__timeoutId
  if (timeoutId) clearTimeout(timeoutId)
}
