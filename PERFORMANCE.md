# Cleanup and performance check — 2026-11-13

Baseline: `0daf91d`. Measurements below compare that implementation with the cleanup through `d8705e6`, on the same Windows machine with Node.js 24.19.0. Runs were sequential after tests/build completed. These are local CPU microbenchmarks, not network latency, frame rate, or bot win-rate measurements.

## Measured results

| Metric | Before | After | Change |
|---|---:|---:|---:|
| 4-player command candidate, Classic | 1.0653 ms | 0.4884 ms | 54.2% less CPU time |
| 6-player command candidate, Expanded | 1.4776 ms | 0.7490 ms | 49.3% less CPU time |
| Hard-bot decision, fixed observations | 124.16 µs | 87.30 µs | 29.7% less CPU time |
| Worker evaluations over 60 seconds without a revision | 61 | 1 | 98.4% fewer |
| Full game copies per server command | 2 | 1 | 50% fewer |
| Full game copies per idle timer poll | 1 | 0 | Eliminated |
| Chat history height at 1280×720 | 15 px | 119 px | Messages readable without opening a larger window |
| Passing tests | 83 | 112 | 29 added (+34.9%) |

The engine benchmark constructs developed boards with 35/44 owned roads, warms each case, and reports the median of seven samples of 500 iterations. A candidate includes the isolation needed by the server; the old path cloned before calling the engine's already-atomic action. The bot benchmark uses 24 fixed masked observations and seven samples of 7,200 decisions. Timing varies by machine and background load; a second run need not reproduce the exact percentages.

Idle-worker counts come from the fake-timer controller regression. Copy counts come from server integration tests. Static artwork is also reused by match: ordinary updates no longer rerun either scenery generator or format the 228/360 repeated polygon coordinates. Live buildings, roads and robber still update from each observation.

## Cleanup and behavior

- Five Socket.IO test connection implementations now share one helper.
- Server, UI and bots share resource order and build costs.
- The old simulation entry point delegates to the actual bot policy, removing 97 net lines of duplicate logic while preserving its API/CLI.
- Bots consider complete exchanges toward valuable builds, finish those plans, prefer immediate winning builds, and preserve affordable scoring builds when discarding.
- Chat retains drafts edited during acknowledgements. Chat and game commands reject overlapping submissions instead of queuing stale actions.
- `AGENTS.md` maps code to targeted tests and documents privacy, persistence, timer, bot and render-cache invariants. `npm run check` and CI provide the standard validation path.

## Verification and limits

`npm run check` passed all 112 tests and the production build, including nine complete bot games across individual/team variants. Route scoring was checked against an exhaustive oracle for 540 player networks over all four maps. Additional development comparisons matched the baseline at 720 engine positions and 3,040 personalized views.

Browser smoke testing covered Sweden setup, live settlements/roads, zoom/reset, automatic bot turns, six-second trade expiry, human dice, chat delivery, reconnect after reload, and the corrected chat layout. No console warnings/errors were observed. Delayed-acknowledgement behavior is covered by the action/controller tests and code review; it was not tested with a throttled browser network.

The main JavaScript bundle changed from 442.88 to 443.52 kB (gzip 136.90 to 137.14 kB); the worker changed from 9.43 to 10.69 kB. This work improves runtime behavior and correctness, not download size. Hosted CI is configured for Node 22 and 24 but was not run remotely. No deployment or push was performed.

To repeat CPU checks, use `npm run benchmark:engine` and `npm run benchmark:bots`. Both scripts accept an optional module path for a baseline saved beside the corresponding source file, preserving its relative imports. Remove temporary baseline files afterward. Use full simulations to check legality/liveness; map seeds alone do not make crypto dice and deck draws deterministic.
