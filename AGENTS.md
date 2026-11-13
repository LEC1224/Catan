# Working on LeCataNi

## Start here

Read `README.md` for running/playing the game and `CONTRACT.md` before changing events or public state. Check `git status --short` before edits; preserve unrelated work. This is an ESM JavaScript project with React, Vite, Express, Socket.IO and Node's built-in test runner. No transpilation or browser globals are required for rules and strategy tests.

## Commands

- `npm ci`: install the locked dependencies (Node.js 22+).
- `npm run dev`: game and Vite on port 3000, with server restart and client hot reload.
- `npm run check`: all tests, then the production build.
- `node --test tests/game.test.js`: a focused test file; pass multiple file paths as needed.
- `npm run simulate:bots`: complete 2/4/6-player games using the actual bot policy.
- `npm run benchmark:engine` / `npm run benchmark:bots`: repeatable CPU fixtures. Record Node version and compare on the same machine without competing workloads. These measure decision/candidate latency, not frame rate or bot win rate.
- `npm run build` then `npm start`: production assets and server. Restart the server after server-side changes; rebuilding alone does not reload it.

Tests create ephemeral local servers and temporary snapshots. For manual exploration, use a separate port and `createAppServer({ port: 3001, production: true, persistence: false })` so you do not overwrite real `.runtime` lobbies. Do not commit `.runtime`, `dist`, benchmark scratch files, or generated logs.

## Code map

| Change | Main locations | Relevant checks |
|---|---|---|
| Rules, legal moves, scores, privacy | `server/game.js` | `game`, `engine-transactions`, `engine-graph`, `card-deals`, `teams` tests |
| Lobby/socket authority, persistence, timers | `server/index.js` | `server`, `server-performance`, `lifecycle`, `bots` tests |
| Bot decisions | `src/bots/strategy.js` | `bot-strategy`, `bots`, `teams` tests and bot simulation |
| Bot scheduling and browser ownership | `src/bots/controller.js`, `worker.js` | `bot-controller`, `bots` tests |
| Maps and board geometry | `shared/board-maps.js`, `src/board-layout.js`, `src/match-board.jsx` | `board-maps`, `board-layout` tests and visual inspection |
| Match controls and dialogs | `src/main.jsx`, `src/match-*.jsx` | production build; affected rule tests; browser interaction |
| Lobby and chat | `src/lobby.jsx`, `src/chat.jsx` | production build; browser interaction |
| Results and replay | `server/match-recording.js`, `shared/match-replay.js`, `src/match-results.jsx`, `src/match-replay.jsx` | `match-results`, `teams` tests |
| Shared rules and names | `shared/` | engine, strategy and client checks for all consumers |

Test entries above omit `.test.js`; use paths under `tests/`. Shared Socket.IO test connections, acknowledgement calls and bounded waits live in `tests/helpers/socket-client.js`. Extend that helper instead of copying connection setup into another suite.

## Invariants that matter

- The server owns rules, random outcomes, resource supply and hidden information. `nextGame` returns an isolated successful candidate; `action` commits that candidate in place. Invalid commands must leave state, recording and bot revision unchanged. Preserve this boundary when optimizing.
- Game state stays plain JSON, round-trippable through persistence. Keep caches outside it. Board vertex/edge IDs are stable, but old saves and tests may reorder arrays; lookups must still resolve by ID.
- `viewGame` is the privacy boundary. Only self hands/development cards/true scores are visible until the match ends. Bot policy receives one masked observation at a time. Never use authoritative opponent hands to make a bot smarter.
- Bots run in a browser worker. Only the designated host tab's current lease, match ID and revision may submit moves. Reconcile uncertain acknowledgements before retrying; discard stale worker results. Server timers must exclude bots, including mixed human/bot discards. Idle decisions sleep until the next revision; any policy that becomes actionable with elapsed time must expose its wake deadline to the evaluator (`retryAfter`).
- A map seed fixes board layout, not crypto dice, deck draws or steals. Full simulations are legality/liveness checks, not deterministic skill comparisons.
- Unlimited resource stock is `null`, not zero. Use `resourceStock` from `shared/trades.js`; finite stock conservation tests must account for this variant.
- Shared cost tables and resource order belong in `shared/`. Avoid importing server modules into the browser. Use existing trade/team/map helpers before adding another rule implementation.
- Terrain, ports and coordinates are static within a match; buildings, roads, robber and legal targets are live. A render cache must not freeze live board state or leak across matches.
- Update `CONTRACT.md` when changing events, payloads or engine APIs. Update README behavior when changing player-visible rules. Add regression tests for rule, privacy, concurrency or strategy changes, not tests that merely restate constants.

## Product UI and copy

- Build functional interfaces, not promotional landing pages, unless marketing content is explicitly requested. Use familiar control names such as "Players" and "Create lobby"; avoid slogans and themed euphemisms.
- Make actions and state clear through layout, hierarchy, familiar controls, and accessible labels. Fix confusing interaction design before adding explanation.
- Keep visible copy only when it helps identify, act, decide, or understand a real rule, consequence, error, or empty state. Necessary explanations should be concrete and complete.

## Git and infrastructure

- Create one atomic local commit per feature or fix. Include only its changes; preserve the user's unrelated edits. Use a specific subject and a detailed body explaining what, why, verification and relevant limits. Keep commits local; push only on explicit request.
- When working in parallel, stage explicit paths and avoid including another worker's edits. Never reset or clean their work.
- When interacting with Cloudflare, use the `cf` CLI unless the project has a Wrangler configuration file. This repository currently uses the Node deployment described in `deploy/README.md`.
- Persistence is single-process. Do not run replicas against the same snapshot file.
