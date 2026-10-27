# Bounded backend load tests

No extra npm dependencies. Requires Node with native fetch, pnpm and Docker.
Run commands from the repository root. These tests do not create payments or
playback entitlements and do not download movies.

## Local setup

```
node apps/backend/scripts/load/local.mjs setup
node apps/backend/scripts/load/local.mjs serve
```

In another terminal, after `/v1/health` responds on port 4401:

```
node apps/backend/scripts/load/local.mjs seed
node apps/backend/scripts/load/run.mjs http://127.0.0.1:4401 limiter /tmp/ct-limiter.json
```

The limiter run intentionally stops at the first 429 and returns exit code 2.
Stop `serve` with Ctrl-C. Start the capacity-only process:

```
node apps/backend/scripts/load/local.mjs serve-capacity
```

Then run:

```
node apps/backend/scripts/load/run.mjs http://127.0.0.1:4401 capacity /tmp/ct-capacity.json
```

The capacity profile uses 20-second stages at 10, 50, 100, 200 and 400 requests
per second, with a maximum of 64 in flight and 5-second timeouts. It stops on a
429, 15% errors in the last 20 completions, or a failed stage. Stage targets:
successful-response p95 <= 500 ms, errors <= 1%, dropped arrivals <= 1%.
These are initial engineering targets, not an agreed business SLA.
For a focused 30-second confirmation at 400 requests/second, use the local-only
`capacity-400` profile with the same server and fixture setup.

The workload is 40% browse, 25% search, 20% title detail, 10% authenticated
profile, 5% entitlement reads. Seeding creates 1,000 synthetic titles and one
local account; no actual customers or production data are copied. Its short-lived
fixture JWT is stored only in `/tmp/ct-load-token`, mode 0600.

`serve-capacity` disables only the per-IP guard in the disposable process.
The bootstrap refuses any other DB host/port/name, Redis URL, API port or
NODE_ENV. It does not change the production application or deployment settings.
It imports the normally compiled backend. NODE_ENV=test means development-style
pretty logging is active, which affects comparisons to production.

Cleanup after stopping the server:

```
node apps/backend/scripts/load/local.mjs cleanup
```

Only the dedicated `cinnetemple-loadtest` Compose stack is removed. PostgreSQL
uses disposable tmpfs storage; no persistent database volume is created. Shared
project/dev databases are not touched. Demo artwork in `/tmp/ct-load-media` may
be retained between runs.

## Live smoke check

```
node apps/backend/scripts/load/run.mjs https://api.cinnetemple.com live-smoke /tmp/ct-live.json
```

This sends one discovery request plus at most 30 workload requests, one per
second, maximum two in flight. The mix is 50% browse, 30% search, 20% title reads.
No token is read or sent to the live service. Sustained profiles are refused for
nonlocal targets. This is a latency/availability sample, not a production
capacity test. Do not loop it to approximate a production stress test.

## Interpreting results

Reports distinguish success latency, errors, status counts, achieved throughput,
dropped arrivals (separating generator lateness from the concurrency cap) and
requests not scheduled after early termination. Scheduling
uses fixed arrival times and skips catch-up bursts if the generator is behind.
HTTP error responses cannot improve the successful-response latency metric.
Responses must contain the expected JSON shape. Redirects are rejected.

Small samples, a single test client/account, synthetic catalogue, shared laptop
resources, test logging, connection-pool size and Docker networking all limit
capacity extrapolation. Authentication login/refresh writes, checkout, webhooks,
uploads, HLS encoding/delivery, multi-replica failover and long soaks require
separate isolated workloads. Passing these short stages is not a guarantee of
production concurrency or number of simultaneous film viewers.
