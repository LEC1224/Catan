import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadLayout } from '../src/road-geometry.js';

const corner = { x: 0, y: 0 };
const vertices = {
  a: { x: -52, y: 30 }, b: corner, c: { x: 52, y: 30 }, d: { x: 0, y: -60 },
};
const road = (id, a, b, owner = 'red') => ({ id, a, b, owner });
const chain = [road('ab', 'a', 'b'), road('bc', 'b', 'c')];

test('two roads flow through a corner with one shared segment boundary', () => {
  const { routes, courses } = roadLayout(chain, vertices);
  const entering = courses.get('ab').pointAt(.999);
  const leaving = courses.get('bc').pointAt(.001);
  assert.ok(entering.x < 0 && leaving.x > 0);
  assert.ok(Math.abs(entering.y) < .001 && Math.abs(leaving.y) < .001, 'both segments reach the corner horizontally');
  assert.deepEqual(routes.get('red').markers.map(marker => marker.point), [corner]);
});

test('a three-way fork gives each entrance a mark and stays stable when the board is reordered', () => {
  const edges = [...chain, road('db', 'd', 'b')];
  const { routes, courses } = roadLayout(edges, vertices);
  const reversed = roadLayout([...edges].reverse(), vertices);
  for (const { id } of edges) assert.equal(courses.get(id).bed, reversed.courses.get(id).bed);
  const { markers } = routes.get('red');
  assert.equal(markers.length, 3);
  assert.ok(markers.every(({ point }) => Math.hypot(point.x, point.y) > 9), 'marks sit outside the shared corner');
});

test('a building keeps its own road opening while an opposing road stops short', () => {
  const occupied = { ...vertices, b: { ...corner, building: { owner: 'red', type: 'city' } } };
  const { approaches, routes, courses } = roadLayout([...chain, road('db', 'd', 'b', 'blue')], occupied);
  assert.deepEqual(courses.get('ab').pointAt(1), corner);
  assert.equal(approaches.get('b').get('red').split(/ (?=M)/).length, 2);
  assert.ok(courses.get('db').pointAt(1).y < -20);
  assert.equal(routes.get('red').markers.length, 0, 'no boundary stones cross the gate');
});
