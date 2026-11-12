# LeCataNi

A standalone, real-time multiplayer Catan proof of concept. React renders the client; a Node/Express and Socket.IO server owns the rules, random outcomes, lobby membership and private information. No accounts, ChatGPT integration or external database are required.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. The server listens on all network interfaces so other devices on the same network can use `http://YOUR-LAN-IP:3000` if the local firewall permits it. A localhost invite only works on the host computer; use the LAN address when copying invites for nearby devices.

For an optimized local build:

```sh
npm run build
npm start
```

Use `PORT` and `HOST` environment variables to change the port or listening interface. On PowerShell: `$env:PORT = '3001'` then `npm run dev`.

Internet deployment is deliberately not performed. The app uses one origin for HTTP and WebSocket traffic and can later run on a Node host behind an HTTPS reverse proxy with WebSocket support. Share that public origin's invite links when hosted. No email/password setup is needed for players.

## Playing

Enter a display name, create a public or private lobby, or join by invite code/link. Public rooms appear on the landing page. The creator is host and can adjust settings, remove waiting players or transfer hosting. Guests mark themselves ready; the host starts with 2–6 players. Settings changes reset guest readiness. The starting seat is chosen randomly while preserving seating order. The host can end a stalled active match and return the crew to the lobby.

Click highlighted board corners and edges during setup. In normal turns roll, trade, build, buy/play development cards, then end your turn. Seven/discard, robber and theft prompts interrupt normal actions until resolved. The server validates every action and never sends opponents' resource identities or development cards to another player.

Refresh or reconnect using the same browser to reclaim your seat. The anonymous browser token is the seat credential; clearing browser storage loses automatic access. Separate browser profiles/private sessions are needed to simulate multiple people on one machine. Multiple tabs in one browser normally represent the same player.

## Settings and variants

| Setting | Default | Meaning |
|---|---|---|
| Seats | 4 | Between 2 and 6 |
| Expanded island | Automatic at 5–6 selected seats | 30 hexes; can be disabled even for 5–6, who retain the extra resource and development cards |
| Points to win | 10 | 3–20 |
| Discard threshold | 7 | On a seven, hands above this size discard half |
| Hard hand limit | Off | Optional house rule; excess resources automatically return, taking from the largest pile first |
| Thinking time | 120 seconds | 0 disables the clock; otherwise 30–600 seconds per decision phase |
| Friendly robber | Off | Cannot move onto a hex touching an opponent with fewer than 3 visible points |
| Balanced numbers | On | Prevents adjacent 6/8 tokens |
| Player trading | On | Disable for supply/port-only trading |
| Paired turns | On | With 5–6 actual players, a second player receives an action phase without player trading |
| Map seed | Random | Reproduce terrain/number/port setup; dice and card draws remain random |

Two-player play uses ordinary core rules as a **casual house variant**, not the official neutral-settlement/trade-token two-player scenario. Choosing a small board for 5–6 is also a deliberately crowded house variant. Expanded boards and all games with 5–6 actual players use 24 cards per resource and 34 development cards; choosing the small board for 5–6 changes only the island. Timer expiry completes mandatory choices automatically and ends action phases; ordinary trades and builds do not refill the action-phase clock.

## Implemented rules

Snake-order placement and second-settlement income; settlements/cities/roads and piece limits; distance/connectivity rules; dice production and bank shortages; seven discards and robber theft; bank and port trading; negotiated player trades; all base development cards; Longest Route and Largest Army; immediate victory on your turn; larger board and paired-player turns.

## Development

```sh
npm test
npm run build
```

- `server/game.js`: game state, rules, legal targets, personalized views and timers.
- `server/index.js`: guest sessions, lobby directory, permissions, sockets and persistence.
- `src/`: React client, interactive SVG board and styles.
- `tests/`: rules and real Socket.IO multiplayer tests.
- `public/assets/`: generated illustrations used by the application.
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

The server retains authority over dice, cards, rules and state. Bot actions require the current host's designated browser connection, a controller lease, match ID and current game revision. Other clients cannot submit bot actions, and stale/duplicate moves are rejected. The server does not choose timeout moves for bots; human timeout handling still applies.

**Trust boundary:** the host's browser receives each bot's private hand so it can compute decisions. These hands are kept out of the normal UI, and each bot is evaluated separately, but the host can inspect them with developer tools. Human opponents' hands remain hidden. This design assumes a trusted friends-only host.

Implementation: `src/bots/strategy.js` contains the policy; `worker.js` evaluates masked observations; `controller.js` runs and reconnects the browser worker. Bot memory is lightweight and resets on reload/control handoff; saved matches retain the game state. Run `node scripts/simulate-bots.js` for complete headless games using the same browser policy.

There are no spectators, ranked matchmaking, account recovery or expansion scenarios beyond the configured larger base-game board. Original generated artwork is used; this is an unofficial implementation.
