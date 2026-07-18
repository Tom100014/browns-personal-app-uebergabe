import type { Instrumentation } from "next"
import { sanitizeMonitoringPath } from "@/lib/monitoring"

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const details = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: "UnknownError", message: String(error) }

  console.error("[monitoring:request-error]", JSON.stringify({
    ...details,
    method: request.method,
    path: sanitizeMonitoringPath(request.path),
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    timestamp: new Date().toISOString(),
  }))
}
