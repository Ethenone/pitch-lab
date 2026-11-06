const assert = require('node:assert/strict');
const { merge } = require('../dist/data-merge.js');

const current = {
  players: [{ id: 'a90', personId: 'a', name: '甲', rating: 90, nationality: '中国', teams: ['甲队'], positions: ['ST'] }],
  combos: [{ id: 'c1', name: '旧组合', members: ['甲', '乙', '丙'] }],
  groups: [{ id: 'g1', kind: 'starter', position: 'ST', options: ['a90'] }],
  pool: ['a90']
};
const incoming = {
  players: [
    { id: 'a90', personId: 'other', name: '甲', rating: 95, nationality: '中国', teams: ['甲队', '乙队'], positions: ['ST', 'LW'] },
    { id: 'new', personId: 'new', name: '甲', rating: 90, nationality: '中国', teams: ['乙队'], positions: ['LW'] },
    { id: 'a90', personId: 'b', name: '乙', rating: 80, nationality: '法国', teams: ['丙队'], positions: ['CM'] }
  ],
  combos: [
    { id: 'c1', name: '旧组合', members: ['丙', '乙', '甲'] },
    { id: 'c1', name: '新组合', members: ['甲', '乙', '丁'] }
  ]
};
let next = 0;
const result = merge(current, incoming, () => `generated-${++next}`);
assert.equal(result.addedPlayers, 2);
assert.equal(result.addedCombos, 1);
assert.equal(result.updatedPeople, 1);
assert.deepEqual(result.data.groups, current.groups);
assert.deepEqual(result.data.pool, current.pool);
assert.equal(result.data.players.length, 3);
assert.equal(new Set(result.data.players.map(p => p.id)).size, 3);
assert.equal(result.data.players[0].personId, result.data.players[1].personId);
assert.deepEqual(result.data.players[0].teams, ['甲队', '乙队']);
assert.deepEqual(result.data.players[0].positions, ['ST', 'LW']);
assert.deepEqual(current.players[0].teams, ['甲队']);
console.log('资料合并验证通过');
