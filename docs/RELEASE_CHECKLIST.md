# Release Checklist

## Required gates

- `npm ci`
- `npm audit --audit-level=moderate`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`

The GitHub Actions `Quality Gates` workflow runs the same checks on pull requests and pushes to `main`.

## Monitoring

- Browser Web Vitals (CLS, FCP, INP, LCP, TTFB) are sent to `/api/monitoring/web-vitals`.
- Set `NEXT_PUBLIC_WEB_VITALS_ENDPOINT` to route metrics to a compatible external collector instead.
- Query strings and URL fragments are removed from metric payloads.
- Unhandled Next.js request errors are emitted as structured `[monitoring:request-error]` logs.
- Configure a production log drain and alerts; the built-in endpoint logs metrics but does not provide long-term storage or alerting.

## Data windows

- Payroll reports load the 12 calendar months exposed by the month selector.
- The interactive schedule loads 12 months of history and 18 months of future shifts and overlapping absences.
- Dashboard detail lists are capped at three records while exact database counts remain visible.

## Dependency override

`next@15.5.20` pins `postcss@8.4.31`, which is affected by GHSA-qx2v-qp2m-jg93. The package override moves only Next's nested PostCSS copy to the minimum fixed `8.5.10` release.

Residual risk: this is a same-major override outside Next's pinned dependency version, so it should be removed once Next directly includes PostCSS 8.5.10 or newer. Production build, unit tests, E2E tests, and `npm audit` are release gates for the override.

`shadcn` is pinned to `3.8.3` (CLI-only, never imported by app code) instead of the vulnerable `4.x` line, and `@hono/node-server` is overridden to `^2.0.11` because no published `@modelcontextprotocol/sdk` release (a transitive dependency of shadcn's own `mcp` subcommand) depends on a patched version yet. Remove the override once one does.

## Accepted `npm audit` exception

`sharp` (pulled in only by Next's optional image-optimization pipeline) currently has 2 high-severity findings (GHSA-f88m-g3jw-g9cj) with no safe fix: the only available resolution force-downgrades `next` from `15.5.20` to `14.2.35`, which was verified to introduce 14 *new* advisories (DoS, XSS, cache poisoning, SSRF, request smuggling) that `15.5.20` already has patched, plus an unresolved `react-dom` peer conflict against this project's React 19. That trade is a regression, not a fix.

The `Dependency audit` step in the `Quality Gates` workflow therefore runs with `continue-on-error: true` until `sharp`/Next ship a patched release — every other gate (lint, typecheck, tests, build, E2E) stays blocking. Re-run `npm audit --audit-level=moderate` manually before each release to confirm the finding count hasn't grown, and drop `continue-on-error` the moment it's clean again.
