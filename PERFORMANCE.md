# Production asset budgets

Size Limit checks the client files emitted by `pnpm build` under
`build/client/assets`. The configured paths are `build/client/assets/*.js` and
`build/client/assets/*.css`. Server output, source files, development bundles,
and network activity are outside this slice.

## Baseline and thresholds

The starting measurement used the current production client fixture: a local
production build of this checkout with `build/client/assets` as the measured
surface. It produced 23 files of JavaScript totaling 390,540 raw bytes and
109,711 Brotli bytes. The CSS output was one file totaling 53,382 raw bytes
and 8,404 Brotli bytes.

Size Limit allows 130 kB for all production JavaScript and 11 kB for production
CSS. The limits leave 20,289 bytes of JavaScript headroom and 2,596 bytes of
CSS headroom against that fixture. This permits ordinary build variation while
making a material client-asset increase fail before release.

`@size-limit/file` expands each configured path and aggregates the Brotli size
of every matched file. Brotli is the plugin default, so the limits apply to the
sum of individually Brotli-compressed production assets rather than raw files
or a single concatenated bundle.

## Running the check

Run the full local check with:

```bash
pnpm test:performance:size
```

It builds the production client, then runs `pnpm performance:size`. CI runs
`pnpm performance:size` immediately after its existing `pnpm build` step, so
the same already-built client assets are checked without a second build.

To prove the failure behavior without changing this repository, create a
disposable JavaScript file and Size Limit configuration under `/tmp`, set a
1 B limit for that file, and run `pnpm exec size-limit --config <temporary
config>`. The command must exit nonzero. Remove the temporary files afterward.

Lighthouse, browser-interaction and web-vitals budgets, server-latency checks,
Autocannon, React Profiler, and React Scan belong to later slices.

## Lighthouse root-page budget

Lighthouse audits `http://127.0.0.1:3300/` after `pnpm build`. The launcher creates a fresh temporary
SQLite fixture, sets the non-secret `SERPER_API_KEY=lighthouse-fixture-key`, runs the existing database
setup, and starts the existing production server. It uses neither the port-3000 development server nor
the user's local database.

The committed check runs Lighthouse three times with the desktop preset and uses the median performance
category score. The five-run calibration on this fresh fixture scored 1.00 on every run, so its range and
median were both 1.00. The 0.90 hard threshold leaves 0.10 score headroom for normal local and CI variance
while rejecting a clear page-load regression.

Run it locally with:

```bash
pnpm test:performance:lighthouse
```

CI runs the check after the production build and Size Limit gate. LHCI writes HTML, JSON, and manifest
diagnostics to `artifacts/lighthouse` using filesystem upload only; GitHub Actions retains that directory
as an artifact even when the gate fails. A median performance score below 0.90 fails the command. Absolute
timing metrics remain diagnostic only in this slice because their machine-level variance needs a later policy.
