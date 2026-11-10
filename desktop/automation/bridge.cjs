'use strict';
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
class WindowsBridge {
  constructor() { this.pending = new Map(); this.next = 0; }
  start() {
    if (this.child) return;
    this.child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'windows-helper.ps1').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.errors = '';
    this.child.stderr.on('data', b => { this.errors = (this.errors + b).slice(-3000); });
    readline.createInterface({ input: this.child.stdout }).on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      const pending = this.pending.get(msg.id); if (!pending) return;
      this.pending.delete(msg.id); clearTimeout(pending.timer);
      msg.ok ? pending.resolve(msg.value) : pending.reject(new Error(msg.error));
    });
    const fail = error => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); this.child = null; };
    this.child.on('error', fail);
    this.child.on('exit', () => fail(new Error(this.errors || 'Windows OCR helper exited')));
  }
  call(op, args = {}) {
    this.start(); const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Windows OCR timed out')); this.close(); }, op==='selectRegion'?150000:45000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ ...args, op, id }) + '\n');
    });
  }
  close() { this.child?.kill(); }
}
module.exports = { WindowsBridge };
