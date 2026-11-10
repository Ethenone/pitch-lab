const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {Collector}=require('../desktop/automation/collector.cjs');
const line=(text,x,y,width=100,height=20)=>({text,x,y,width,height});
const frames={
 lineup:{width:1600,height:900,text:'阵容调整 预备队 当前阵容',lines:[line('阵容调整',100,150),line('预备队',350,150)]},
 choices:{width:1600,height:900,text:'选择一名球员 确认',lines:[line('选择一名球员',650,200,250,40),line('确认',750,760,100,30)]}
};
(async()=>{
 let page='lineup',choice=0,clicks=0;
 const players=Array.from({length:5},(_,i)=>({id:String(i),name:`${String.fromCharCode(65+i)}.球员甲`,rating:96,positions:['ST'],nationality:'阿根廷',teams:['球队']}));
 const bridge={call:async(op,args)=>{
  if(op==='health')return {ready:true};
  if(op==='bind')return {handle:'123',window:{x:0,y:0,width:1600,height:900}};
  if(op==='focus'||op==='capture')return {};
  if(op==='click'){
    clicks++;
    if(page==='lineup'&&args.y>300)page='choices';
    else if(page==='choices'&&args.y>700)page='lineup';
    else if(page==='choices'&&args.y>400)return {};
    else if(page==='choices'&&args.y>270){choice=Math.round((args.x/1600-.214)/.1785);page='detail';}
    else if(page==='detail')page='choices';
    else if(page==='choices'&&args.x>1400)page='lineup';
    return {};
  }
  if(op==='ocr'){
    if(args.crop)return {width:1600,height:900,text:'96',lines:[line('96',1460,360)]};
    if(page!=='detail')return frames[page];
    return {width:1600,height:900,text:'球员详情 传中 射术',lines:[line(players[choice].name,500,245,170),line('中锋',470,300),line('阿根廷 1990-01-01',460,340,220),line('评分',1450,320,65)]};
  }
  throw Error('Unexpected operation '+op);
 }};
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pitch-ocr-test-'));
 const collector=new Collector(bridge,directory);
 // Disable only animation delays in this deterministic fake UI, retain state guards.
 const click=collector.click.bind(collector);collector.click=async p=>{collector.config.delay=1;await click(p);};
 const slot={id:'slot',kind:'starter',position:'ST',label:'首发1',point:{x:.5,y:.6}};
 const draft=await collector.run({rect:{x:0,y:0,width:1600,height:900},slots:[slot],delay:1},{players,groups:[slot],combos:[]});
 assert.equal(draft.status,'complete',draft.error);
 assert.deepEqual(draft.slots[0].players.map(p=>p.name),players.map(p=>p.name));
 assert.ok(draft.slots[0].players.every(p=>p.rating===96));
 assert.equal(clicks,13,'One tab, slot, five detail/back pairs, and close. No confirm-selection click.');
 page='lineup';clicks=0;
 const selectedDraft=await collector.run({rect:{x:0,y:0,width:1600,height:900},slots:[slot],delay:1,temporarySelection:true},{players,groups:[slot],combos:[]});
 assert.equal(selectedDraft.status,'complete',selectedDraft.error);
 assert.equal(clicks,14,'Reading plus card selection and modal confirmation; no lock action.');
 assert.equal(selectedDraft.slots[0].temporarySelection.name,players[0].name);
 const selected=new Set([players[0].name.replace('.','')]);
 page='choices';await collector.selectTemporary(selectedDraft.slots[0],selected);
 assert.equal(selectedDraft.slots[0].temporarySelection.name,players[1].name,'Exclude the same person regardless of rating');
 await assert.rejects(()=>collector.selectTemporary({label:'首发',kind:'starter',position:'GK',players},new Set()),/没有可临时选择/);
 const noConfirm=new Collector(bridge,directory);noConfirm.expect=async()=>({...frames.choices,lines:[line('锁定阵容',100,760)]});let safeClicks=0;noConfirm.click=async()=>safeClicks++;
 await assert.rejects(()=>noConfirm.selectTemporary({kind:'bench',players},new Set()),/确认按钮/);
 assert.equal(safeClicks,1,'A lock label can never substitute for modal confirmation');
 const ordered=new Collector(bridge,directory),visits=[];
 ordered.click=async p=>{ordered.config.delay=1;await Collector.prototype.click.call(ordered,p);};
 ordered.openSlot=async s=>{visits.push(s.kind);page='choices';return frames.choices;};
 const reversed=['reserve','bench','starter'].map(kind=>({...slot,id:kind,kind}));
 const orderedDraft=await ordered.run({rect:{x:0,y:0,width:1600,height:900},slots:reversed,delay:1},{players,groups:reversed,combos:[]});
 assert.equal(orderedDraft.status,'complete',orderedDraft.error);
 assert.deepEqual(visits,['starter','bench','reserve'],'Calibration order cannot move reserves ahead of the 18 roster slots');
 assert.ok(fs.existsSync(path.join(directory,'latest-draft.json')));
 collector.stop();await assert.rejects(()=>collector.click({x:.5,y:.5}),/已停止/);
 const unsafe=new Collector(bridge,directory);unsafe.target={};unsafe.config={rect:{x:0,y:0,width:1600,height:900}};
 await assert.rejects(()=>unsafe.click({x:1.1,y:.2}),/超出/);
 // A blocked native click must propagate without further inputs.
 unsafe.bridge={call:async()=>{throw Error('Target lost focus');}};
 await assert.rejects(()=>unsafe.click({x:.5,y:.5}),/lost focus/);
 const list=new Collector(bridge,directory);let wheels=0,drags=0;
 list.expect=async kinds=>kinds.includes('detail')?{width:1600,height:900,lines:[line('评分',1450,320,65)]}:{width:1600,height:900,lines:[line('效力过的俱乐部',1250,380,220)]};
 list.crop=async()=>({text:'球队甲 球队乙',lines:[line('球队甲',1330,430),line('球队乙',1330,480)]});
 list.click=async()=>{};list.scroll=async()=>wheels++;list.drag=async()=>drags++;
 const fresh={issues:[]};await list.readTeams(fresh);
 assert.equal(wheels,1);assert.equal(drags,2,'Try dragging before deciding unchanged content is the end');
 assert.deepEqual(fresh.teams,['球队甲','球队乙']);
 const lowRes=new Collector(bridge,directory);let fixedCrop;
 lowRes.crop=async rect=>{fixedCrop=rect;return {lines:[{text:'95'}]};};
 assert.equal(await lowRes.readRating({width:798,height:458,lines:[]}),95);
 assert.ok(Math.abs(fixedCrop.x-718.2)<1);
 const resumeDir=fs.mkdtempSync(path.join(os.tmpdir(),'pitch-resume-'));
 const cfg={rect:{x:0,y:0,width:1600,height:900},slots:[slot],delay:1,detailWaitMs:0},snapshot={players,groups:[slot],combos:[]};
 const interrupted=new Collector(bridge,resumeDir);let reads=0;
 interrupted.readRating=async()=>{if(++reads===3){interrupted.stop();throw Error('test interruption');}return 96;};
 page='lineup';const partial=await interrupted.run(cfg,snapshot);
 assert.equal(partial.status,'stopped');assert.equal(partial.slots[0].players.filter(p=>p.complete).length,2);
 assert.equal(page,'detail','Interruption leaves the game inside the third detail page');
 const resumed=new Collector(bridge,resumeDir);reads=0;resumed.readRating=async()=>{reads++;return 96;};
 const complete=await resumed.run({...cfg,detailWaitMs:1000},snapshot);
 assert.equal(complete.status,'complete',complete.error);assert.equal(reads,3,'Completed candidates must not be reread');
 assert.equal(complete.slots[0].players.length,5);assert.equal(complete.slots[0].done,true);
 assert.equal(resumed.signature(cfg,snapshot),resumed.signature({...cfg,delay:1500,detailWaitMs:10000},snapshot),'Wait settings may change without invalidating progress');
 assert.notEqual(resumed.signature(cfg,snapshot),resumed.signature({...cfg,rect:{...cfg.rect,x:10}},snapshot));
 assert.notEqual(resumed.signature(cfg,snapshot),resumed.signature(cfg,{...snapshot,combos:[{name:'changed'}]}));
 complete.status='stopped';complete.slots[0].done=false;complete.slots[0].fingerprint='different candidates';fs.writeFileSync(path.join(resumeDir,'latest-draft.json'),JSON.stringify(complete));
 page='lineup';const mismatch=await new Collector(bridge,resumeDir).run(cfg,snapshot);
 assert.match(mismatch.error,/候选名单.*不一致/);
 const slow=new Collector(bridge,directory);slow.config={detailWaitMs:1500};let polls=0;
 slow.frame=async()=>++polls<5?{text:'loading',lines:[]}: {text:'球员详情 传中 射术',lines:[]};
 await slow.expect(['detail']);assert.equal(polls,5,'Slow detail page receives additional attempts');
 slow.stop();await assert.rejects(()=>slow.expect(['detail']),/已停止/);
 console.log('OCR collector visits all five detail pages, preserves drafts and stops on invalid clicks/focus loss');
})().catch(e=>{console.error(e);process.exitCode=1;});
