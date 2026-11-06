const assert = require('node:assert/strict');
const { build } = require('../dist/analytics.js');
const { cluster, clusterEntities, teamOverlap, orderTeams } = require('../dist/cluster.js');
const { render } = require('../dist/analytics-view.js');

const players = [
  { id: 'a90', personId: 'a', name: '甲', nationality: '中国', teams: ['A', 'B'], positions: ['ST', 'LW'] },
  { id: 'a95', personId: 'a', name: '甲', nationality: '中国', teams: ['A', 'B'], positions: ['ST', 'LW'] },
  { id: 'b', personId: 'b', name: '乙', nationality: '中国', teams: ['B', 'C'], positions: ['ST', 'RW'] },
  { id: 'c', personId: 'c', name: '丙', nationality: '法国', teams: ['A'], positions: ['LW'] },
  { id: 'd', personId: 'd', name: '丁', nationality: '日本', teams: ['D'], positions: ['GK'] }
];
const model = build(players);
const playerGroups = cluster(model.people, 2, 'balanced');
assert.equal(playerGroups.groups.length, 2);
assert.deepEqual(playerGroups.isolated.map(p => p.name), ['丁']);
assert.deepEqual(playerGroups.groups.flatMap(g => g.people.map(p => p.name)).sort(), ['丙', '乙', '甲'].sort());
assert.ok(playerGroups.groups.every(g => g.people.includes(g.representative)));
const teamGroups = clusterEntities([...model.teams.values()], 2);
assert.equal(teamGroups.groups.length, 2);
assert.equal(clusterEntities([...model.teams.values()], 8).groups.length, 2);
assert.deepEqual(teamGroups.isolated.map(t => t.name), ['D']);
assert.deepEqual(teamGroups.groups.flatMap(g => g.items.map(t => t.name)).sort(), ['A', 'B', 'C']);
assert.equal(teamOverlap(model.teams.get('a'), model.teams.get('b')).similarity, 1 / 3);
const ordered = orderTeams([...model.teams.values()]);
assert.equal(Math.abs(ordered.findIndex(t => t.key === 'b') - ordered.findIndex(t => t.key === 'c')), 1);
const positionGroups = clusterEntities([...model.positions.values()], 2);
assert.equal(positionGroups.groups.length, 2);
assert.deepEqual(positionGroups.isolated.map(p => p.code), ['GK']);
teamGroups.matrixOrder = ordered;
teamGroups.totalTeams = model.teams.size;
const state = { minShared: 1, sourcePosition: 'ST', nationMetric: 'count', clusterKind: 'teams', clusterCount: 2, teamMatrixLimit: 20, teamMatrixA: 'a', teamMatrixB: 'b' };
const html = render(model, { ST: '中锋', LW: '左边锋', RW: '右边锋', GK: '门将' }, state, teamGroups);
assert.match(html, /球队聚类/);
assert.match(html, /data-action="analyticsClusterEntity"/);
assert.match(html, /1 个球队暂未成组/);
assert.match(html, /球队相似度矩阵/);
assert.match(html, /A与B相似度 33%，共同 1 人/);
assert.match(html, /共同球员 1 人，两队球员并集 3 人/);
console.log('三种聚类统计验证通过');
