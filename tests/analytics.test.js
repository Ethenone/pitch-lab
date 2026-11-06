const assert = require('node:assert/strict');
const analytics = require('../dist/analytics.js');
const view = require('../dist/analytics-view.js');

const players = [
  { id: 'a1', personId: 'a', name: '甲', rating: 90, nationality: '中国', teams: ['A', 'B'], positions: ['ST', 'LW'] },
  { id: 'a2', personId: 'a', name: '甲', rating: 95, nationality: '中国', teams: ['A', 'B'], positions: ['ST', 'LW'] },
  { id: 'b', personId: 'b', name: '乙', rating: 92, nationality: '中国', teams: ['B', 'C'], positions: ['ST', 'RW'] },
  { id: 'c', personId: 'c', name: '丙', rating: 91, nationality: '法国', teams: ['A'], positions: ['LW'] }
];
const model = analytics.build(players);
assert.equal(model.people.length, 3);
assert.equal(model.teamPairs.get(analytics.pairKey('a', 'b')).people.length, 1);
assert.equal(model.teamPairs.get(analytics.pairKey('b', 'c')).people.length, 1);
assert.equal(model.teamOnly.get('a').length, 1);
assert.equal(model.teamOnly.has('b'), false);
assert.equal(model.positions.get('ST').people.length, 2);
assert.equal(model.positionPairs.get('ST\u0000LW').people.length / model.positions.get('ST').people.length, 0.5);
assert.equal(model.positionOnly.get('LW').length / model.positions.get('LW').people.length, 0.5);
assert.equal(model.positionOnly.get('ST')?.length || 0, 0);
assert.equal(model.countryTeams.get(analytics.countryTeamKey('中国', 'b')).people.length, 2);
const html = view.render(model, { ST: '中锋', LW: '左边锋', RW: '右边锋' }, { minShared: 1, sourcePosition: 'LW', positionPair: { from: 'LW', to: 'LW' }, nationMetric: 'count' });
assert.match(html, /仅能踢左边锋：1\/2 人，50%/);
assert.match(html, /这些球员只填写了这一个可踢位置/);
assert.match(html, /data-action="editPlayer" data-id="c"/);
assert.match(html, /球队共享球员矩阵/);
assert.match(html, /data-action="analyticsTeamShare" data-a="a" data-b="b" aria-label="A与B共享球员：1 人，占A球员的 50%"/);
assert.match(html, /data-action="analyticsTeamShare" data-a="a" data-b="a" aria-label="仅曾效力A：1 人，占A球员的 50%"/);
const selectedHtml = view.render(model, { ST: '中锋', LW: '左边锋', RW: '右边锋' }, { minShared: 1, sourcePosition: 'LW', nationMetric: 'count', teamShareA: 'a', teamShareB: 'b' });
assert.match(selectedHtml, /A → B/);
assert.match(selectedHtml, /这些球员的履历同时包含两支球队/);
console.log('球员关联分析统计验证通过');
