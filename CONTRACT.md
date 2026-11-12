# Shared implementation contract

Local standalone Vite + React, Express + Socket.IO. ES modules JavaScript. Root owns package.json, server/index.js and integration tests/docs. Engine agent owns server/game.js and tests/game.test.js. UI agent owns index.html, vite.config.js, src/*. Assets agent owns public/assets and ARTWORK.md only.

## Socket protocol
All commands acknowledge `{ok:true, ...}` or `{ok:false,error:string}`. Browser generates UUID token, persists localStorage, passes handshake auth `{token}`; server owns player identity derived from token. Events:
- `directory` array public lobby summaries `{id,name,hostName,playerCount,maxPlayers,status,settings}`
- `lobby` full current lobby `{id,name,isPrivate,hostId,players:[{id,name,color,connected,ready}],settings,status,game: personalizedGameOrNull}`
- `createLobby` payload `{name,playerName,isPrivate,settings}` -> ack `{ok,id}`
- `joinLobby` `{id,playerName}`
- `leaveLobby` `{}`
- `configureLobby` `{name,isPrivate,settings}` host only
- `setReady` `{ready}`
- `startGame` `{}` host only (2+ players, others ready)
- `gameAction` `{type,...payload}` invokes action(game, playerId,type,payload)
- `chat` `{text}` -> broadcast `chatMessage` `{id,name,text,at}`; lobby contains `messages` array
- `returnToLobby` `{}` host only after finished
- `abandonGame` `{}` host only, ends an active match and returns all players to waiting lobby
- `kickPlayer` `{playerId}` host only waiting lobby
- `transferHost` `{playerId}` host only
- `getDirectory` `{}`
- `addBot` `{difficulty?:'easy'|'normal'|'hard'}` host only, waiting lobby; defaults to Normal
- `configureBot` `{playerId,difficulty}` host only, waiting lobby; `kickPlayer` removes a bot
- Bot lobby players include `{isBot:true,difficulty,ready:true,connected:false}`. Bots never host or own browser sessions. Readiness and presence checks treat bot seats separately from humans.
- `botState` server event sent only to the first connected socket belonging to the current host: `{lobbyId,matchId,lease,revision,bots:[{id,difficulty,game:personalizedBotView}]}`; other sockets receive `null`. A stopped match also sends `null`. Controller leases change on socket/host/match changes and are not persisted.
- `botAction` `{botId,matchId,lease,revision,action:{type,...payload}}` accepted only from the designated host socket for a current bot seat; the normal rules engine validates it atomically. Every committed game action/timer transition increments the revision. Repeated and stale requests are rejected.
- `syncBots` `{}` host only; resends current lobby and bot observations after an uncertain acknowledgement.
- Lobby snapshots include `botsPaused` when bots exist and the host has no connected browser. Normal `game` snapshots never reveal bot hands. Bot observations expose only the particular bot's private hand; they are never sent to guests or other host tabs.
- server emits `session` `{playerId}` on connection; personalized lobby also includes `meId`

## Settings
`maxPlayers` default 4 range 2–6. `extendedBoard` default false automatically true when maxPlayers becomes 5/6 unless explicitly provided; host can disable. `victoryPoints` default 10 range 3–20. `discardThreshold` default 7 range 3–30. `hardHandLimit` default 0 (off), range 0–50, optional variant excess auto returns deterministically. `turnSeconds` default 120 (0 unlimited), range 0 or 30–600. `friendlyRobber` default false prevents robbing players below 3 visible points. `balancedNumbers` default true. `allowPlayerTrading` default true. `pairedTurns` default true for 5/6, false effect below 5; use modern paired second action phase no player trades. `seed` optional string for reproducible board.

## Engine API (server/game.js)
Exports `createGame(players,settings)`, `action(game,playerId,type,payload={})`, `viewGame(game,playerId)`, `tick(game,now=Date.now(),excludedPlayers=[])`. Mutate game in action/tick, throw Error for invalid. tick returns boolean changed. The server excludes bot IDs from timeout decisions, including mixed human/bot discards. Engine keeps plain JSON serializable state. Players have id,name,color. No socket dependencies.

## Game state exposed to client
`phase`: setupSettlement | setupRoad | roll | action | discard | robber | steal | finished.
`activePlayerId`, `turn`, `deadline` ms|null, `winnerId`, `dice` [int,int]|null, `robberHexId`, `longestRoadHolder`, `largestArmyHolder`, `log` [{text,at}], `settings`, `pairedPlayer` boolean.
`board`: `{hexes:[{id,x,y,terrain,number,vertexIds,edgeIds}],vertices:[{id,x,y,hexIds,edgeIds,neighborIds,building:null|{owner,type:'settlement'|'city'},port:null|'any'|'wood'|'brick'|'wool'|'wheat'|'ore'}],edges:[{id,a,b,owner:null|string}]}`. Hex radius 60, pointy top; x/y any values (UI calculates bounding box). Terrain values wood,brick,wool,wheat,ore,desert.
`players`: [{id,name,color,resources:{wood,brick,wool,wheat,ore}|null,resourceCount,development:[{id,type,turnBought}]|null,developmentCount,knights,roadsLeft,settlementsLeft,citiesLeft,score,visibleScore,longestRoad}]. Only self resources/cards/true score visible.
`bank` resource counts, `developmentRemaining`, `discardRequired` object playerId -> count, `stealTargets` player IDs, `tradeOffers` array of {id,from,give:resourceMap,want:resourceMap,declinedBy?:playerIds}, `roadBuildingRemaining` count, `developmentPlayed` bool. The sender sees `declinedBy`; a recipient who declines stops seeing that offer.
`legal`: {settlements:[vertexId],roads:[edgeId],cities:[vertexId],robberHexes:[hexId]} personalized for self for current phase. Setup/normal legality populated; normal action arrays may include targets regardless affordability; UI checks affordability or displays errors.

Actions `placeSettlement` {vertexId}, `placeRoad` {edgeId}, `upgradeCity` {vertexId}, `rollDice`, `endTurn`, `buyDevelopment`, `playDevelopment` {cardId,resource?,resources?:resourceMap}, `discard` {resources:resourceMap}, `moveRobber` {hexId}, `steal` {targetId}, `bankTrade` {give:resourceName,receive:resourceName,amount?:number} amount number received default 1, `offerTrade` {give:resourceMap,want:resourceMap}, `acceptTrade` {offerId}, `declineTrade` {offerId}, `cancelTrade` {offerId}.

The active player can open up to six player offers during a normal action phase. The first eligible recipient to accept a given offer completes it. Recipients can decline an open offer at any point in the sender's turn, including while the sender resolves the robber. Declining hides that offer for the recipient; it closes once everyone declines. Only the sender can withdraw. Offers do not reserve cards and close when the sender can no longer afford them or the turn ends.

Use `/assets/terrain-atlas.png` AI raster sheet 3 columns × 2 rows wood, wheat, wool / brick, ore, desert; use SVG image positioned and clipped per hex, or CSS background-position card illustrations. `/assets/island-hero.png` scenic landing image. Assets may arrive later; gradient fallbacks during implementation. UI warm cream parchment, dark teal sea, brass gold, muted realistic painterly illustrations. Full-screen lobby landing and spacious game board. No ChatGPT integration.
