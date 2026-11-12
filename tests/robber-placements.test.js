import test from "node:test";
import assert from "node:assert/strict";
import { createGame, viewGame } from "../server/game.js";
import { robberPlacement } from "../src/robber-placements.js";

test("robber guidance distinguishes destinations, protected tiles and the current tile", () => {
  const game = createGame([{ id: "active" }, { id: "opponent" }], { friendlyRobber: true, seed: "robber-guide" });
  const target = game.board.hexes.find((hex) => hex.id !== game.robberHexId);
  game.board.vertices.find((vertex) => vertex.id === target.vertexIds[0]).building = { owner: "opponent", type: "settlement" };
  game.players[1].visibleScore = 2;
  game.phase = "robber";

  const view = viewGame(game, "active");
  const guide = robberPlacement(view, "active");
  assert.equal(guide.friendly, true);
  assert.equal(guide.state(game.robberHexId), "occupied");
  assert.equal(guide.state(target.id), "protected");
  assert.ok(view.legal.robberHexes.length > 0);
  for (const id of view.legal.robberHexes) assert.equal(guide.state(id), "destination");
  assert.equal(robberPlacement(viewGame(game, "opponent"), "opponent"), null);

  game.settings.friendlyRobber = false;
  const unprotected = robberPlacement(viewGame(game, "active"), "active");
  assert.equal(unprotected.friendly, false);
  assert.equal(unprotected.state(target.id), "destination");
  game.phase = "action";
  assert.equal(robberPlacement(viewGame(game, "active"), "active"), null);
});
