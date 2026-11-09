(function(global){
  'use strict';
  const base=global.PitchSolver;
  const norm=value=>String(value||'').trim().toLocaleLowerCase();
  const personKey=p=>p.personId||norm(p.name)||p.id;
  const countBits=value=>{let count=0;for(;value;value&=value-1)count++;return count;};
  const random=n=>Math.floor(Math.random()*n);
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

  function attributeMaps(groups,byId){
    const maps={team:new Map(),nation:new Map()};
    for(const group of groups)for(const id of group.options){
      const p=byId.get(id),identity=personKey(p);
      for(const team of new Set((p.teams||[]).map(norm).filter(Boolean))){
        if(!maps.team.has(team))maps.team.set(team,new Set());
        maps.team.get(team).add(identity);
      }
      const nation=norm(p.nationality);
      if(nation){if(!maps.nation.has(nation))maps.nation.set(nation,new Set());maps.nation.get(nation).add(identity);}
    }
    return maps;
  }
  function possibleTargetCount(groups,byId,kind,name){
    const matched=new Map();
    function augment(groupIndex,seen){
      for(const id of groups[groupIndex].options){
        const p=byId.get(id),has=kind==='team'?(p.teams||[]).some(t=>norm(t)===name):norm(p.nationality)===name;
        if(!has)continue;
        const identity=personKey(p);
        if(seen.has(identity))continue;
        seen.add(identity);
        const previous=matched.get(identity);
        if(previous===undefined||augment(previous,seen)){matched.set(identity,groupIndex);return true;}
      }
      return false;
    }
    let total=0;
    for(let i=0;i<groups.length;i++)if(augment(i,new Set()))total++;
    return total;
  }
  function possibleStarterCount(groups,byId,slots,kind,name){
    const profiles=new Map();
    for(const group of groups)for(const id of group.options){
      const p=byId.get(id),has=kind==='team'?(p.teams||[]).some(t=>norm(t)===name):norm(p.nationality)===name;
      if(has){const identity=personKey(p),positions=profiles.get(identity)||new Set();(p.positions||[]).forEach(position=>positions.add(position));profiles.set(identity,positions);}
    }
    const matched=new Map();
    function augment(slotIndex,seen){
      for(const [identity,positions] of profiles){
        if(!positions.has(slots[slotIndex])||seen.has(identity))continue;
        seen.add(identity);
        const previous=matched.get(identity);
        if(previous===undefined||augment(previous,seen)){matched.set(identity,slotIndex);return true;}
      }
      return false;
    }
    let total=0;
    for(let i=0;i<slots.length;i++)if(augment(i,new Set()))total++;
    return total;
  }
  function buildTargets(groups,byId,slots,limit){
    const maps=attributeMaps(groups,byId);
    const candidates=kind=>[...maps[kind]].filter(([,people])=>people.size>=6).map(([name])=>({name,count:Math.min(possibleTargetCount(groups,byId,kind,name),possibleStarterCount(groups,byId,slots,kind,name))})).filter(x=>x.count>=6).sort((a,b)=>b.count-a.count).slice(0,8);
    const teams=candidates('team'),nations=candidates('nation');
    const targets=[{team:null,nation:null,rank:0}];
    for(const t of teams)targets.push({team:t.name,nation:null,rank:t.count});
    for(const n of nations)targets.push({team:null,nation:n.name,rank:n.count});
    for(const t of teams)for(const n of nations)targets.push({team:t.name,nation:n.name,rank:t.count+n.count+5});
    const baseline=targets.shift();
    targets.sort((a,b)=>b.rank-a.rank);
    return [baseline,...targets.slice(0,Math.max(1,limit)-1)];
  }
  function targetWeight(p,target){
    if(!target)return 0;
    return (target.team&&(p.teams||[]).some(t=>norm(t)===target.team)?70:0)+(target.nation&&norm(p.nationality)===target.nation?70:0);
  }
  function randomPicks(groups,byId,target){
    const order=groups.map((g,index)=>({...g,index})).sort((a,b)=>a.options.length-b.options.length);
    const chosen=new Array(groups.length),used=new Set();let steps=0;
    function assign(depth){
      if(depth===order.length)return true;
      if(++steps>50000)return false;
      const group=order[depth];
      const choices=group.options.map(id=>({id,weight:Number(byId.get(id).rating||0)+targetWeight(byId.get(id),target)+Math.random()*75})).sort((a,b)=>b.weight-a.weight);
      for(const {id} of choices){
        const identity=personKey(byId.get(id));
        if(used.has(identity))continue;
        used.add(identity);chosen[group.index]=id;
        if(assign(depth+1))return true;
        used.delete(identity);
      }
      return false;
    }
    return assign(0)?chosen:null;
  }
  function seedRoster(picked,slots,byId,target){
    const order=slots.map((position,index)=>({position,index,options:picked.filter(id=>(byId.get(id).positions||[]).includes(position))})).sort((a,b)=>a.options.length-b.options.length);
    if(order.some(x=>!x.options.length))return null;
    const starters=new Array(11),used=new Set();let steps=0;
    function assign(depth){
      if(depth===11)return true;
      if(++steps>15000)return false;
      const slot=order[depth];
      const options=slot.options.filter(id=>!used.has(personKey(byId.get(id)))).map(id=>({id,weight:Number(byId.get(id).rating||0)+targetWeight(byId.get(id),target)+Math.random()*45})).sort((a,b)=>b.weight-a.weight);
      for(const {id} of options){
        const identity=personKey(byId.get(id));used.add(identity);starters[slot.index]=id;
        if(assign(depth+1))return true;
        used.delete(identity);
      }
      return false;
    }
    if(!assign(0))return null;
    const bench=picked.filter(id=>!used.has(personKey(byId.get(id)))).map(id=>({id,weight:Number(byId.get(id).rating||0)+targetWeight(byId.get(id),target)+Math.random()*40})).sort((a,b)=>b.weight-a.weight).slice(0,7).map(x=>x.id);
    return bench.length===7?[...starters,...bench]:null;
  }
  function matchSlots(mask,eligible){
    const order=eligible.map((bits,index)=>({index,bits:bits&mask})).sort((a,b)=>countBits(a.bits)-countBits(b.bits));
    if(!order[0].bits)return null;
    const playerToSlot=new Array(18).fill(-1);
    function assign(slot,seen){
      let bits=eligible[slot]&mask;
      while(bits){
        const bit=bits&-bits,index=31-Math.clz32(bit);bits^=bit;
        if(seen.has(index))continue;
        seen.add(index);
        if(playerToSlot[index]<0||assign(playerToSlot[index],seen)){playerToSlot[index]=slot;return true;}
      }
      return false;
    }
    for(const entry of order)if(!assign(entry.index,new Set()))return null;
    const slotToPlayer=new Array(11);
    playerToSlot.forEach((slot,index)=>{if(slot>=0)slotToPlayer[slot]=index;});
    return slotToPlayer;
  }
  function evaluateRoster(ids,slots,players,combos,priority){
    if(ids.length!==18)return null;
    const byId=new Map(players.map(p=>[p.id,p])),roster=ids.map(id=>byId.get(id));
    if(roster.some(p=>!p)||new Set(roster.map(personKey)).size!==18)return null;
    const eligible=slots.map(position=>roster.reduce((bits,p,index)=>(p.positions||[]).includes(position)?bits|1<<index:bits,0));
    if(eligible.some(bits=>!bits))return null;
    const profiles={team:new Map(),nation:new Map()};
    roster.forEach((p,index)=>{
      for(const team of new Set((p.teams||[]).map(norm).filter(Boolean)))profiles.team.set(team,(profiles.team.get(team)||0)|(1<<index));
      const nation=norm(p.nationality);if(nation)profiles.nation.set(nation,(profiles.nation.get(nation)||0)|(1<<index));
    });
    const groups=Object.entries(profiles).flatMap(([kind,profile])=>[...profile.values()].map(mask=>({kind,mask,total:countBits(mask)})));
    const nameIndex=new Map(roster.map((p,index)=>[norm(p.name),index]));
    const comboMasks=[];
    for(const combo of combos){
      const members=(combo.members||[]).map(norm);
      if(members.length!==3||new Set(members).size!==3||members.some(name=>!nameIndex.has(name)))continue;
      comboMasks.push(members.reduce((mask,name)=>mask|1<<nameIndex.get(name),0));
    }
    let bestValue=-Infinity,bestMask=0,bestAssignment=null;
    const limit=1<<18;
    for(let mask=(1<<11)-1;mask<limit;){
      let rating=0;
      for(let i=0;i<18;i++)if(mask&(1<<i))rating+=Number(roster[i].rating||0);
      let chemistry=0,bestTeam=0;
      for(const group of groups){const starters=countBits(group.mask&mask),value=base.tier(starters,group.total-starters);if(group.kind==='team')bestTeam=Math.max(bestTeam,value);else chemistry+=value;}
      chemistry+=bestTeam;
      for(const bits of comboMasks){const starters=countBits(bits&mask);chemistry+=starters===3?20:starters===2?10:starters===1?5:0;}
      chemistry=base.capChemistry(chemistry);
      const percent=base.ratingBonusTier(rating).percent;
      const finalScore=Math.round((rating+chemistry*(1+percent/100))*100)/100;
      const value=priority==='rating'?rating*100000+chemistry:priority==='chemistry'?chemistry*100000+rating:finalScore;
      if(value>bestValue){const assignment=matchSlots(mask,eligible);if(assignment){bestValue=value;bestMask=mask;bestAssignment=assignment;}}
      const low=mask&-mask,next=mask+low;
      mask=(((next^mask)>>>2)/low)|next;
    }
    if(!bestAssignment)return null;
    const state={starters:bestAssignment.map(index=>ids[index]),bench:ids.filter((_,index)=>!(bestMask&(1<<index))),picked:null};
    const score=base.score(state,players,combos,priority);
    return {state,score};
  }
  function mutateOuter(current,groups,byId,target){
    const picked=[...current.picked],roster=[...current.roster];
    const outside=picked.filter(id=>!roster.includes(id));
    if(outside.length&&Math.random()<.3){
      const options=outside.map(id=>({id,weight:Number(byId.get(id).rating||0)+targetWeight(byId.get(id),target)+Math.random()*70})).sort((a,b)=>b.weight-a.weight);
      roster[random(18)]=options[Math.min(random(Math.min(3,options.length)),options.length-1)].id;
    }else{
      const order=groups.map((_,index)=>index).sort(()=>Math.random()-.5);
      let changed=false;
      for(const groupIndex of order){
        const used=new Set(picked.filter((_,index)=>index!==groupIndex).map(id=>personKey(byId.get(id))));
        const options=groups[groupIndex].options.filter(id=>id!==picked[groupIndex]&&!used.has(personKey(byId.get(id))));
        if(!options.length)continue;
        const weighted=options.map(id=>({id,weight:Number(byId.get(id).rating||0)+targetWeight(byId.get(id),target)+Math.random()*90})).sort((a,b)=>b.weight-a.weight);
        const replacement=weighted[Math.min(random(Math.min(3,weighted.length)),weighted.length-1)].id;
        const rosterIndex=roster.indexOf(picked[groupIndex]);
        roster[rosterIndex>=0?rosterIndex:random(18)]=replacement;
        picked[groupIndex]=replacement;changed=true;break;
      }
      if(!changed)return null;
    }
    return {picked,roster};
  }
  async function optimize({players,combos,groups,slots,priority='final',duration=5000,targetLimit=24,onProgress}){
    if(!Array.isArray(groups)||groups.length<18||slots.length!==11)throw Error('比赛模式需要 11 个首发位置和至少 18 个候选位置。');
    const byId=new Map(players.map(p=>[p.id,p]));
    const cleanGroups=groups.map(g=>({id:g.id,options:[...new Set(g.options||[])].filter(id=>byId.has(id))}));
    if(cleanGroups.some(g=>!g.options.length))throw Error('每个比赛位置都需要至少一名候选球员。');
    if(new Set(cleanGroups.flatMap(g=>g.options.map(id=>personKey(byId.get(id))))).size<cleanGroups.length)throw Error('每个比赛位置需要能选出不同球员。');
    const targets=buildTargets(cleanGroups,byId,slots,targetLimit),cache=new Map();
    let evaluations=0,attempts=0,accepted=0,targetIndex=0,best=null,current=null,stalled=0;
    const start=performance.now();let lastReport=start;
    function evaluate(candidate){
      const key=[...candidate.roster].sort().join('\u0000');
      if(!cache.has(key)){cache.set(key,evaluateRoster(candidate.roster,slots,players,combos,priority));evaluations++;}
      const found=cache.get(key);
      return found?{...candidate,evaluation:found}:null;
    }
    function seed(target){
      for(let tries=0;tries<15;tries++){
        const picked=randomPicks(cleanGroups,byId,target);
        if(!picked)break;
        const roster=seedRoster(picked,slots,byId,target);
        if(roster){const candidate=evaluate({picked,roster});if(candidate)return candidate;}
      }
      return null;
    }
    for(let i=0;i<targets.length&&!current;i++){current=seed(targets[i]);targetIndex=i;}
    if(!current)throw Error('无法找到符合位置限制的 18 人名单，请补充位置候选。');
    best=current;
    while(performance.now()-start<duration){
      attempts++;
      const target=targets[targetIndex%targets.length];
      const changed=mutateOuter(current,cleanGroups,byId,target);
      const candidate=changed?evaluate(changed):null;
      if(candidate&&candidate.evaluation.score.value>current.evaluation.score.value){
        current=candidate;accepted++;stalled=0;
        if(candidate.evaluation.score.value>best.evaluation.score.value)best=candidate;
      }else stalled++;
      if(stalled>=6){
        targetIndex++;stalled=0;
        const fresh=seed(targets[targetIndex%targets.length]);
        if(fresh){current=fresh;if(fresh.evaluation.score.value>best.evaluation.score.value)best=fresh;}
      }
      if(onProgress&&performance.now()-lastReport>350){onProgress({iterations:attempts,evaluations,bestScore:best.evaluation.score});lastReport=performance.now();}
      await pause();
    }
    return {state:{...best.evaluation.state,picked:best.picked.map((id,index)=>({groupId:cleanGroups[index].id,id}))},score:best.evaluation.score,iterations:attempts,evaluations,accepted,slots,exact:false,rosterExact:true,algorithm:'guided',searchSettings:{duration}};
  }
  global.PitchGuidedSolver={optimize,evaluateRoster,buildTargets};
  if(typeof module!=='undefined')module.exports=global.PitchGuidedSolver;
})(typeof window!=='undefined'?window:globalThis);
