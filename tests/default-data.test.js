const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../dist/default-data.js'), 'utf8'), context);
const data = context.window.PitchDefaultData;
const online = require('../dist/roster-data.json');
assert.deepEqual(online, JSON.parse(JSON.stringify({
  builtInRevision: data.builtInRevision,
  players: data.players,
  combos: data.combos
})));
assert.match(data.builtInRevision, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(data.players.length > 0);
assert.equal(data.groups.length, 25);
assert.equal(data.algorithm,'guided');
assert.equal(data.searchSettings.durationSeconds,120);
const ids = new Set(data.players.map(player => player.id));
assert.equal(ids.size, data.players.length);
for (const group of data.groups) {
  assert.ok(Array.isArray(group.options));
  assert.ok(group.options.every(id => ids.has(id)));
}
console.log('默认资料验证通过');
