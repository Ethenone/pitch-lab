const assert = require('node:assert/strict');
const base = require('../dist/solver.js');
const guided = require('../dist/guided-solver.js');

const slots = base.FORMATIONS['4-3-3'];
const players = Array.from({ length: 18 }, (_, i) => ({
  id: `p${i}`, personId: `p${i}`, name: `球员${i}`,
  rating: i === 11 ? 120 : 80 + i,
  positions: i < 11 ? [slots[i]] : i === 11 ? ['ST'] : ['CAM'],
  nationality: `国家${i}`, teams: []
}));
const ids = players.map(p => p.id);
const found = guided.evaluateRoster(ids, slots, players, [], 'final');
assert.ok(found);
assert.ok(found.state.starters.includes('p11'), '高分中锋应进入首发');
assert.ok(!found.state.starters.includes('p9'), '原中锋应移到替补');
assert.deepEqual(found.score, base.score(found.state, players, [], 'final'));
const cappedPlayers = players.map(p => ({ ...p, positions: [...new Set(slots)], nationality: '同国', teams: ['同队'] }));
const cappedFound = guided.evaluateRoster(ids, slots, cappedPlayers, [], 'final');
assert.equal(cappedFound.score.rawChemistry, 200);
assert.equal(cappedFound.score.chemistry, 100);
assert.deepEqual(cappedFound.state.starters.slice().sort(), cappedPlayers.slice().sort((a, b) => b.rating - a.rating).slice(0, 11).map(p => p.id).sort());

const groups = ids.map((id, index) => ({ id: `g${index}`, options: [id] }));
assert.deepEqual(guided.buildTargets(groups, new Map(players.map(p => [p.id, p])), slots, 24).map(t => [t.team, t.nation]), [[null, null]]);
const sixKeepers = players.map((p, i) => i < 6 ? { ...p, positions: ['GK'], teams: ['门将队'] } : p);
assert.deepEqual(guided.buildTargets(groups, new Map(sixKeepers.map(p => [p.id, p])), slots, 24).map(t => t.team), [null]);

const flexible = players.map((p, i) => ({
  ...p, rating: 86 + i % 12, positions: [...new Set(slots)],
  nationality: i < 12 ? '甲国' : '乙国',
  teams: i < 9 ? ['甲队', '丙队'] : i < 13 ? ['甲队'] : ['乙队']
}));
const combos = [{ name: '三人组', members: ['球员0', '球员1', '球员12'] }];
const exact = guided.evaluateRoster(ids, slots, flexible, combos, 'final');
let reference = -Infinity;
for (let mask = 0; mask < 1 << 18; mask++) {
  if (mask.toString(2).replace(/0/g, '').length !== 11) continue;
  const starters = ids.filter((_, i) => mask & 1 << i);
  const bench = ids.filter((_, i) => !(mask & 1 << i));
  reference = Math.max(reference, base.score({ starters, bench }, flexible, combos, 'final').value);
}
assert.equal(exact.score.value, reference, '固定 18 人的首发选择应达到穷举最优值');

(async () => {
  const result = await guided.optimize({ players, combos: [], groups, slots, duration: 50 });
  assert.equal(result.state.picked.length, 18);
  assert.equal(result.score.value, found.score.value);
  assert.equal(result.rosterExact, true);
  console.log('比赛模式分层搜索验证通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
