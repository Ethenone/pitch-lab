'use strict';
const {app,ipcMain,globalShortcut}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {WindowsBridge}=require('./bridge.cjs');
const {Collector}=require('./collector.cjs');
let initialized=false,activeWindow,collector,busy=false,visualBusy=false;
const bridge=new WindowsBridge();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function setupAutomation(window){
  activeWindow=window;if(initialized)return;initialized=true;
  const directory=path.join(app.getPath('userData'),'automation');fs.mkdirSync(directory,{recursive:true});
  const settings=path.join(directory,'settings.json');
  const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
  const emit=event=>{if(activeWindow&&!activeWindow.isDestroyed())activeWindow.webContents.send('pitch-ocr:progress',event);};
  const stop=()=>{collector?.stop();emit({message:'正在停止，完成当前识别后返回校对页'});};
  function handle(name,callback){ipcMain.handle('pitch-ocr:'+name,async(event,...args)=>{
    if(event.sender!==activeWindow?.webContents||event.senderFrame!==activeWindow.webContents.mainFrame)throw Error('Invalid OCR caller');
    return callback(...args);
  });}
  async function hidden(task){
    if(visualBusy)throw Error('正在切换游戏窗口，请等待本次截图或采集结束');
    visualBusy=true;
    try{activeWindow.hide();await delay(600);return await task();}
    finally{visualBusy=false;if(!activeWindow.isDestroyed()){activeWindow.show();activeWindow.focus();}}
  }
  handle('settings',()=>({config:read(settings),draft:read(path.join(directory,'latest-draft.json'))}));
  handle('health',()=>bridge.call('health'));
  handle('screen',async()=>{if(busy)throw Error('采集中不能重新框选');return hidden(()=>bridge.call('selectRegion'));});
  handle('calibrate',async(config,kind)=>{
    if(busy)throw Error('采集中不能校准');
    return hidden(async()=>{const c=new Collector(bridge,directory,emit);await c.bind(config);await c.tab(kind==='reserve'?'reserve':'starter');if(kind==='reserve'){await c.scroll({x:.92,y:.66},6000);const pages=Math.max(0,Math.min(30,Number(config.previewScroll)||0));for(let i=0;i<pages;i++)await c.scroll({x:.92,y:.66},-360);}return bridge.call('capture',{...c.target,rect:config.rect});});
  });
  handle('start',async(config,snapshot)=>{
    if(busy||visualBusy)throw Error('截图、校准或采集正在进行，请等待完成');
    if(!Array.isArray(snapshot?.players)||!Array.isArray(snapshot?.groups)||!Array.isArray(config?.slots)||config.slots.length!==snapshot.groups.length||config.slots.length>100)throw Error('比赛位置配置无效');
    if(new Set(config.slots.map(s=>s.id)).size!==config.slots.length||config.slots.some(s=>!snapshot.groups.some(g=>g.id===s.id&&g.kind===s.kind&&g.position===s.position)||!s.point||!Number.isFinite(s.point.x)||!Number.isFinite(s.point.y)||s.point.x<=0||s.point.x>=1||s.point.y<=0||s.point.y>=1||!Number.isInteger(s.scroll||0)||s.scroll<0||s.scroll>30))throw Error('请标记全部位置，检查预备队滚动次数');
    if(!Number.isFinite(config.delay)||config.delay<350||config.delay>3000)throw Error('点击间隔须在 350–3000 毫秒之间');
    if(config.detailWaitMs!==undefined&&(!Number.isFinite(config.detailWaitMs)||config.detailWaitMs<0||config.detailWaitMs>30000))throw Error('详情额外等待须在 0–30000 毫秒之间');
    if(!globalShortcut.register('CommandOrControl+Alt+F8',stop))throw Error('Ctrl+Alt+F8 停止快捷键注册失败，请关闭占用它的程序');
    if(!globalShortcut.register('Escape',stop)){globalShortcut.unregister('CommandOrControl+Alt+F8');throw Error('Esc 停止快捷键注册失败，请关闭占用它的程序');}
    busy=true;let hud;
    const guardedBridge={call:async(op,args)=>{
      if(hud&&['capture','bind','click','scroll','drag'].includes(op)){hud.hide();await delay(60);try{return await bridge.call(op,args);}finally{hud.show();}}
      return bridge.call(op,args);
    }};
    collector=new Collector(guardedBridge,directory,emit);
    try{fs.writeFileSync(settings,JSON.stringify(config));return await hidden(async()=>{
      hud=await require('./status-window.cjs').createStatusWindow(config.rect);
      try{return await collector.run(config,snapshot);}finally{hud.close();}
    });}
    finally{busy=false;globalShortcut.unregister('CommandOrControl+Alt+F8');globalShortcut.unregister('Escape');}
  });
  handle('stop',()=>{stop();return true;});
  app.on('will-quit',()=>{collector?.stop();bridge.close();globalShortcut.unregister('CommandOrControl+Alt+F8');globalShortcut.unregister('Escape');});
}
module.exports={setupAutomation};
