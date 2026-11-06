(function(global){
  'use strict';
  const norm=value=>String(value||'').trim().toLocaleLowerCase();
  const pairKey=(a,b)=>a<b?`${a}\u0000${b}`:`${b}\u0000${a}`;
  const countryTeamKey=(country,team)=>`${country}\u0000${team}`;
  function build(players){
    const unique=new Map();
    for(const p of players){
      const identity=p.personId||norm(p.name)||p.id;
      if(!unique.has(identity))unique.set(identity,p);
    }
    const people=[...unique.values()];
    const teams=new Map(),teamOnly=new Map(),teamPairs=new Map(),positions=new Map(),positionOnly=new Map(),positionPairs=new Map(),countries=new Map(),countryTeams=new Map();
    for(const p of people){
      const playerTeams=[...new Map((p.teams||[]).map(name=>[norm(name),String(name).trim()]).filter(([key])=>key)).entries()].map(([key,name])=>({key,name}));
      if(playerTeams.length===1){
        const key=playerTeams[0].key;
        if(!teamOnly.has(key))teamOnly.set(key,[]);
        teamOnly.get(key).push(p);
      }
      const playerPositions=[...new Set((p.positions||[]).filter(Boolean))];
      if(playerPositions.length===1){
        const code=playerPositions[0];
        if(!positionOnly.has(code))positionOnly.set(code,[]);
        positionOnly.get(code).push(p);
      }
      const countryKey=norm(p.nationality);
      for(const {key,name} of playerTeams){
        if(!teams.has(key))teams.set(key,{key,name,people:[],degree:0});
        teams.get(key).people.push(p);
      }
      for(let i=0;i<playerTeams.length;i++)for(let j=i+1;j<playerTeams.length;j++){
        const a=playerTeams[i].key,b=playerTeams[j].key,key=pairKey(a,b);
        if(!teamPairs.has(key))teamPairs.set(key,{key,a:a<b?a:b,b:a<b?b:a,people:[]});
        teamPairs.get(key).people.push(p);
      }
      for(const from of playerPositions){
        if(!positions.has(from))positions.set(from,{code:from,people:[]});
        positions.get(from).people.push(p);
        for(const to of playerPositions){
          const key=`${from}\u0000${to}`;
          if(!positionPairs.has(key))positionPairs.set(key,{from,to,people:[]});
          positionPairs.get(key).people.push(p);
        }
      }
      if(countryKey){
        if(!countries.has(countryKey))countries.set(countryKey,{key:countryKey,name:p.nationality,people:[]});
        countries.get(countryKey).people.push(p);
        for(const {key:teamKey} of playerTeams){
          const key=countryTeamKey(countryKey,teamKey);
          if(!countryTeams.has(key))countryTeams.set(key,{country:countryKey,team:teamKey,people:[]});
          countryTeams.get(key).people.push(p);
        }
      }
    }
    for(const edge of teamPairs.values()){
      teams.get(edge.a).degree+=edge.people.length;
      teams.get(edge.b).degree+=edge.people.length;
    }
    return {people,teams,teamOnly,teamPairs,positions,positionOnly,positionPairs,countries,countryTeams,pairKey,countryTeamKey};
  }
  global.PitchAnalytics={build,pairKey,countryTeamKey};
  if(typeof module!=='undefined')module.exports=global.PitchAnalytics;
})(typeof window!=='undefined'?window:globalThis);
