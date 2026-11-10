'use strict';
const fs=require('node:fs');
const path=require('node:path');
const OCR=require('../../dist/ocr-core.js');
const {createHash}=require('node:crypto');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Collector {
  constructor(bridge,directory,onProgress=()=>{}){this.bridge=bridge;this.directory=directory;this.onProgress=onProgress;this.cancelled=false;fs.mkdirSync(directory,{recursive:true});}
  check(){if(this.cancelled)throw Error('采集已停止，已读结果保留在校对页');}
  stop(){this.cancelled=true;}
  report(message){this.onProgress({message,completed:this.draft?.slots.filter(s=>s.done).length||0,total:this.config?.slots?.length||0});}
  save(){if(this.draft){const file=path.join(this.directory,'latest-draft.json');fs.writeFileSync(file+'.tmp',JSON.stringify(this.draft,null,2));fs.renameSync(file+'.tmp',file);}}
  async bind(config){
    this.config=config;this.check();
    const r=config.rect;
    if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.width<600||r.height<350||r.width>8000||r.height>5000)throw Error('请框选完整游戏内容区，不包含微信顶部标题栏');
    const target=await this.bridge.call('bind',{x:r.x+r.width/2,y:r.y+r.height/2});
    if(!Number(target.handle))throw Error('未找到游戏窗口');
    const w=target.window;if(r.x<w.x||r.y<w.y||r.x+r.width>w.x+w.width||r.y+r.height>w.y+w.height)throw Error('所选区域超出目标窗口，请重新框选');
    this.target=target;
    await this.bridge.call('focus',target);
    this.check();
    return target;
  }
  async click(point){
    this.check();if(!point||point.x<=0||point.x>=1||point.y<=0||point.y>=1)throw Error('点击坐标未校准或超出游戏区域');
    const r=this.config.rect;
    await this.bridge.call('click',{...this.target,x:Math.round(r.x+r.width*point.x),y:Math.round(r.y+r.height*point.y)});
    await sleep(this.config.delay||650);this.check();
  }
  async scroll(point,delta=-360){
    this.check();const r=this.config.rect;
    await this.bridge.call('scroll',{...this.target,x:Math.round(r.x+r.width*point.x),y:Math.round(r.y+r.height*point.y),delta});
    await sleep(this.config.delay||650);this.check();
  }
  async drag(from,to){
    this.check();if([from,to].some(p=>!p||p.x<=0||p.x>=1||p.y<=0||p.y>=1))throw Error('滑动坐标超出游戏区域');
    const r=this.config.rect;await this.bridge.call('drag',{...this.target,x:Math.round(r.x+r.width*from.x),y:Math.round(r.y+r.height*from.y),toX:Math.round(r.x+r.width*to.x),toY:Math.round(r.y+r.height*to.y)});
    await sleep(this.config.delay||650);this.check();
  }
  async frame(){
    this.check();const file=path.join(this.directory,'current.png');
    await this.bridge.call('capture',{...this.target,rect:this.config.rect,path:file});
    this.check();const frame=await this.bridge.call('ocr',{path:file,scale:Math.min(1.5,2300/this.config.rect.width)});
    this.check();this.lastFrame=frame;return frame;
  }
  async crop(rect,options={}){
    this.check();const f=this.lastFrame;
    const x=Math.max(0,Math.floor(rect.x)),y=Math.max(0,Math.floor(rect.y));
    const crop={x,y,width:Math.max(1,Math.min(Math.ceil(rect.width),f.width-x)),height:Math.max(1,Math.min(Math.ceil(rect.height),f.height-y))};
    return this.bridge.call('ocr',{path:path.join(this.directory,'current.png'),crop,scale:2,...options});
  }
  point(line){return {x:(line.x+line.width/2)/this.lastFrame.width,y:(line.y+line.height/2)/this.lastFrame.height};}
  async expect(expected){
    this.check();
    const extra=expected.includes('detail')?Math.ceil((this.config?.detailWaitMs??8000)/500):0;
    for(let i=0;i<4+extra;i++){const f=await this.frame();const blocked=OCR.blocker(f);if(blocked)throw Error(blocked);if(expected.includes(OCR.state(f)))return f;if(i===3&&extra)this.report('详情页加载较慢，继续等待…');await sleep(500);this.check();}
    throw Error(`页面未进入 ${expected.join('/')}，已停止；请回到阵容页面后重试`);
  }
  signature(config,snapshot){
    const relevant={rect:config.rect,slots:config.slots.map(({id,kind,index,position,point,scroll})=>({id,kind,index,position,point,scroll})),temporarySelection:!!config.temporarySelection,refreshKnown:!!config.refreshKnown,snapshot};
    return createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
  }
  choicesSignature(frame){
    const names=frame.lines.filter(l=>l.y/frame.height>.66&&l.y/frame.height<.79).map(l=>OCR.compact(l.text));
    return names.length?names.join('|'):OCR.compact(frame.text);
  }
  async recover(){
    for(let step=0;step<4;step++){
      const f=await this.expect(['lineup','reserves','choices','detail','teams','combos']);const state=OCR.state(f);
      if(state==='lineup'||state==='reserves')return;
      if(state==='teams')await this.click({x:.48,y:.28});
      else if(state==='choices'){const title=OCR.find(f,'选择一名球员');await this.click({x:.916,y:(title.y+title.height*.55)/f.height});}
      else await this.click({x:.025,y:.07});
    }
    await this.expect(['lineup','reserves']);
  }
  async tab(kind){
    const f=await this.expect(['lineup','reserves']);
    const label=kind==='reserve'?'预备队':'阵容调整';const tab=OCR.find(f,label);
    if(!tab)throw Error(`找不到 ${label} 按钮`);
    await this.click(this.point(tab));await this.expect(kind==='reserve'?['reserves']:['lineup']);
  }
  async openSlot(slot){
    await this.tab(slot.kind);
    if(slot.kind==='reserve'){await this.scroll({x:.92,y:.66},120*50);for(let i=0;i<(slot.scroll||0);i++)await this.scroll({x:.92,y:.66},-360);}
    await this.click(slot.point);
    try{return await this.expect(['choices']);}catch(error){if(slot.kind==='reserve'&&OCR.state(this.lastFrame||{text:''})==='reserves')throw Error('预备队候选未打开。游戏要求先完成阵容 18 人翻卡；请手动完成后重试。已保留采集草稿。');throw error;}
  }
  async backToChoices(slot){
    await this.click({x:.025,y:.07});
    const f=await this.expect(['choices','lineup','reserves']);
    if(OCR.state(f)!=='choices')return this.openSlot(slot);
    return f;
  }
  async readRating(frame){
    const label=OCR.find(frame,'评分');
    const rect=label?{x:label.x-12,y:label.y-8,width:label.width+32,height:frame.height*.105}:OCR.region(frame,.90,.33,.08,.14);
    const scores=[];
    for(const invert of [true,false]){const result=await this.crop(rect,{language:'en-GB',invert,scale:5});const n=OCR.rating(result);if(n!==null)scores.push(n);}
    if(scores.length&&new Set(scores).size===1)return scores[0];
    return null;
  }
  async readTeams(player){
    const f=await this.expect(['detail']);const label=OCR.find(f,'评分');
    await this.click(label?{x:Math.min(.97,(label.x+label.width)/f.width),y:Math.max(.1,label.y/f.height-.036)}:{x:.95,y:.315});
    await this.expect(['teams']);
    let previous='',unchanged=0,complete=false;const teams=new Set();
    for(let page=0;page<20;page++){
      const frame=await this.expect(['teams']),title=OCR.find(frame,'效力过的俱乐部');
      const crop={x:title.x+frame.width*.038,y:title.y+title.height+frame.height*.012,width:frame.width-(title.x+frame.width*.038)-8,height:frame.height*.23};
      const result=await this.crop(crop,{scale:2});
      const visible={...result,lines:result.lines.filter(l=>l.y+l.height<crop.y+crop.height-5)};
      OCR.teams(visible).forEach(t=>teams.add(t));
      const signature=OCR.compact(result.text);
      unchanged=signature===previous?unchanged+1:0;previous=signature;
      if(unchanged>=3){complete=true;break;}
      if(unchanged>=1)await this.drag({x:.91,y:Math.min(.9,(crop.y+crop.height-.015*frame.height)/frame.height)},{x:.91,y:(crop.y+.025*frame.height)/frame.height});
      else await this.scroll({x:.91,y:Math.min(.85,(crop.y+crop.height*.5)/frame.height)},-240);
    }
    player.teams=[...teams];
    if(!complete||!teams.size)player.issues.push('球队列表未完整确认，请校对');
    // OCR has no reliable confidence score; new textual records need explicit review.
    player.issues.push('新采集球队请核对，确认列表已滚动到底');
    await this.click({x:.48,y:.28});await this.expect(['detail']);
  }
  async readCombos(player,players){
    const f=await this.expect(['detail']);const tab=OCR.find(f,'球员组合');
    if(!tab)throw Error('找不到球员组合标签');await this.click(this.point(tab));
    let previous='',unchanged=0,complete=false;
    for(let page=0;page<20;page++){
      const frame=await this.expect(['combos']);
      const region=OCR.region(frame,.285,.24,.69,.71);
      const result=await this.crop(region,{scale:1.7,invert:true});
      const rows=[...OCR.combos(frame,players,player.name),...OCR.combos(result,players,player.name)];
      for(const combo of rows){
        const existing=this.draft.combos.find(c=>c.name===combo.name&&c.owner===player.name);
        if(!existing)this.draft.combos.push({...combo,owner:player.name});
        else if(existing.issues.length&&combo.members.filter(Boolean).length>existing.members.filter(Boolean).length)Object.assign(existing,combo);
      }
      const signature=OCR.compact(result.text);unchanged=signature===previous?unchanged+1:0;previous=signature;
      if(unchanged>=3){complete=true;break;}
      if(unchanged>=1)await this.drag({x:.91,y:.84},{x:.91,y:.36});
      else await this.scroll({x:.88,y:.75},-360);
    }
    if(!complete)player.issues.push('组合列表达到翻页上限，请校对');
    player.issues.push('新球员的组合记录请核对');
  }
  async run(config,snapshot){
    const signature=this.signature(config,snapshot);let previous;
    try{previous=JSON.parse(fs.readFileSync(path.join(this.directory,'latest-draft.json'),'utf8'));}catch{}
    const resume=config.resume!==false&&previous?.version===2&&previous.status!=='complete'&&previous.signature===signature;
    if(previous&&!resume)fs.writeFileSync(path.join(this.directory,`draft-${Date.now()}.json`),JSON.stringify(previous));
    this.draft=resume?previous:{version:2,signature,createdAt:new Date().toISOString(),slots:[],combos:[],status:'running',error:''};
    this.draft.status='running';this.draft.error='';
    if(!resume)fs.writeFileSync(path.join(this.directory,`backup-${Date.now()}.json`),JSON.stringify(snapshot));
    try{
      const health=await this.bridge.call('health');if(!health.ready)throw Error('请在 Windows 语言设置安装简体中文 OCR');
      await this.bind(config);
      if(resume&&this.draft.target&&(this.draft.target.handle!==this.target.handle||['x','y','width','height'].some(k=>this.draft.target.window[k]!==this.target.window[k])))throw Error('游戏窗口或位置发生变化，请取消“从断点继续”后重新采集');
      this.draft.target=this.target;
      if(resume){this.report('配置未变，正在恢复上次中断的位置…');await this.recover();}
      const learned=[...snapshot.players,...this.draft.slots.flatMap(s=>s.players).filter(p=>p.complete&&!p.issues.length)],selected=new Set(this.draft.slots.filter(s=>s.done&&s.temporarySelection).map(s=>OCR.key(s.temporarySelection.name)));
      const order={starter:0,bench:1,reserve:2};
      const slots=[...config.slots].sort((a,b)=>order[a.kind]-order[b.kind]||(a.index||0)-(b.index||0));
      for(const slot of slots){
        this.check();let record=this.draft.slots.find(s=>s.groupId===slot.id);if(record?.done)continue;
        if(!record){record={groupId:slot.id,kind:slot.kind,position:slot.position,label:slot.label,players:[]};this.draft.slots.push(record);}
        record.players=record.players.filter(p=>p.complete);this.save();
        let choices=await this.openSlot(slot);
        const fingerprint=this.choicesSignature(choices);
        if(record.fingerprint&&record.fingerprint!==fingerprint)throw Error('当前位置的候选名单与中断前不一致，请取消“从断点继续”后重新采集');
        record.fingerprint=fingerprint;this.save();
        for(let i=record.players.length;i<5;i++){
          this.report(`${slot.label} · 第 ${i+1}/5 名：打开详情`);
          const title=OCR.find(choices,'选择一名球员');
          if(!title)throw Error('选择窗口标题未识别，停止点击');
          await this.click({x:.214+i*.1785,y:(title.y+title.height)/choices.height+.06});
          const detailFrame=await this.expect(['detail']);
          const player=OCR.detail(detailFrame,learned);player.rating=await this.readRating(detailFrame);
          if(player.rating===null)player.issues.push('评分未识别，请填写');
          record.players.push(player);this.save();
          if(player.issues.some(x=>x.includes('身份')||x.includes('同名')))throw Error('球员身份未确认，已停止，请先校对再重新采集');
          if(player.name&&player.positions.length&&(!player.known||config.refreshKnown)){
            this.report(`${slot.label} · ${player.name}：读取球队和组合`);
            await this.readTeams(player);await this.readCombos(player,learned);
          }
          if(!player.issues.length)learned.push({...player,personId:player.name});
          player.complete=true;
          this.save();choices=await this.backToChoices(slot);
        }
        if(config.temporarySelection){
          await this.selectTemporary(record,selected);
        }else{
          const title=OCR.find(choices,'选择一名球员');
          await this.click({x:.916,y:(title.y+title.height*.55)/choices.height});
          await this.expect(['lineup','reserves']);
        }
        record.done=true;this.save();
      }
      this.draft.status='complete';this.report('采集完成，请校对后导入比赛模式');
    }catch(error){this.draft.status=this.cancelled?'stopped':'needs-review';this.draft.error=error.message;this.report(error.message);}
    this.save();return this.draft;
  }
  async selectTemporary(record,selected){
    // Use the canonical name (including the Martinez position alias), never the rating,
    // to prevent two versions of one person from being selected together.
    const candidates=record.players.map((player,index)=>({player,index})).filter(({player})=>
      player.name&&!selected.has(OCR.key(player.name))&&
      (record.kind!=='starter'||player.positions.includes(record.position)));
    candidates.sort((a,b)=>(b.player.rating||0)-(a.player.rating||0));
    if(!candidates.length)throw Error(`${record.label} 没有可临时选择的不重复球员，请调整已选球员后重试；采集草稿已保留`);
    const {player,index}=candidates[0];
    this.report(`${record.label} · 临时选择 ${player.name}（不锁定阵容）`);
    await this.expect(['choices']);
    await this.click({x:.145+index*.1785,y:.52});
    const frame=await this.expect(['choices']);
    // Only a positively identified confirmation inside the choices modal is actionable.
    const confirm=frame.lines.find(l=>OCR.compact(l.text)==='确认'&&
      (l.x+l.width/2)/frame.width>.38&&(l.x+l.width/2)/frame.width<.62&&l.y/frame.height>.73);
    if(!confirm)throw Error('未识别候选窗口中央的确认按钮，已停止临时选人');
    await this.click(this.point(confirm));
    await this.expect([record.kind==='reserve'?'reserves':'lineup']);
    selected.add(OCR.key(player.name));record.temporarySelection={name:player.name,rating:player.rating,index};
    this.save();
  }
}
module.exports={Collector};
