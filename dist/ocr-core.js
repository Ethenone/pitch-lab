(function(global){
  'use strict';
  const POS={ST:'中锋',LW:'左边锋',RW:'右边锋',CM:'中前卫',LM:'左前卫',RM:'右前卫',CAM:'前腰',CDM:'后腰',CB:'中后卫',LB:'左后卫',RB:'右后卫',GK:'门将'};
  const compact=s=>String(s||'').normalize('NFKC').replace(/\s/g,'');
  const name=s=>{const text=compact(s);const prefixed=text.match(/[A-Za-z0][.,，．·][\u4e00-\u9fff]+/);return (prefixed?prefixed[0]:text).replace(/^[0０][.,，．·]/,'O.').replace(/[，,．·]/g,'.').replace(/^[^A-Za-z\u4e00-\u9fff]+/,'');};
  const isPlayer=s=>/[A-Za-z0][.,，．·][\u4e00-\u9fff]/.test(compact(s));
  const key=s=>name(s).replace(/[.]/g,'').toUpperCase();
  const positions=s=>Object.entries(POS).filter(([,label])=>compact(s).includes(label)).map(([code])=>code);
  function identity(raw,allowed=[],players=[]){
    let value=name(raw),issue='';
    if(key(value)==='L马丁内斯'){
      const striker=allowed.includes('ST'),defender=allowed.some(p=>['CB','LB','RB'].includes(p));
      if(striker&&!defender)value='劳塔罗';
      else if(!defender||striker)issue='L.马丁内斯身份待确认：中锋为劳塔罗，后卫保留原名';
    }
    const found=players.filter(p=>key(p.name)===key(value));
    const people=new Set(found.map(p=>p.personId||p.name));
    if(people.size>1)issue='资料库存在同名不同人，请确认身份';
    if(!issue&&found.length)value=found[0].name;
    return {name:value,issue,known:!issue&&found.length>0,versions:issue?[]:found};
  }
  const center=l=>({x:l.x+l.width/2,y:l.y+l.height/2});
  const inside=(l,r)=>{const c=center(l);return c.x>=r.x&&c.x<r.x+r.width&&c.y>=r.y&&c.y<r.y+r.height;};
  const region=(frame,x,y,width,height)=>({x:x*frame.width,y:y*frame.height,width:width*frame.width,height:height*frame.height});
  function find(frame,text){return frame.lines.find(l=>compact(l.text).includes(text));}
  function blocker(frame){const text=compact(frame.text);return /不可选择预备队|18.*未.*翻卡/.test(text)?'游戏要求先完成阵容 18 人翻卡，才能查看预备队候选。已保留采集草稿；请在游戏中手动完成翻卡后再采集。':'';}
  function state(frame){const s=compact(frame.text);if(s.includes('选择一名球员'))return 'choices';if(s.includes('效力过的俱乐部'))return 'teams';if(s.includes('球员详情')&&(/传中|射术|盯人/.test(s)))return 'detail';if(s.includes('球员组合')&&s.includes('球员实力'))return 'combos';if(s.includes('阵容调整')&&s.includes('预备队'))return s.includes('当前阵容')?'lineup':'reserves';return 'unknown';}
  function detail(frame,players=[]){
    const info=frame.lines.filter(l=>inside(l,region(frame,.28,.20,.43,.25)));
    const pos=positions(info.map(l=>l.text).join(' '));
    const candidate=info.find(l=>isPlayer(l.text))||info.find(l=>/^[\u4e00-\u9fff]{2,10}$/.test(compact(l.text))&&!positions(l.text).length&&!/进攻|防守|技巧/.test(compact(l.text)));
    const who=identity(candidate?.text||'',pos,players);
    const nationLine=info.find(l=>/\d{4}/.test(compact(l.text)));
    const nationRaw=nationLine?(compact(nationLine.text).match(/^[\u4e00-\u9fff]+/)||[])[0]||'':'';
    const nations=[...new Set(players.map(p=>p.nationality).filter(Boolean))].sort((a,b)=>b.length-a.length);
    const nationality=nations.find(n=>nationRaw.startsWith(compact(n)))||nationRaw;
    const issues=[who.issue,!who.name?'姓名未识别':'',!pos.length?'可踢位置未识别':'',!nationality?'国籍未识别':''].filter(Boolean);
    return {name:who.name,rating:null,positions:pos,nationality,teams:who.versions[0]?.teams||[],known:who.known,issues};
  }
  function rating(frame){const values=frame.lines.flatMap(l=>(compact(l.text).match(/\d{2,3}/g)||[]).map(Number)).filter(n=>n>=30&&n<=150);const unique=[...new Set(values)];return unique.length===1?unique[0]:null;}
  function combos(frame,players,currentName){
    const panel=frame.lines.filter(l=>inside(l,region(frame,.285,.24,.69,.71)));
    const titles=panel.filter(l=>l.x/frame.width<.34&&/[\u4e00-\u9fff]{2}/.test(compact(l.text))&&!positions(l.text).length&&!/球员|深造/.test(compact(l.text))).sort((a,b)=>a.y-b.y);
    return titles.map((title,index)=>{
      const bottom=titles[index+1]?.y||frame.height*.95;
      const row=panel.filter(l=>l.y>title.y+title.height&&l.y<bottom);
      const issues=[],members=[];
      for(let col=0;col<3;col++){
        const left=(.38+col*.215)*frame.width,right=(.59+col*.215)*frame.width;
        const lines=row.filter(l=>center(l).x>=left&&center(l).x<right);
        const candidate=lines.find(l=>isPlayer(l.text))||lines.find(l=>/^[\u4e00-\u9fff]{2,8}$/.test(compact(l.text))&&!positions(l.text).length);
        const who=identity(candidate?.text||'',positions(lines.map(l=>l.text).join(' ')),players);
        members.push(who.name);if(who.issue)issues.push(who.issue);
      }
      // Do not guess a missing member from the currently viewed player.
      if(members.some(m=>!m)||new Set(members.map(key)).size!==3)issues.push('组合成员未完整识别，请校对三个人名');
      return {name:compact(title.text).replace(/^[^\u4e00-\u9fffA-Za-z]+/,''),members,issues};
    });
  }
  function teams(frame){return frame.lines.map(l=>compact(l.text)).filter(s=>s&&!/效力|俱乐部|评分|潜力/.test(s)&&/[\u4e00-\u9fff]/.test(s));}
  function validateDraft(draft){
    if(!draft||!Array.isArray(draft.slots)||!draft.slots.length)throw Error('没有采集结果');
    for(const slot of draft.slots){
      if(slot.players.length!==5)throw Error(`${slot.label} 需要完整的 5 名候选`);
      const seen=new Set();
      for(const p of slot.players){
        if(!p.name?.trim()||!Number.isInteger(Number(p.rating))||p.rating<1||p.rating>999||!p.nationality?.trim()||!p.positions?.length||p.positions.some(x=>!POS[x]))throw Error(`${slot.label}：${p.name||'球员'} 的姓名、评分、国家或位置不完整`);
        if(p.issues?.length)throw Error(`${p.name} 仍有未确认的识别问题`);
        if(seen.has(key(p.name)))throw Error(`${slot.label} 存在重复球员`);seen.add(key(p.name));
      }
    }
    for(const combo of draft.combos||[]){if(!combo.name||combo.members.length!==3||combo.members.some(m=>!m.trim())||new Set(combo.members.map(key)).size!==3||combo.issues?.length)throw Error(`组合 ${combo.name||'未命名'} 尚未校对完整`);}
    return true;
  }
  function mergeDraft(current,draft,merge,newId){
    validateDraft(draft);
    if(draft.slots.length!==current.groups.length||draft.slots.some(s=>!current.groups.some(g=>g.id===s.groupId&&g.kind===s.kind&&g.position===s.position)))throw Error('比赛位置已改变，请重新采集');
    // OCR normalization resolves spacing and punctuation before using the existing merge.
    const incoming={players:draft.slots.flatMap(s=>s.players).map(p=>{const who=identity(p.name,p.positions,current.players);if(who.issue)throw Error(who.issue);return {...p,name:who.name};}),combos:draft.combos.map(c=>({...c,members:c.members.map(m=>current.players.find(p=>key(p.name)===key(m))?.name||m)}))};
    const result=merge(current,incoming,newId);
    result.data.groups=current.groups.map(g=>{const slot=draft.slots.find(s=>s.groupId===g.id);return {...g,options:slot.players.map(p=>{const who=identity(p.name,p.positions,result.data.players);const found=result.data.players.find(x=>key(x.name)===key(who.name)&&Number(x.rating)===Number(p.rating));if(!found)throw Error('无法匹配导入后的球员');return found.id;})};});
    return result;
  }
  const api={POS,compact,name,key,positions,identity,inside,region,find,blocker,state,detail,rating,combos,teams,validateDraft,mergeDraft};
  global.PitchOCR=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
