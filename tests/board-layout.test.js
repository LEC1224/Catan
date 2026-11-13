import test from "node:test";
import assert from "node:assert/strict";
import { createGame, RESOURCES } from "../server/game.js";
import { boardScenery, HOME_CAMERA, moveCamera, terrainVariants } from "../src/board-layout.js";

const players = ["a", "b"].map((id) => ({ id, name: id, color: "#aa6540" }));

test("both board sizes use distinct resource art before reusing an illustration", () => {
  for (const extendedBoard of [false, true]) {
    const { board } = createGame(players, { seed: "harbors", extendedBoard });
    const { hexes } = board;
    const variants = terrainVariants(hexes, "table-1");
    assert.deepEqual(variants, terrainVariants(structuredClone(hexes), "table-1"));
    assert.notDeepEqual(variants, terrainVariants(hexes, "table-2"));
    for (const resource of RESOURCES) {
      const art = hexes.filter((hex) => hex.terrain === resource).map((hex) => variants[hex.id]);
      assert.ok(art.every((variant) => Number.isInteger(variant) && variant >= 0 && variant < 5));
      assert.equal(new Set(art.slice(0, 5)).size, Math.min(5, art.length), resource);
    }
  }
});

test("the shore is a closed coast and harbors use the server's coastal edges on both board sizes", () => {
  for (const extendedBoard of [false, true]) {
    const { board } = createGame(players, { seed: "harbors", extendedBoard });
    const { shore, ports, vertices } = boardScenery(board);
    assert.match(shore, /^M.+Z$/);
    assert.equal(shore.includes("NaN"), false);
    assert.equal(ports.length, extendedBoard ? 11 : 9);
    for (const port of ports) {
      const [a, b] = port.vertexIds.map((id) => vertices[id]);
      assert.equal(port.x, (a.x + b.x) / 2);
      assert.equal(port.y, (a.y + b.y) / 2);
      assert.ok(Math.hypot(port.shipX - port.x, port.shipY - port.y) > 45);
    }
  }
});

test("zoom preserves the point under the pointer until it reaches the camera limits", () => {
  const viewport = { x: 440, y: 270, width: 760, height: 510 };
  const start = moveCamera(HOME_CAMERA, viewport, { x: 35, y: -24 });
  const anchorX = 400, anchorY = 360;
  const zoomed = moveCamera(start, viewport, { zoom: 2, anchorX, anchorY });
  for (const [axis, anchor] of [["x", anchorX], ["y", anchorY]]) {
    assert.equal((anchor - viewport[axis] - zoomed[axis]) / 2, anchor - viewport[axis] - start[axis]);
  }
  const clamped = moveCamera(zoomed, viewport, { zoom: 99, x: 5000 });
  assert.equal(clamped.zoom, 3.5);
  assert.ok(clamped.x < viewport.width);
});

test("cached board scenery contains static polygon geometry, independent of live pieces", () => {
  const { board } = createGame(players, { map: "sweden", seed: "static-scenery" });
  const scenery = boardScenery(board);
  for (const hex of board.hexes) {
    const expected = hex.vertexIds.map(id => {
      const vertex = board.vertices.find(candidate => candidate.id === id);
      return `${vertex.x},${vertex.y}`;
    }).join(" ");
    assert.equal(scenery.polygons[hex.id], expected);
  }
  board.vertices[0].building = { owner: "a", type: "city" };
  board.edges[0].owner = "a";
  assert.deepEqual(boardScenery(board), scenery, "piece updates do not invalidate scenery");
  assert.equal(Object.hasOwn(scenery.vertices[board.vertices[0].id], "building"), false);
});
