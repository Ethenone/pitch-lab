'use strict';
const { app } = require('electron');
const { createWindow } = require('../desktop/main.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pitch-lab-smoke-'));
app.setPath('userData', profile);
const timeout = setTimeout(() => { console.error('Desktop smoke test timed out'); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  const win = createWindow();
  const errors = [];
  win.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message);
  });
  await once(win.webContents, 'did-finish-load');
  const run = code => win.webContents.executeJavaScript(code);
  assert.equal(await run('window.PitchDefaultData.players.length'), 579);
  assert.equal(await run('window.PitchDefaultData.combos.length'), 365);
  assert.equal(await run('typeof require'), 'undefined');
  for (const view of ['players', 'combos', 'analytics', 'match', 'normal']) {
    assert.ok(await run(`document.querySelector('[data-view="${view}"]').click(); document.querySelector('#viewContent').textContent.length > 20`));
  }
  // Trigger a real UI action that saves, then reload and verify persistence.
  await run(`document.querySelector('[data-view="match"]').click(); document.querySelector('#addReserveBtn').click(); document.querySelector('#randomFillBtn').click();`);
  const saved = await run(`JSON.parse(localStorage.getItem('pitch-lab-data-v1'))`);
  assert.equal(saved.players.length, 579);
  assert.ok(saved.groups.every(group => group.options.length === 5));
  const loaded = once(win.webContents, 'did-finish-load');
  win.reload();
  await loaded;
  assert.equal(await run(`localStorage.getItem('pitch-lab-data-v1')`), JSON.stringify(saved));
  // Exercise the existing export button with a test-only download destination.
  const download = new Promise((resolve, reject) => {
    win.webContents.session.once('will-download', (_event, item) => {
      item.setSavePath(path.join(profile, 'export.json'));
      item.once('done', (_event, state) => state === 'completed' ? resolve() : reject(new Error(state)));
    });
  });
  await run(`document.querySelector('#exportBtn').click()`);
  await download;
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'export.json'), 'utf8')).players.length, 579);
  assert.deepEqual(errors, []);
  fs.mkdirSync(path.join(__dirname, '..', 'release'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'release', 'desktop-preview.png'), (await win.webContents.capturePage()).toPNG());
  console.log('Desktop smoke passed: defaults, all tabs, isolated renderer, random fill, persistence, JSON export.');
  console.log('Test profile: ' + profile);
  clearTimeout(timeout);
  app.exit(0);
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
