'use strict';
const { app } = require('electron');
app.disableHardwareAcceleration();
const { createWindow } = require(process.env.PITCH_LAB_PACKAGE_ROOT?process.env.PITCH_LAB_PACKAGE_ROOT+'/desktop/main.cjs':'../desktop/main.cjs');
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
  const hud=await require(process.env.PITCH_LAB_PACKAGE_ROOT?process.env.PITCH_LAB_PACKAGE_ROOT+'/desktop/automation/status-window.cjs':'../desktop/automation/status-window.cjs').createStatusWindow({x:100,y:150,width:1200,height:800});
  const hudWindow=require('electron').BrowserWindow.getAllWindows().find(w=>w!==win);
  assert.ok(hudWindow&&!hudWindow.isFocusable()&&hudWindow.isAlwaysOnTop());
  assert.equal(await hudWindow.webContents.executeJavaScript('document.body.textContent.trim()'),'正在自动操作，Esc 退出');
  hud.hide();assert.equal(hudWindow.isVisible(),false);hud.show();assert.equal(hudWindow.isVisible(),true);hud.close();
  const run = code => win.webContents.executeJavaScript(code);
  assert.equal(await run('window.PitchDefaultData.players.length'), 579);
  assert.equal(await run('window.PitchDefaultData.combos.length'), 365);
  assert.equal(await run('typeof require'), 'undefined');
  assert.equal(await run('typeof window.pitchDesktopOCR.start'), 'function');
  assert.ok(await run("!!document.querySelector('#ocrOpen')"));
  assert.ok(await run("document.querySelector('#ocrOpen').textContent.includes('开发中')"));
  assert.ok(await run("document.querySelector('#ocrDevelopmentNotice').textContent.includes('功能不稳定')"));
  const clubCheck=await run(`(()=>{
    const players=Array.from({length:18},(_,i)=>({id:String(i),name:'P'+i,rating:95,nationality:'N'+i,teams:i<6?['斑马','红黑']:i<15?['红黑']:[]}));
    const state={starters:players.slice(0,11).map(p=>p.id),bench:players.slice(11).map(p=>p.id)};
    return PitchSolver.score(state,players,[],'final');
  })()`);
  assert.equal(clubCheck.chemistry,80);assert.equal(clubCheck.bonus.length,1);assert.equal(clubCheck.bonus[0].label,'红黑');
  await run("document.querySelector('#ocrOpen').click()");
  assert.ok(await run("document.querySelector('#ocrDialog').open"));
  await new Promise(resolve => setTimeout(resolve, 600));
  fs.mkdirSync(path.join(__dirname, '..', 'release'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'release', 'ocr-ui-preview.png'), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('#ocrClose').click()");
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
