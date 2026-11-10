const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('pitchDesktopOCR',Object.freeze({
  settings:()=>ipcRenderer.invoke('pitch-ocr:settings'),
  health:()=>ipcRenderer.invoke('pitch-ocr:health'),
  screen:()=>ipcRenderer.invoke('pitch-ocr:screen'),
  calibrate:(config,kind)=>ipcRenderer.invoke('pitch-ocr:calibrate',config,kind),
  start:(config,snapshot)=>ipcRenderer.invoke('pitch-ocr:start',config,snapshot),
  stop:()=>ipcRenderer.invoke('pitch-ocr:stop'),
  onProgress:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('pitch-ocr:progress',listener);return ()=>ipcRenderer.removeListener('pitch-ocr:progress',listener);}
}));
