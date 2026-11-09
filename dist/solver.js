(function(global){
  'use strict';
  const norm = value => String(value||'').trim().toLocaleLowerCase();
  const rand = n => Math.floor(Math.random()*n);
  const personKey = p => p.personId||norm(p.name)||p.id;
  const FORMATIONS = {
    '4-3-3':['GK','LB','CB','CB','RB','CM','CDM','CM','LW','ST','RW'],
    '4-2-3-1':['GK','LB','CB','CB','RB','CDM','CDM','LW','CAM','RW','ST'],
    '4-4-2':['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'],
    '3-5-2':['GK','CB','CB','CB','LM','CM','CDM','CM','RM','ST','ST']
  };
  function tier(starters,bench){
    if(starters===11){if(bench===7)return 100;if(bench>=4)return 80;if(bench>=2)return 60;return 40;}
    if(starters>=8)return 30;if(starters>=6)return 20;return 0;
  }
  const capChemistry=value=>Math.min(100,value);
  function ratingBonusTier(rating){
    // 990, 995, 1001...: the thresholds alternate between 5 and 6 points.
    // Bonus increases repeat twice: +15, +15, +20, +20, +25, +25...
    if(rating<990)return {from:null,to:989,percent:0};
    const index=Math.ceil((rating-989)*2/11)-1;
    const from=Math.floor(990+5.5*index);
    const to=Math.floor(990+5.5*(index+1))-1;
    const pairs=Math.floor(index/2);
    const percent=30+5*pairs*pairs+25*pairs+(index%2?15+5*pairs:0);
    return {from,to,percent};
  }
  function score(state,players,combos,priority){
    const byId=new Map(players.map(p=>[p.id,p]));
    const start=state.starters.map(id=>byId.get(id));
    const bench=state.bench.map(id=>byId.get(id));
    if(start.some(p=>!p)||bench.some(p=>!p))return null;
    if(new Set([...start,...bench].map(personKey)).size!==18)return null;
    const rating=start.reduce((sum,p)=>sum+Number(p.rating||0),0);
    const bonus=[];let chemistry=0;
    for(const kind of ['team','nation']){
      const map=new Map();
      for(const [list,role] of [[start,0],[bench,1]])for(const p of list){
        const names=kind==='team'?p.teams:[p.nationality];
        for(const raw of new Set(names.map(norm).filter(Boolean))){
          const entry=map.get(raw)||{label:kind==='team'?p.teams.find(t=>norm(t)===raw):p.nationality,start:0,bench:0,starterIds:[],benchIds:[]};
          if(role===0){entry.start++;entry.starterIds.push(p.id);}else{entry.bench++;entry.benchIds.push(p.id);}
          map.set(raw,entry);
        }
      }
      let bestTeam=null;
      for(const entry of map.values()){
        const value=tier(entry.start,entry.bench);
        if(value){
          const item={type:kind,label:entry.label,value,start:entry.start,bench:entry.bench,starterIds:entry.starterIds,benchIds:entry.benchIds};
          if(kind==='team'){if(!bestTeam||value>bestTeam.value)bestTeam=item;}
          else{chemistry+=value;bonus.push(item);}
        }
      }
      if(bestTeam){chemistry+=bestTeam.value;bonus.push(bestTeam);}
    }
    for(const combo of combos){
      const members=(combo.members||[]).map(norm);
      if(members.length!==3||new Set(members).size!==3)continue;
      const memberSet=new Set(members);
      const starterIds=start.filter(p=>memberSet.has(norm(p.name))).map(p=>p.id);
      const benchIds=bench.filter(p=>memberSet.has(norm(p.name))).map(p=>p.id);
      const count=starterIds.length,benchCount=benchIds.length;
      const value=count===3?20:count===2&&benchCount===1?10:count===1&&benchCount===2?5:0;
      if(value){chemistry+=value;bonus.push({type:'combo',label:combo.name,value,start:count,bench:benchCount,starterIds,benchIds});}
    }
    const rawChemistry=chemistry;
    chemistry=capChemistry(rawChemistry);
    const ratingTier=ratingBonusTier(rating);
    const finalScore=Math.round((rating+chemistry*(1+ratingTier.percent/100))*100)/100;
    const value=priority==='rating'?rating*100000+chemistry:priority==='chemistry'?chemistry*100000+rating:finalScore;
    return {chemistry,rawChemistry,rating,ratingTier,finalScore,bonus,value};
  }
  function randomSelection(groups,byId){
    const chosen=[];const used=new Set();
    const ordered=[...groups].sort((a,b)=>a.options.length-b.options.length);
    let steps=0;
    function assign(index){
      if(index===ordered.length)return true;
      if(++steps>12000)return false;
      const group=ordered[index],choices=[...group.options].sort(()=>Math.random()-.5);
      for(const id of choices){
        const identity=personKey(byId.get(id));
        if(used.has(identity))continue;
        used.add(identity);chosen.push({groupId:group.id,id});
        if(assign(index+1))return true;
        chosen.pop();used.delete(identity);
      }
      return false;
    }
    return assign(0)?chosen:null;
  }
  function buildState(ids,players,slots,groups){
    const byId=new Map(players.map(p=>[p.id,p]));
    for(let tries=0;tries<120;tries++){
      const picked=groups?randomSelection(groups,byId):null;
      if(groups&&!picked)continue;
      const available=groups?picked.map(x=>x.id):ids;
      if(new Set(available.map(id=>personKey(byId.get(id)))).size<18)continue;
      const order=slots.map((pos,i)=>({pos,i,options:available.filter(id=>byId.get(id)?.positions.includes(pos))})).sort((a,b)=>a.options.length-b.options.length);
      if(order.some(x=>!x.options.length))continue;
      const assigned=new Array(11);const used=new Set();
      function assign(depth){
        if(depth===order.length)return true;
        const entry=order[depth];
        const options=entry.options.filter(id=>!used.has(personKey(byId.get(id)))).sort((a,b)=>Number(byId.get(b).rating)-Number(byId.get(a).rating)+(Math.random()-.5)*35);
        for(const id of options){const identity=personKey(byId.get(id));used.add(identity);assigned[entry.i]=id;if(assign(depth+1))return true;used.delete(identity);}
        return false;
      }
      if(!assign(0))continue;
      const remaining=available.filter(id=>!used.has(personKey(byId.get(id)))).sort((a,b)=>Number(byId.get(b).rating)-Number(byId.get(a).rating)+(Math.random()-.5)*50);
      const bench=[];
      for(const id of remaining){const identity=personKey(byId.get(id));if(used.has(identity))continue;bench.push(id);used.add(identity);if(bench.length===7)break;}
      if(bench.length===7)return {starters:assigned,bench,picked};
    }
    return null;
  }
  function mutate(state,allIds,players,slots,groups){
    const next={starters:[...state.starters],bench:[...state.bench],picked:state.picked?state.picked.map(x=>({...x})):null};
    const byId=new Map(players.map(p=>[p.id,p]));
    const selected=groups?next.picked.map(x=>x.id):allIds;
    const inRoster=new Set([...next.starters,...next.bench]);
    const outside=selected.filter(id=>!inRoster.has(id));
    const action=rand(groups?5:4);
    if(action===0){
      const a=rand(11),b=rand(11);
      if(a===b||!byId.get(next.starters[a]).positions.includes(slots[b])||!byId.get(next.starters[b]).positions.includes(slots[a]))return null;
      [next.starters[a],next.starters[b]]=[next.starters[b],next.starters[a]];
    }else if(action===1){
      const a=rand(11),b=rand(7);
      if(!byId.get(next.bench[b]).positions.includes(slots[a]))return null;
      [next.starters[a],next.bench[b]]=[next.bench[b],next.starters[a]];
    }else if(action===2){
      if(!outside.length)return null;
      const a=rand(11),id=outside[rand(outside.length)];
      if(!byId.get(id).positions.includes(slots[a]))return null;
      next.starters[a]=id;
    }else if(action===3){
      if(!outside.length)return null;
      next.bench[rand(7)]=outside[rand(outside.length)];
    }else{
      const group=groups[rand(groups.length)];
      const picked=next.picked.find(x=>x.groupId===group.id);
      const used=new Set(next.picked.filter(x=>x.groupId!==group.id).map(x=>personKey(byId.get(x.id))));
      const options=group.options.filter(id=>!used.has(personKey(byId.get(id)))&&id!==picked.id);
      if(!options.length)return null;
      const id=options[rand(options.length)];
      const index=next.starters.indexOf(picked.id);
      if(index>=0){if(!byId.get(id).positions.includes(slots[index]))return null;next.starters[index]=id;}
      else{const b=next.bench.indexOf(picked.id);if(b>=0)next.bench[b]=id;}
      picked.id=id;
    }
    if(new Set([...next.starters,...next.bench].map(id=>personKey(byId.get(id)))).size!==18)return null;
    if(groups&&new Set(next.picked.map(x=>personKey(byId.get(x.id)))).size!==next.picked.length)return null;
    return next;
  }
  async function optimize({players,combos,ids,groups,formation,slots:requestedSlots,priority='final',duration=4500,exploration=1,restartEvery=7000,onProgress}){
    const slots=[...(requestedSlots||FORMATIONS[formation]||FORMATIONS['4-3-3'])];
    const validPositions=new Set(Object.values(FORMATIONS).flat());
    if(slots.length!==11||slots.some(pos=>!validPositions.has(pos)))throw Error('请为 11 个首发位置分别指定有效位置。');
    const byId=new Map(players.map(p=>[p.id,p]));
    const cleanGroups=groups?groups.map(g=>({id:g.id,options:[...new Set(g.options)].filter(id=>byId.has(id))})):null;
    if(cleanGroups&&cleanGroups.some(g=>g.options.length===0))throw Error('每个比赛位置都需要至少一名候选球员。');
    if(cleanGroups&&new Set(cleanGroups.flatMap(g=>g.options.map(id=>personKey(byId.get(id))))).size<cleanGroups.length)throw Error('比赛位置需要足够多的不同球员；同一球员的评分版本只能选一个。');
    const cleanIds=[...new Set(ids)].filter(id=>byId.has(id));
    if(cleanGroups?cleanGroups.length<18:new Set(cleanIds.map(id=>personKey(byId.get(id)))).size<18)throw Error('至少需要 18 名不同球员或比赛位置。');
    let current=buildState(cleanIds,players,slots,cleanGroups);
    if(!current)throw Error('没有找到满足位置限制且同一球员只选一个评分版本的阵容，请补充各位置候选。');
    let currentScore=score(current,players,combos,priority);
    let best=current,bestScore=currentScore,iterations=0,accepted=0;
    const startTime=performance.now();let lastReport=startTime;
    while(performance.now()-startTime<duration){
      for(let k=0;k<1200;k++){
        iterations++;
        const candidate=mutate(current,cleanIds,players,slots,cleanGroups);
        if(!candidate)continue;
        const candidateScore=score(candidate,players,combos,priority);
        const elapsed=(performance.now()-startTime)/duration;
        const temp=(priority==='final'?80:priority==='chemistry'?500000:150000)*exploration*Math.pow(.005,Math.min(1,elapsed));
        const diff=candidateScore.value-currentScore.value;
        if(diff>=0||Math.random()<Math.exp(diff/temp)){
          current=candidate;currentScore=candidateScore;accepted++;
          if(candidateScore.value>bestScore.value){best=candidate;bestScore=candidateScore;}
        }
        if(restartEvery>0&&iterations%restartEvery===0){
          const fresh=buildState(cleanIds,players,slots,cleanGroups);
          if(fresh){current=fresh;currentScore=score(fresh,players,combos,priority);}
        }
      }
      if(onProgress&&performance.now()-lastReport>350){onProgress({iterations,bestScore});lastReport=performance.now();}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    return {state:best,score:bestScore,iterations,accepted,slots,exact:false,searchSettings:{duration,exploration,restartEvery}};
  }
  global.PitchSolver={FORMATIONS,tier,capChemistry,ratingBonusTier,score,optimize};
  if(typeof module!=='undefined')module.exports=global.PitchSolver;
})(typeof window!=='undefined'?window:globalThis);
