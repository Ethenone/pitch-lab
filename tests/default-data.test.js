const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../dist/default-data.js'), 'utf8'), context);
const data = context.window.PitchDefaultData;
assert.equal(data.players.length, 938);
assert.equal(new Set(data.players.map(p=>p.personId||p.id)).size,619);
assert.equal(data.combos.length, 373);
assert.equal(data.builtInRevision,'2026-11-14');
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
