(function(global){
  'use strict';
  const norm=value=>String(value||'').trim().toLocaleLowerCase();
  const unique=(values)=>{
    const seen=new Set();
    return (Array.isArray(values)?values:[]).filter(value=>{
      const key=norm(value);
      if(!key||seen.has(key))return false;
      seen.add(key);return true;
    });
  };
  function merge(current,incoming,newId){
    const data={...current,players:current.players.map(p=>({...p,teams:[...(p.teams||[])],positions:[...(p.positions||[])]})),combos:current.combos.map(c=>({...c,members:[...(c.members||[])]}))};
    const byName=new Map(),usedPlayerIds=new Set(data.players.map(p=>p.id));
    for(const p of data.players){
      const key=norm(p.name);
      if(!byName.has(key))byName.set(key,[]);
      byName.get(key).push(p);
    }
    let addedPlayers=0,updatedPeople=0,addedCombos=0;
    for(const incomingPlayer of incoming.players||[]){
      const name=String(incomingPlayer.name||'').trim(),rating=Number(incomingPlayer.rating);
      if(!name||!Number.isFinite(rating))continue;
      const key=norm(name),versions=byName.get(key);
      if(versions){
        const base=versions[0],teams=unique([...(base.teams||[]),...(incomingPlayer.teams||[])]),positions=unique([...(base.positions||[]),...(incomingPlayer.positions||[])]);
        const changed=teams.length!==base.teams.length||positions.length!==base.positions.length||!base.nationality&&incomingPlayer.nationality;
        if(changed){
          for(const version of versions){version.teams=[...teams];version.positions=[...positions];version.nationality=base.nationality||incomingPlayer.nationality||'';}
          updatedPeople++;
        }
        if(versions.some(p=>Number(p.rating)===rating))continue;
        const id=usedPlayerIds.has(incomingPlayer.id)?newId():incomingPlayer.id||newId();
        usedPlayerIds.add(id);
        const player={...incomingPlayer,id,personId:base.personId||base.id,name:base.name,nationality:base.nationality||incomingPlayer.nationality||'',teams:[...teams],positions:[...positions],rating};
        versions.push(player);data.players.push(player);addedPlayers++;
      }else{
        const id=usedPlayerIds.has(incomingPlayer.id)?newId():incomingPlayer.id||newId();
        usedPlayerIds.add(id);
        const player={...incomingPlayer,id,personId:id,name,rating,teams:unique(incomingPlayer.teams),positions:unique(incomingPlayer.positions)};
        data.players.push(player);byName.set(key,[player]);addedPlayers++;
      }
    }
    const fingerprint=c=>`${norm(c.name)}\u0000${(c.members||[]).map(norm).sort().join('\u0000')}`;
    const seenCombos=new Set(data.combos.map(fingerprint)),usedComboIds=new Set(data.combos.map(c=>c.id));
    for(const combo of incoming.combos||[]){
      if(!combo.name||!Array.isArray(combo.members)||combo.members.length!==3)continue;
      const key=fingerprint(combo);
      if(seenCombos.has(key))continue;
      const id=usedComboIds.has(combo.id)?newId():combo.id||newId();
      usedComboIds.add(id);seenCombos.add(key);
      data.combos.push({...combo,id,members:[...combo.members]});addedCombos++;
    }
    return {data,addedPlayers,updatedPeople,addedCombos};
  }
  global.PitchDataMerge={merge};
  if(typeof module!=='undefined')module.exports=global.PitchDataMerge;
})(typeof window!=='undefined'?window:globalThis);
