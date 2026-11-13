# LeCataNi

A standalone, real-time multiplayer Catan proof of concept. React renders the client; a Node/Express and Socket.IO server owns the rules, random outcomes, lobby membership and private information. No accounts, ChatGPT integration or external database are required.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Development mode restarts the server when its code changes.

Open **http://localhost:3000**. The server listens on all network interfaces so other devices on the same network can use `http://YOUR-LAN-IP:3000` if the local firewall permits it. A localhost invite only works on the host computer; use the LAN address when copying invites for nearby devices.

For an optimized local build:

```sh
npm run build
npm start
```

After updating the game, stop the running production server, rebuild, run `npm start` again, and reload the game tab. Rebuilding alone updates the browser files while the running server keeps its old command handlers.

Use `PORT` and `HOST` environment variables to change the port or listening interface. On PowerShell: `$env:PORT = '3001'` then `npm run dev`.

Play online at [catan.lecani.se](https://catan.lecani.se). Use that address for public invite links. See [production deployment](deploy/README.md) for server setup and updates.

## Playing

Enter a display name, create a public or private lobby, or join by invite code/link. Public rooms appear on the landing page. The creator is host and can adjust settings, remove waiting players or transfer hosting. Guests mark themselves ready; the host starts with 2–6 players. Settings changes reset guest readiness. The starting seat is chosen randomly while preserving seating order. The host can end a stalled active match and return the crew to the lobby.

Click highlighted board corners and edges during setup. In normal turns roll, trade, build, buy/play development cards, then end your turn. Seven/discard, robber and theft prompts interrupt normal actions until resolved. The server validates every action and never sends opponents' resource identities or development cards to another player.

Refresh or reconnect using the same browser to reclaim your seat. The anonymous browser token is the seat credential; clearing browser storage loses automatic access. Separate browser profiles/private sessions are needed to simulate multiple people on one machine. Multiple tabs in one browser normally represent the same player.

After a win, inspect the point breakdown, score timeline, and key moments. **Replay** opens a shared board with a timeline of turns, actions, and key moments. Click a turn or key moment to jump to it, or drag through the actions to preview moves on your board. When you release, the shared replay jumps to that step. **Results** returns only your screen to the summary; **Join replay** catches you up to the room. Review ends when the host returns the room to the lobby. Games started before recording may only have part of their history.

Lobby and game sound effects start after your first interaction. If you need to discard on a seven, you hear a stronger warning. With the turn clock enabled, you hear one reminder when you have ten seconds left to make a decision. Use the speaker button in either header to mute or unmute sounds; your browser remembers the setting.

## Settings and variants

| Setting | Default | Meaning |
|---|---|---|
| Game mode | Individual | Choose Individual or 2v2. Teams work on every board. |
| Seats | 4 | Between 2 and 6 |
| Board | Classic for 2–4 seats; Expanded for 5–6 | Classic (19), Expanded (30), The Narrows (19: two halves joined by one land hex), or Sweden (30: a long, connected mainland with a detailed beach outline). 30-hex boards and all 5–6-player matches use expanded supplies. |
| Lock desert to center | Off | Places a desert on the hex nearest the map's center and starts the robber there. On Expanded, it uses the left middle hex and shuffles the second desert with the other tiles. |
| Points to win | 15 for 2 seats; 12 for 3; 10 for 4–6 | 3–20 |
| Team points to win | 16 | In 2v2, a combined target of 12–30 with at least 6 points per teammate |
| Discard threshold | 9 for 2 seats; 8 for 3; 7 for 4–6 | On a seven, hands above this size discard half |
| Hard hand limit | Off | Optional house rule; excess resources automatically return, taking from the largest pile first |
| Thinking time | 120 seconds | 0 disables the clock; otherwise 30–600 seconds per decision phase |
| Friendly robber | On for 2–3 seats; Off for 4–6 | Cannot move onto a hex touching an opponent with fewer than 3 visible points |
| Balanced numbers | On | Prevents adjacent 6/8 tokens |
| Unlimited Dev Cards in Bank | On | A fresh deck is shuffled when the current one runs out. Turn it off for a single deck of 25 cards (34 with expanded supplies). |
| Unlimited resource Cards in Bank | Off | All resource types stay in stock for production, trades, and Invention. |
| Player trading | On | Disable for supply/port-only trading |
| Paired turns | On | With 5–6 actual players, a second player receives an action phase without player trading |
| Map seed | Random | Reproduce terrain/number/port setup; dice and card draws remain random |

Two-player play uses ordinary core rules as a **casual house variant**, not the official neutral-settlement/trade-token two-player scenario. Choosing a small board for 5–6 is also a deliberately crowded house variant. Expanded boards and all games with 5–6 actual players use 24 cards per resource when resources are finite, and 34 cards per development deck; choosing the small board for 5–6 changes only the island. Timer expiry completes mandatory choices automatically and ends action phases; ordinary trades and builds do not refill the action-phase clock.

**2v2:** exactly four players, two on each team. The host assigns Team A or Team B beside each player, including bots. Changing teams resets guest readiness. Teams alternate turns, so partners sit two turns apart; the starting seat is still random. The first team to reach the combined target, with each teammate at 6 or more points, wins on either teammate's turn. Hidden victory cards count toward both requirements. Live team totals show visible points only; hands and hidden points remain private even from partners. Roads, ports, piece limits and awards belong to individual players. Trades use the normal rules, and the robber and Monopoly can affect teammates. Results and replays show team totals and credit both winners.

## Implemented rules

Snake-order placement and second-settlement income; settlements/cities/roads and piece limits; distance/connectivity rules; dice production and bank shortages; seven discards and robber theft; bank and port trading; negotiated player trades; all base development cards; Longest Route and Largest Army; immediate victory on your turn; larger board and paired-player turns.

## Development

```sh
npm run check
```

This runs the Node test suite and production build. Run a focused suite with `node --test tests/bot-strategy.test.js` (or another test file). The GitHub Actions workflow runs the same check on Node 22 and 24 when changes are pushed or proposed in a pull request.

For repeatable CPU checks and complete bot games:

```sh
npm run benchmark:engine
npm run benchmark:bots
npm run simulate:bots
```

Benchmarks use fixed positions, warm-up and median samples. Compare on the same machine and Node version without competing workloads; the numbers are CPU timings, not FPS or skill ratings. Both benchmark scripts accept an optional module path for a saved baseline implementation. Simulations use the real masked browser policy, including finite/unlimited stock checks. A map seed reproduces the board, not the random dice or card draws. `scripts/simulate.js` remains a compatibility entry point for the same policy.

See [the cleanup measurements](PERFORMANCE.md) for the recorded baseline comparison, validation and limits.

- [AGENTS.md](AGENTS.md): code map, focused checks and invariants for contributors and coding agents.
- `server/game.js`: game state, rules, legal targets, personalized views and timers.
- `server/index.js`: guest sessions, lobby directory, permissions, sockets and persistence.
- `shared/game-constants.js`: resource order and build costs shared by rules, UI and bot plans.
- `shared/`: common map, trade, team and replay rules; no server/browser dependencies.
- `src/`: React client, interactive SVG board and styles.
- `tests/`: rules and real Socket.IO multiplayer tests.
- `tests/helpers/socket-client.js`: shared multiplayer test connections, requests and waits.
- `public/assets/`: generated illustrations used by the application.
- `src/audio/`: recorded sound effects and [source credits](src/audio/README.md).
- `ARTWORK.md`: image prompts and provenance.
- `CONTRACT.md`: internal client/server event and state contract.

Lobbies and full matches are saved to `.runtime/lobbies.json`, excluded from source control. Restarting the server restores them, with seats marked disconnected until browsers return. Timers pause when everyone is offline and restart with a fresh decision period when someone returns. Hosting transfers after a host has been disconnected for a minute if another player is connected. Inactive rooms expire; this is a single-process PoC, not a distributed service. Do not run multiple server replicas against the same snapshot file.

## Local bots

The lobby host can select **Add bot**, choose **Easy**, **Normal** or **Hard** for each bot, and remove bots before starting. One human can play with bots; bots count toward the player limit and are always ready. Difficulty is fixed for the current match.

Bot decisions run in a Web Worker in the **host's browser**, not on the server. Keep the host's game tab open and the computer awake. Closing the controlling tab moves control to another open tab for the same host. Transferring hosting moves bot control to the new host's browser. If the host disconnects, bot decisions pause; the existing automatic host transfer selects a connected human after one minute. If all humans are offline, the match pauses. Reloading or restarting the server restores bot seats and difficulty, and browser control resumes when the host reconnects. Browsers can throttle or suspend background tabs, so keep the game visible for reliable pacing.

- **Easy:** noisy short-term choices, basic production and trading, at most one bank exchange toward a build.
- **Normal:** resource diversity, routes to new settlements, goal-aware discards, more selective player trades, and up to two bank exchanges toward a build.
- **Hard:** longer route evaluation, leader-aware robber/trade choices, late-game road competition, and up to five bank exchanges toward a build.

These are heuristic difficulty levels, not calibrated skill ratings or full Monte Carlo search. All levels can play a complete game, including setup, discards, robber/theft, development cards, bank/port trades, player trades and paired turns. Bot offers give players six seconds to respond. Bots use only their own masked game view; the difficulty never grants extra resources or knowledge.

Bots compare affordable builds with complete bank-exchange plans and keep the chosen build's ingredients through the exchanges. Normal and Hard preserve affordable settlements or cities when discarding if the remaining hand can hold the full cost. Immediate winning builds take priority over playing another development card. Idle workers wait for a new game revision or their trade deadline instead of polling unchanged positions.

The server retains authority over dice, cards, rules and state. Bot actions require the current host's designated browser connection, a controller lease, match ID and current game revision. Other clients cannot submit bot actions, and stale/duplicate moves are rejected. The server does not choose timeout moves for bots; human timeout handling still applies.

**Trust boundary:** the host's browser receives each bot's private hand so it can compute decisions. These hands are kept out of the normal UI, and each bot is evaluated separately, but the host can inspect them with developer tools. Human opponents' hands remain hidden. This design assumes a trusted friends-only host.

Implementation: `src/bots/strategy.js` contains the policy; `worker.js` evaluates masked observations; `controller.js` runs and reconnects the browser worker. Bot memory is lightweight and resets on reload/control handoff; saved matches retain the game state. Run `npm run simulate:bots` for complete headless games using the same browser policy.

Bots recognize teammates when considering trades, robber targets, Monopoly and competing for awards. They still use only their own masked view. These team heuristics are not a coordinated planning system.

There are no spectators, ranked matchmaking, account recovery or ship-based expansion scenarios. Original generated artwork is used; this is an unofficial implementation.
