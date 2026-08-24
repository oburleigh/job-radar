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
