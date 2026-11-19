const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const [file, revisionArg] = process.argv.slice(2);
const revision = revisionArg || path.basename(file || '').match(/(\d{4}-\d{2}-\d{2})\.json$/i)?.[1];
const prefix = 'window.PitchDefaultData = ';
const dist = path.join(__dirname, '..', 'dist');
const bundledPath = path.join(dist, 'default-data.js');
const text = value => typeof value === 'string' && value.trim().length > 0;
const stringList = values => Array.isArray(values) && values.every(text);
const uniqueIds = rows => new Set(rows.map(row => row.id)).size === rows.length;

try {
  if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(revision || '') ||
      !Number.isFinite(Date.parse(revision)) || new Date(revision).toISOString().slice(0, 10) !== revision) {
    throw Error('用法：npm run update:roster -- "<导出资料.json>" [YYYY-MM-DD]');
  }
  const { players, combos } = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(players) || !players.length || !players.every(p =>
    p && text(p.id) && text(p.name) && Number.isFinite(p.rating) &&
    typeof p.nationality === 'string' && stringList(p.teams) && stringList(p.positions)
  ) || !uniqueIds(players)) throw Error('球员资料格式无效或有重复 ID');
  if (!Array.isArray(combos) || !combos.every(c =>
    c && text(c.id) && text(c.name) && stringList(c.members) && c.members.length === 3
  ) || !uniqueIds(combos)) throw Error('组合资料格式无效或有重复 ID');

  const bundled = JSON.parse(fs.readFileSync(bundledPath, 'utf8').trim().slice(prefix.length, -1));
  if (revision < bundled.builtInRevision) throw Error('资料日期早于当前版本');
  const online = {
    builtInRevision: revision,
    players: players.map(({ id, personId, name, rating, nationality, teams, positions }) =>
      ({ id, personId, name, rating, nationality, teams, positions })),
    combos: combos.map(({ id, name, members }) => ({ id, name, members }))
  };
  const ids = new Set(players.map(p => p.id));
  const next = { ...bundled, ...online };
  next.pool = next.pool.filter(id => ids.has(id));
  next.groups = next.groups.map(group => ({ ...group, options: group.options.filter(id => ids.has(id)) }));
  const htmlPath = path.join(dist, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const bundledScript = prefix + JSON.stringify(next, null, 2) + ';\n';
  const hash = createHash('sha256').update(bundledScript).digest('hex').slice(0, 12);
  const nextHtml = html.replace(/default-data\.js\?v=[^"]+/, 'default-data.js?v=' + hash);
  fs.writeFileSync(bundledPath, bundledScript);
  fs.writeFileSync(path.join(dist, 'roster-data.json'), JSON.stringify(online) + '\n');
  fs.writeFileSync(htmlPath, nextHtml);
  console.log(`${revision} · ${players.length} 个评分版本 · ${combos.length} 个组合`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
