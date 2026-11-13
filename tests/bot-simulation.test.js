import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateBots } from '../scripts/simulate-bots.js';

test('bot simulations support unlimited resources with a finite development deck', () => {
  const result = simulateBots(3, 'normal', {
    unlimitedResourceCards: true, unlimitedDevelopmentCards: false,
    hardHandLimit: 10, victoryPoints: 5, allowPlayerTrading: false,
  });
  assert.ok(result.winner);
  assert.match(result.winnerName, /^Bot \d+$/);
  assert.ok(result.score >= 5);
  assert.equal(result.extendedBoard, false);
  assert.ok(result.remainingDevelopment >= 0 && result.remainingDevelopment <= 25);
});
