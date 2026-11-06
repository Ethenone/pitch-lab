const assert = require('node:assert/strict');
const { fill } = require('../dist/match-fill.js');

const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CDM', 'CM', 'LW', 'ST', 'RW'];
const players = Array.from({ length: 18 }, (_, i) => ({
  id: `p${i}`, personId: `person${i}`, name: `球员${i}`,
  positions: [positions[i] || 'CM']
}));
players.push({ ...players[0], id: 'p0-variant', rating: 95 });
const groups = players.slice(0, 18).map((_, i) => ({
  id: `g${i}`, kind: i < 11 ? 'starter' : 'bench', index: i < 11 ? i : i - 11,
  ...(i < 11 ? { position: positions[i] } : {}), options: []
}));
groups[0].options = ['p0', 'p11'];
const result = fill(groups, players, () => 0.37);
assert.equal(result.matchedGroups, 18);
assert.equal(result.emptyGroups, 0);
assert.ok(result.removed >= 1);
assert.ok(result.groups[0].options.includes('p0'));
assert.ok(!result.groups[0].options.includes('p11'));
for (const group of result.groups) {
  assert.ok(group.options.length >= 1 && group.options.length <= 5);
  const selected = group.options.map(id => players.find(player => player.id === id));
  assert.equal(new Set(selected.map(player => player.personId)).size, selected.length);
  if (group.kind === 'starter') assert.ok(selected.every(player => player.positions.includes(group.position)));
}
assert.deepEqual(groups[0].options, ['p0', 'p11']);
const sparse = fill([{ id: 'goalkeeper', kind: 'starter', position: 'GK', options: [] }], players, () => 0.5);
assert.equal(sparse.groups[0].options.length, 1);
assert.equal(sparse.unfilledGroups, 1);
console.log('比赛模式随机填充验证通过');
