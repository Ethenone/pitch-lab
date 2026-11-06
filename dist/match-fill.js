(function(global){
  'use strict';
  const norm=value=>String(value||'').trim().toLocaleLowerCase();
  const personKey=player=>player.personId||norm(player.name)||player.id;
  const shuffle=(items,random)=>{
    const copy=[...items];
    for(let i=copy.length-1;i>0;i--){
      const j=Math.floor(random()*(i+1));
      [copy[i],copy[j]]=[copy[j],copy[i]];
    }
    return copy;
  };
  function fill(groups,players,random=Math.random){
    const byId=new Map(players.map(player=>[player.id,player]));
    const byPerson=new Map();
    for(const player of players){
      const key=personKey(player);
      if(!byPerson.has(key))byPerson.set(key,[]);
      byPerson.get(key).push(player);
    }
    const eligible=(group,player)=>group.kind!=='starter'||(player.positions||[]).includes(group.position);
    const eligibleKeys=groups.map(group=>[...byPerson].filter(([,versions])=>versions.some(player=>eligible(group,player))).map(([key])=>key));
    let removed=0;
    const filled=groups.map(group=>{
      const options=[],seen=new Set();
      for(const id of group.options||[]){
        const player=byId.get(id),key=player&&personKey(player);
        if(!player||!eligible(group,player)||seen.has(key)){removed++;continue;}
        seen.add(key);options.push(id);
      }
      return {...group,options:options.slice(0,5)};
    });
    const candidates=filled.map((group,index)=>shuffle(group.options.length===5?group.options.map(id=>personKey(byId.get(id))):eligibleKeys[index],random));
    const order=shuffle(filled.map((_,index)=>index),random).sort((a,b)=>candidates[a].length-candidates[b].length);
    const owner=new Map(),assigned=new Map();
    function match(index,seen){
      for(const key of candidates[index]){
        if(seen.has(key))continue;
        seen.add(key);
        const previous=owner.get(key);
        if(previous===undefined||match(previous,seen)){
          owner.set(key,index);assigned.set(index,key);return true;
        }
      }
      return false;
    }
    for(const index of order)match(index,new Set());
    const pick=(group,key)=>{
      const versions=byPerson.get(key).filter(player=>eligible(group,player));
      return versions[Math.floor(random()*versions.length)].id;
    };
    let added=0;
    for(const [index,key] of assigned){
      const group=filled[index];
      if(group.options.length<5&&!group.options.some(id=>personKey(byId.get(id))===key)){
        group.options.push(pick(group,key));added++;
      }
    }
    for(let index=0;index<filled.length;index++){
      const group=filled[index],used=new Set(group.options.map(id=>personKey(byId.get(id))));
      for(const key of shuffle(eligibleKeys[index],random)){
        if(group.options.length===5)break;
        if(used.has(key))continue;
        group.options.push(pick(group,key));used.add(key);added++;
      }
    }
    return {groups:filled,added,removed,unfilledGroups:filled.filter(group=>group.options.length<5).length,emptyGroups:filled.filter(group=>!group.options.length).length,matchedGroups:owner.size};
  }
  global.PitchMatchFill={fill};
  if(typeof module!=='undefined')module.exports=global.PitchMatchFill;
})(typeof window!=='undefined'?window:globalThis);
