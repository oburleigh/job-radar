# Performance budgets

Job Radar measures its production build against four performance surfaces: client assets, Lighthouse
page-load quality, a browser interaction, and local HTTP and SQLite latency. Every check creates a new
temporary SQLite database with synthetic data. Provider quota, private profiles, and local discovery
history are never used.

Run the complete suite with:

```bash
pnpm test:performance
```

This builds once, then runs Size Limit, Lighthouse CI, the Playwright Web Vitals journey, and the latency
diagnostic. Individual `test:performance:*` commands build before running their named surface. The
`performance:*` variants reuse an existing build.

## Synthetic production fixture

Lighthouse, Playwright, Autocannon, and the SQLite diagnostic share the fixture launcher in
`tests/support/production-performance-server.ts`. It creates a temporary database, runs the normal setup
and migrations, and seeds one search profile with 20 structured matched jobs. The production server binds
to `127.0.0.1:3300` with a fake provider key. Cleanup removes the database when the check exits.

The rendered fixture includes `Staff Platform Engineer 01`. The browser gate asserts that heading before
recording metrics, so an empty-state page cannot produce a passing report.

## Client asset budgets

Size Limit checks `build/client/assets/*.js` and `build/client/assets/*.css`. The starting production build
produced 23 files of JavaScript totaling 390,540 raw bytes and 109,711 Brotli bytes. Its one CSS file was
53,382 raw bytes and 8,404 Brotli bytes.

The JavaScript limit is 130 kB and the CSS limit is 11 kB. Those thresholds left 20,289 bytes of
JavaScript headroom and 2,596 bytes of CSS headroom at calibration. `@size-limit/file` aggregates the
Brotli size of every matched file.

Run this surface with:

```bash
pnpm test:performance:size
```

To prove failure without touching tracked files, create a disposable JavaScript file and Size Limit config
under `/tmp`, give the file a 1 B limit, and run `pnpm exec size-limit --config <temporary-config>`. The
command must exit nonzero.

## Lighthouse page-load budget

Lighthouse audits `http://127.0.0.1:3300/` three times with the desktop preset. It uses the median
performance category score. Five calibration runs scored 1.00, so the hard 0.90 threshold left 0.10 score
headroom. A lower median fails pull-request CI.

Run this surface with:

```bash
pnpm test:performance:lighthouse
```

LHCI writes its HTML, JSON, and manifest files to `artifacts/lighthouse`. CI uploads that private artifact
even when the gate fails. The filesystem upload target avoids Lighthouse CI's public temporary storage.

## Browser interaction and Web Vitals budgets

Playwright opens the synthetic opportunity workspace in three fresh browser contexts. Each run loads the
20-job result page and changes the theme from system to light. The report uses the median of the three
runs for these budgets:

| Metric | Surface | Hard threshold | Local calibration median | Headroom |
| --- | --- | ---: | ---: | ---: |
| CLS | Result-page load and theme interaction | 0.1 | 0.00044 | 0.09956 |
| INP | Theme button interaction | 200 ms | 48 ms | 152 ms |
| LCP | Result-page load | 2,500 ms | 312 ms | 2,188 ms |

The thresholds are the `web-vitals` good-experience boundaries. Their headroom absorbs ordinary browser
and runner variance while still rejecting a user-visible regression. Pull-request CI runs the same three-run
gate. Its JSON report, Playwright trace, and failure context stay under `artifacts/browser-performance`.

Run this surface with:

```bash
pnpm test:performance:browser
```

The failure probe adds a test-only 300 ms main-thread block to the measured click:

```bash
PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm probe:performance:browser
```

The probe must exit nonzero and name INP as the failing interaction metric. It does not change the
application bundle.

## HTTP and SQLite latency evidence

Absolute timing remains scheduled evidence because hosted-runner load makes it too noisy for a merge
gate. The diagnostic uses the same 20-job fixture and records:

- 500 production `GET /?profile=1&provider=serper` requests at 10 concurrent connections, including
  request rate, p50, p97.5, p99, errors, timeouts, and non-2xx responses
- 100 calls to the production `getDashboardData` SQLite read model after 10 warm-up calls, including p50,
  p95, and p99

The first local run recorded HTTP p50 163 ms, p97.5 207 ms, and p99 220 ms with no failed responses.
SQLite recorded p50 1.689 ms, p95 2.966 ms, and p99 3.322 ms. These values are a diagnostic starting point,
not hard budgets. The scheduled GitHub Actions job owns the comparable runner history. Promote a timing to
pull-request enforcement only after repeated scheduled results show a narrow enough range to set honest
headroom.

Run this surface with:

```bash
pnpm test:performance:latency
```

The machine-readable report is `artifacts/latency/report.json`. Operational failures such as errors,
timeouts, or non-2xx responses fail the command even though the timing percentiles are diagnostic.

## Tool choices and report privacy

`web-vitals` 6.1.1 is pinned as a development dependency. It is Apache-2.0 licensed, has no runtime
dependencies, and supplies the browser definitions used for CLS, INP, and LCP. The Playwright test injects
its installed IIFE into the measured page, so no CDN or production import is involved.

Autocannon 8.0.0 is pinned as a development dependency under the MIT license. It supplies concurrent HTTP
load, percentile histograms, error counts, and JSON output. A scoped pnpm override moves Autocannon's
`hyperid > uuid` path to `uuid` 11.1.1, which removes that path's known advisory without changing unrelated
Lighthouse dependencies.

Generated reports are ignored by Git and uploaded only as private GitHub Actions artifacts:

- `artifacts/lighthouse`
- `artifacts/browser-performance`
- `artifacts/latency`

All profiling, deliberate slowdown, load generation, and report code lives in tests or scripts. None of it
is imported by the normal production build.
