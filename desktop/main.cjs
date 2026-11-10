'use strict';
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('node:path');

// Use a stable directory even when the portable executable moves or is upgraded.
app.setPath('userData', path.join(app.getPath('appData'), 'PitchLab'));
app.setAppUserModelId('com.pitchlab.desktop');
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '绿茵阵容实验室', width: 1440, height: 960,
    minWidth: 860, minHeight: 640, backgroundColor: '#0b191a',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname,'preload.cjs') }
  });
  require('./automation/service.cjs').setupAutomation(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: '导出球员资料', defaultPath: path.join(app.getPath('documents'), item.getFilename()),
      filters: [{ name: '球员资料 JSON', extensions: ['json'] }]
    });
    item.once('done', (_event, state) => {
      if (state !== 'completed' && state !== 'cancelled') dialog.showErrorBox('导出失败', '资料未能保存，请重新导出并选择可写入的文件夹。');
    });
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      document.title = '绿茵阵容实验室 · 桌面版 v${app.getVersion()}';
      document.querySelector('.desktop-download')?.remove();
      document.querySelector('footer').textContent = '绿茵阵容实验室 · 桌面版 · 资料自动保存在本机，可随时导出备份';
      document.querySelectorAll('#algorithmDialog .hint').forEach(el => {
        el.textContent = el.textContent.replace('此浏览器', '本机');
      });
    `).catch(() => {});
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(error => {
    dialog.showErrorBox('启动失败', error.message);
    app.quit();
  });
  return mainWindow;
}

module.exports = { createWindow };

if (require.main !== module) {
  // The integration harness creates the same window using an isolated profile.
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '文件', submenu: [
        { label: '打开数据文件夹', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' }, { role: 'quit', label: '退出' }
      ] },
      { label: '编辑', submenu: [
        { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
        { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
      ] },
      { label: '视图', submenu: [
        { role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' }, { role: 'togglefullscreen', label: '全屏' }
      ] },
      { label: '帮助', submenu: [{ label: '关于与资料迁移', click: () => dialog.showMessageBox(mainWindow, {
        type: 'info', title: '绿茵阵容实验室',
        message: `绿茵阵容实验室 ${app.getVersion()}`,
        detail: '支持离线使用，修改自动保存在本机。\n\n迁移网页版资料：在原网页点击“导出资料”，再在本软件中点击“导入资料”。\n\n升级时可替换程序文件，资料独立保存；建议定期导出 JSON 备份。'
      }) }] }
    ]));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
