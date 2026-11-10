const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
(async()=>{
 const handlers=new Map(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'pitch-service-'));
 let release,restores=0,hides=0,fail=true;
 const window={webContents:{mainFrame:{},send(){}},hide(){hides++;},show(){restores++;},focus(){},isDestroyed(){return false;}};
 const shortcuts=new Map();let hudClosed=0,stopped=false,finish;
 const electron={app:{getPath:()=>directory,on(){}},ipcMain:{handle:(n,f)=>handlers.set(n,f)},globalShortcut:{register:(k,f)=>{shortcuts.set(k,f);return true;},unregister:k=>shortcuts.delete(k)}};
 const bridgeCalls=[];
 class Bridge{async call(op){bridgeCalls.push(op);return op==='selectRegion'?{cancelled:true}:{image:'test'};}}
 class Collector{async bind(){await new Promise(r=>release=r);if(fail)throw Error('Target lost focus');}async tab(){}async scroll(){}async run(){return new Promise(r=>finish=r);}stop(){stopped=true;finish?.({status:'stopped'});}}
 const context={module:{exports:{}},setTimeout:f=>{queueMicrotask(f);return 1;},require:n=>n==='electron'?electron:n==='./bridge.cjs'?{WindowsBridge:Bridge}:n==='./collector.cjs'?{Collector}:n==='./status-window.cjs'?{createStatusWindow:async()=>({hide(){},show(){},close(){hudClosed++;}})}:require(n)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop/automation/service.cjs'),'utf8'),context);
 context.module.exports.setupAutomation(window);
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
 const call=(name,...args)=>handlers.get('pitch-ocr:'+name)(event,...args);
 const first=call('calibrate',{},'starter');await new Promise(setImmediate);
 await assert.rejects(()=>call('calibrate',{},'reserve'),/正在切换/);
 await assert.rejects(()=>call('screen'),/正在切换/);
 await assert.rejects(()=>call('start',{},{}),/正在进行/);
 assert.equal(restores,0,'A rejected concurrent request must not steal focus back');
 release();await assert.rejects(()=>first,/lost focus/);assert.equal(restores,1);
 fail=false;const retry=call('calibrate',{},'starter');await new Promise(setImmediate);release();
 assert.equal((await retry).image,'test');assert.equal(restores,2);assert.equal(hides,2);
 const cancelled=await call('screen');assert.equal(cancelled.cancelled,true);
 assert.equal(bridgeCalls.at(-1),'selectRegion','Region selection must precede any capture');
 assert.equal(restores,3,'Canceling the picker restores the application');
 const slot={id:'one',kind:'starter',position:'ST',point:{x:.5,y:.5}};
 const running=call('start',{slots:[slot],delay:750},{players:[],groups:[slot]});await new Promise(setImmediate);
 assert.ok(shortcuts.has('Escape'));shortcuts.get('Escape')();
 assert.equal((await running).status,'stopped');assert.equal(stopped,true);assert.equal(hudClosed,1);assert.equal(shortcuts.size,0,'Stopping closes the HUD and releases global Escape');
 console.log('OCR calibration serializes window switching and releases its guard after failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
