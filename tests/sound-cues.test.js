import test from "node:test";
import assert from "node:assert/strict";
import { action, createGame, tick, viewGame } from "../server/game.js";
import { decisionSoundDeadline, lobbySoundCues } from "../src/sound-cues.js";

const host = { id: "host", name: "Ada", color: "#ce6849", ready: true, connected: true };
const guest = { id: "guest", name: "Birch", color: "#3b8292", ready: false, connected: true };
const room = { id: "room", meId: host.id, players: [host, guest], game: null };
const snapshot = (game, meId = host.id) => ({ ...room, matchId: "match", meId, game: viewGame(game, meId) });

test("lobby cues follow roster and ready changes without replaying on reconnect", () => {
  const alone = { ...room, players: [host] };
  const ready = { ...room, players: [host, { ...guest, ready: true }] };
  const disconnected = { ...ready, players: [host, { ...guest, ready: true, connected: false }] };
  const playing = snapshot(createGame(room.players));

  assert.deepEqual(lobbySoundCues(alone, room), ["join"]);
  assert.deepEqual(lobbySoundCues(room, ready), ["ready"]);
  assert.deepEqual(lobbySoundCues(ready, disconnected), []);
  assert.deepEqual(lobbySoundCues(disconnected, ready), []);
  assert.deepEqual(lobbySoundCues(ready, alone), ["leave"]);
  assert.deepEqual(lobbySoundCues(ready, playing), ["start"]);
  assert.deepEqual(lobbySoundCues(null, playing), []);
});

test("confirmed placements are heard once, even when a full activity log is trimmed", () => {
  const game = createGame(room.players);
  // Existing saves may have a full activity log without sequence numbers.
  game.log = Array.from({ length: 120 }, () => ({ text: "Previous move", at: 0 }));
  const before = snapshot(game);
  const [vertexId] = before.game.legal.settlements;
  action(game, host.id, "placeSettlement", { vertexId });
  const afterSettlement = snapshot(game);
  assert.equal(afterSettlement.game.log.length, before.game.log.length);
  assert.deepEqual(lobbySoundCues(before, afterSettlement), ["settlement"]);
  assert.deepEqual(lobbySoundCues(afterSettlement, snapshot(game)), []);

  const waitingGuest = snapshot(game, guest.id);
  assert.throws(() => action(game, guest.id, "placeRoad", { edgeId: "invalid" }), /Wait/);
  assert.deepEqual(lobbySoundCues(waitingGuest, snapshot(game, guest.id)), []);

  const [edgeId] = afterSettlement.game.legal.roads;
  action(game, host.id, "placeRoad", { edgeId });
  assert.deepEqual(lobbySoundCues(afterSettlement, snapshot(game)), ["road"]);
  assert.deepEqual(lobbySoundCues(waitingGuest, snapshot(game, guest.id)), ["road", "turn"]);
});

test("automatic dice rolls have a cue even when the timer moves straight to the next turn", () => {
  const game = createGame(room.players, { turnSeconds: 30 });
  game.phase = "roll";
  game.turn = 1;
  const before = snapshot(game, guest.id);
  assert.ok(tick(game, game.deadline));
  const cues = lobbySoundCues(before, snapshot(game, guest.id));
  if (game.phase === "robber") {
    assert.deepEqual(cues, ["dice", "seven"]);
  } else {
    assert.equal(game.dice, null);
    assert.deepEqual(cues, ["dice", "turn"]);
  }
});

test("new offers and completed trades have distinct cues; declining and withdrawing are silent", () => {
  const game = createGame(room.players);
  game.phase = "action";
  game.players[0].resources.wood = 1;
  game.bank.wood--;
  game.players[1].resources.wheat = 1;
  game.bank.wheat--;
  const beforeHost = snapshot(game, host.id);
  const beforeGuest = snapshot(game, guest.id);
  const offer = { give: { wood: 1 }, want: { ore: 1 } };
  action(game, host.id, "offerTrade", offer);
  const offered = snapshot(game, guest.id);
  assert.deepEqual(lobbySoundCues(beforeHost, snapshot(game, host.id)), ["offer"]);
  assert.deepEqual(lobbySoundCues(beforeGuest, offered), ["offer"]);
  action(game, host.id, "offerTrade", { ...offer, want: { wheat: 1 } });
  const both = snapshot(game, guest.id);
  assert.deepEqual(lobbySoundCues(offered, both), ["offer"]);
  action(game, guest.id, "declineTrade", { offerId: game.tradeOffers[0].id });
  const declined = snapshot(game, guest.id);
  assert.deepEqual(lobbySoundCues(both, declined), []);
  action(game, host.id, "cancelTrade", { offerId: game.tradeOffers[0].id });
  assert.deepEqual(lobbySoundCues(declined, snapshot(game, guest.id)), []);
  action(game, host.id, "offerTrade", { ...offer, want: { wheat: 1 } });
  const beforeDeal = snapshot(game, guest.id);
  action(game, guest.id, "acceptTrade", { offerId: game.tradeOffers[0].id });
  assert.deepEqual(lobbySoundCues(beforeDeal, snapshot(game, guest.id)), ["trade"]);
});

test("only players who owe a discard hear the urgent seven warning and their card return", () => {
  const game = createGame(room.players, { turnSeconds: 30 });
  game.phase = "roll";
  const beforeHost = snapshot(game);
  const beforeGuest = snapshot(game, guest.id);
  assert.equal(decisionSoundDeadline(beforeHost.game, host.id), game.deadline);
  assert.equal(decisionSoundDeadline(beforeGuest.game, guest.id), null);

  game.phase = "discard";
  game.dice = [4, 3];
  game.discardRequired = { [guest.id]: 4 };
  game.players[1].resources.wood = 8;
  game.bank.wood -= 8;
  game.log.push({ text: "Ada rolled 7.", at: 0, seq: game.log.at(-1).seq + 1, cue: "diceSeven" });
  const waiting = snapshot(game);
  const mustDiscard = snapshot(game, guest.id);
  assert.deepEqual(lobbySoundCues(beforeHost, waiting), ["dice", "seven"]);
  assert.deepEqual(lobbySoundCues(beforeGuest, mustDiscard), ["dice", "discardWarning"]);
  assert.deepEqual(lobbySoundCues(mustDiscard, snapshot(game, guest.id)), []);
  assert.equal(decisionSoundDeadline(waiting.game, host.id), null);
  assert.equal(decisionSoundDeadline(mustDiscard.game, guest.id), game.deadline);

  action(game, guest.id, "discard", { resources: { wood: 4 } });
  assert.deepEqual(lobbySoundCues(mustDiscard, snapshot(game, guest.id)), ["discard"]);
  assert.deepEqual(lobbySoundCues(waiting, snapshot(game)), []);
});

test("a road placement that claims Longest Route plays the award for the whole table once", () => {
  const game = createGame(room.players);
  game.phase = "action";
  const { board } = game;
  function walk(at, seen) {
    if (seen.size === 6) return [];
    const vertex = board.vertices.find((candidate) => candidate.id === at);
    for (const edgeId of vertex.edgeIds) {
      const edge = board.edges.find((candidate) => candidate.id === edgeId);
      const next = edge.a === at ? edge.b : edge.a;
      if (seen.has(next)) continue;
      const rest = walk(next, new Set([...seen, next]));
      if (rest) return [edge, ...rest];
    }
  }
  const start = board.vertices[0].id;
  const path = walk(start, new Set([start]));
  for (const edge of path.slice(0, 4)) edge.owner = host.id;
  game.players[0].resources.wood = 1;
  game.players[0].resources.brick = 1;
  game.bank.wood--;
  game.bank.brick--;
  const before = snapshot(game, guest.id);
  action(game, host.id, "placeRoad", { edgeId: path[4].id });
  const claimed = snapshot(game, guest.id);
  assert.deepEqual(lobbySoundCues(before, claimed), ["road", "longestRoute"]);
  assert.deepEqual(lobbySoundCues(claimed, snapshot(game, guest.id)), []);
});

test("a winning Largest Army transfer announces the award before the result", () => {
  const game = createGame(room.players, { victoryPoints: 3 });
  game.phase = "action";
  game.turn = 2;
  game.board.vertices[0].building = { type: "settlement", owner: host.id };
  game.largestArmyHolder = guest.id;
  game.players[0].knights = game.players[1].knights = 3;
  game.players[0].development.push({ id: "knight", type: "knight", turnBought: 1 });
  const beforeHost = snapshot(game);
  const beforeGuest = snapshot(game, guest.id);
  action(game, host.id, "playDevelopment", { cardId: "knight" });
  assert.deepEqual(lobbySoundCues(beforeHost, snapshot(game)), ["largestArmy", "won"]);
  assert.deepEqual(lobbySoundCues(beforeGuest, snapshot(game, guest.id)), ["largestArmy", "finished"]);
});
