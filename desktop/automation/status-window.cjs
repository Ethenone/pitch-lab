const {BrowserWindow,screen}=require('electron');
const path=require('node:path');
async function createStatusWindow(rect){
  const area=screen.screenToDipRect(null,rect),display=screen.getDisplayMatching(area).workArea;
  const width=Math.min(340,display.width),height=36;
  const x=Math.max(display.x,Math.min(area.x,display.x+display.width-width));
  const y=area.y-height-4>=display.y?area.y-height-4:display.y;
  const win=new BrowserWindow({x,y,width,height,frame:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,show:false,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setIgnoreMouseEvents(true);win.setMenu(null);
  try{await win.loadFile(path.join(__dirname,'status-window.html'));win.showInactive();}catch(error){win.destroy();throw error;}
  return {hide:()=>{if(!win.isDestroyed())win.hide();},show:()=>{if(!win.isDestroyed())win.showInactive();},close:()=>{if(!win.isDestroyed())win.destroy();}};
}
module.exports={createStatusWindow};
