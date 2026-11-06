const assert = require('node:assert/strict');
const { ratingBonusTier, score } = require('../dist/solver.js');

const verified = new Map([
  [990, 30], [995, 45], [1001, 60], [1006, 80], [1012, 100],
  [1017, 125], [1023, 150], [1028, 180],
  [1034, 210], [1039, 245], [1045, 280], [1050, 320],
  [1056, 360], [1061, 405]
]);
for (const [rating, percent] of verified) {
  assert.equal(ratingBonusTier(rating).percent, percent, `verified ${rating}`);
}
for (const rating of [0, 900, 968, 984, 989]) {
  assert.deepEqual(ratingBonusTier(rating), { from: null, to: 989, percent: 0 });
}
assert.equal('estimated' in ratingBonusTier(995), false);
assert.equal(ratingBonusTier(1055).percent, 320);
assert.equal(ratingBonusTier(1056).percent, 360);

const players = Array.from({ length: 18 }, (_, i) => ({
  id: String(i), personId: String(i), name: `P${i}`, rating: i === 0 ? 100 : 95,
  nationality: 'A', teams: []
}));
const state = {
  starters: players.slice(0, 11).map(p => p.id),
  bench: players.slice(11).map(p => p.id)
};
const result = score(state, players, [], 'final');
assert.equal(result.rating, 1050);
assert.equal(result.chemistry, 100);
assert.equal(result.ratingTier.percent, 320);
assert.equal(result.finalScore, 1470);
assert.equal(result.value, 1470);
const lowRating = score(state, players.map(p => ({ ...p, rating: 89 })), [], 'final');
assert.equal(lowRating.rating, 979);
assert.equal(lowRating.chemistry, 100);
assert.equal(lowRating.finalScore, 1079);
const justBelow = score(state, players.map((p, i) => ({ ...p, rating: i === 0 ? 99 : 89 })), [], 'final');
assert.equal(justBelow.rating, 989);
assert.equal(justBelow.finalScore, 1089);
const atThreshold = score(state, players.map((p, i) => ({ ...p, rating: i === 0 ? 100 : 89 })), [], 'final');
assert.equal(atThreshold.rating, 990);
assert.equal(atThreshold.finalScore, 1120);
const linkedPlayers = players.map(p => ({ ...p, teams: ['同队'] }));
const combos = [{ name: '三人组', members: ['P0', 'P1', 'P2'] }];
const capped = score(state, linkedPlayers, combos, 'final');
assert.equal(capped.rawChemistry, 220);
assert.equal(capped.bonus.reduce((sum, item) => sum + item.value, 0), 220);
assert.equal(capped.chemistry, 100);
assert.equal(capped.finalScore, 1470);
assert.deepEqual(capped.bonus.find(item => item.type === 'team').starterIds, state.starters);
assert.deepEqual(capped.bonus.find(item => item.type === 'team').benchIds, state.bench);
assert.deepEqual(capped.bonus.find(item => item.type === 'nation').starterIds, state.starters);
assert.deepEqual(capped.bonus.find(item => item.type === 'combo').starterIds, ['0', '1', '2']);
const mixedCombo = score(state, linkedPlayers, [{ name: '两首发一替补', members: ['P0', 'P1', 'P11'] }], 'final').bonus.find(item => item.type === 'combo');
assert.equal(mixedCombo.value, 10);
assert.deepEqual(mixedCombo.starterIds, ['0', '1']);
assert.deepEqual(mixedCombo.benchIds, ['11']);
assert.equal(score(state, linkedPlayers, combos, 'chemistry').value, 100 * 100000 + 1050);
assert.equal(score(state, linkedPlayers, combos, 'rating').value, 1050 * 100000 + 100);
console.log('评分档位和最终分数验证通过');
