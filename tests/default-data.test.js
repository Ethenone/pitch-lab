const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../dist/default-data.js'), 'utf8'), context);
const data = context.window.PitchDefaultData;
assert.equal(data.players.length, 791);
assert.equal(new Set(data.players.map(p=>p.personId||p.id)).size,577);
assert.equal(data.combos.length, 372);
assert.equal(data.builtInRevision,'2026-11-10');
assert.equal(data.groups.length, 25);
const ids = new Set(data.players.map(player => player.id));
assert.equal(ids.size, data.players.length);
for (const group of data.groups) {
  assert.ok(Array.isArray(group.options));
  assert.ok(group.options.every(id => ids.has(id)));
}
console.log('默认资料验证通过');
