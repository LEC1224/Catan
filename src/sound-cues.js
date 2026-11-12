import { openTradeOffers } from "../shared/trades.js";

const AWARDS = new Set(["longestRoute", "largestArmy"]);

// A new subscription starts from its first snapshot, without playing history.
export function lobbySoundCues(previous, lobby) {
  if (!previous) return [];
  if (!lobby) return ["leave"];
  if (previous.id !== lobby.id) return [];

  if (lobby.game) {
    if (!previous.game || previous.matchId !== lobby.matchId) return ["start"];
    return gameSoundCues(previous.game, lobby.game, lobby.meId);
  }
  if (previous.game) return ["leave"];

  const roster = new Map(previous.players.map((player) => [player.id, player]));
  if (lobby.players.some((player) => !roster.has(player.id))) return ["join"];
  if (lobby.players.length < previous.players.length) return ["leave"];
  if (lobby.players.some((player) => player.ready && !roster.get(player.id).ready)) return ["ready"];
  return [];
}

function gameSoundCues(previous, game, meId) {
  const cursor = previous.log.at(-1)?.seq ?? 0;
  const moves = game.log.filter(({ seq, cue }) => seq > cursor && cue).map(({ cue }) => cue);
  if (game.winnerId && game.winnerId !== previous.winnerId) {
    // A winning move can also claim an award. Give it a beat before the result.
    return [...new Set(moves.filter((cue) => AWARDS.has(cue))), game.winnerId === meId ? "won" : "finished"];
  }

  const mustDiscard = game.discardRequired?.[meId] > 0;
  const discarded = previous.discardRequired?.[meId] > 0 && !mustDiscard;
  const cues = [];
  for (const cue of moves) {
    if (cue === "diceSeven") cues.push("dice", mustDiscard ? "discardWarning" : "seven");
    else if (cue !== "discard" || (discarded && !cues.includes("discard"))) cues.push(cue);
  }

  const myTurnStarted = game.activePlayerId === meId && (
    previous.activePlayerId !== meId || game.turn !== previous.turn ||
    (previous.phase === "setupRoad" && game.phase === "setupSettlement")
  );
  const gainedCards = moves.some((cue) => cue === "dice" || cue === "cardPlay" ||
    (cue === "settlement" && previous.phase === "setupSettlement"));
  const handSize = (state) => state.players.find((player) => player.id === meId)?.resourceCount ?? 0;
  if (myTurnStarted) cues.push("turn");
  else if (gainedCards && handSize(game) > handSize(previous)) cues.push("resources");
  if (cues.length) return cues;

  const previousOffers = new Set(openTradeOffers(previous).map((offer) => offer.id));
  if (openTradeOffers(game).some((offer) => !previousOffers.has(offer.id))) return ["offer"];
  return [];
}

export function decisionSoundDeadline(game, meId) {
  if (!game?.deadline || !meId || game.phase === "finished") return null;
  const owesDecision = game.phase === "discard" ? game.discardRequired?.[meId] > 0 : game.activePlayerId === meId;
  return owesDecision ? game.deadline : null;
}
