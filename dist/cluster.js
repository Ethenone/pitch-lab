(function(global){
  'use strict';
  const norm=value=>String(value||'').trim().toLocaleLowerCase();
  const PRESETS={balanced:{positions:2,teams:2,country:1},positions:{positions:5,teams:1,country:0.5},teams:{positions:1,teams:5,country:0.5},country:{positions:1,teams:1,country:5}};
  const jaccard=(a,b)=>{const union=new Set([...a,...b]);if(!union.size)return 0;let shared=0;for(const item of a)if(b.has(item))shared++;return shared/union.size;};
  const requested=value=>Math.max(1,Math.min(8,Math.round(Number(value)||4)));
  function partition(items,requestedCount,compare,signature,avoidAllSingletons=false){
    const n=items.length,similarity=new Float32Array(n*n),connections=new Float32Array(n);
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
      const value=compare(items[i],items[j]);
      similarity[i*n+j]=similarity[j*n+i]=value;
      connections[i]+=value;connections[j]+=value;
    }
    const active=[],isolated=[];
    items.forEach((_,i)=>(connections[i]>0?active:isolated).push(i));
    if(!active.length)return {groups:[],isolated:isolated.map(i=>items[i]),count:0};
    const distinct=new Set(active.map(i=>signature(items[i]))).size;
    const count=Math.min(active.length,distinct,requested(requestedCount),avoidAllSingletons?Math.max(1,active.length-1):Infinity);
    const sim=(i,j)=>similarity[i*n+j];
    let medoids=[active.reduce((best,i)=>connections[i]>connections[best]?i:best,active[0])];
    while(medoids.length<count){
      let next=-1,lowest=Infinity;
      for(const i of active){
        if(medoids.includes(i))continue;
        const nearest=Math.max(...medoids.map(m=>sim(i,m)));
        if(nearest<lowest){lowest=nearest;next=i;}
      }
      medoids.push(next);
    }
    let members=[];
    for(let iteration=0;iteration<12;iteration++){
      members=medoids.map(m=>[m]);
      for(const i of active){
        if(medoids.includes(i))continue;
        let best=0;
        for(let g=1;g<medoids.length;g++){
          const candidate=sim(i,medoids[g]),current=sim(i,medoids[best]);
          if(candidate>current+1e-7||(Math.abs(candidate-current)<1e-7&&members[g].length<members[best].length))best=g;
        }
        members[best].push(i);
      }
      const updated=members.map((group,g)=>{
        let best=medoids[g],bestScore=-1;
        for(const i of group){
          const score=group.reduce((sum,j)=>sum+sim(i,j),0);
          if(score>bestScore+1e-7){best=i;bestScore=score;}
        }
        return best;
      });
      if(updated.every((m,g)=>m===medoids[g]))break;
      if(iteration<11)medoids=updated;
    }
    const groups=members.map((group,g)=>{
      const medoid=medoids[g],others=group.filter(i=>i!==medoid);
      const cohesion=others.length?others.reduce((sum,i)=>sum+sim(i,medoid),0)/others.length:null;
      return {representative:items[medoid],items:group.map(i=>items[i]),cohesion};
    }).sort((a,b)=>b.items.length-a.items.length);
    return {groups,isolated:isolated.map(i=>items[i]),count};
  }
  function cluster(people,requestedCount=4,focus='balanced'){
    const weights=PRESETS[focus]||PRESETS.balanced,totalWeight=weights.positions+weights.teams+weights.country;
    const profiles=people.map(person=>({person,positions:new Set((person.positions||[]).filter(Boolean)),teams:new Set((person.teams||[]).map(norm).filter(Boolean)),country:norm(person.nationality)}));
    const result=partition(profiles,requestedCount,(a,b)=>(weights.positions*jaccard(a.positions,b.positions)+weights.teams*jaccard(a.teams,b.teams)+weights.country*Number(Boolean(a.country)&&a.country===b.country))/totalWeight,p=>JSON.stringify([[...p.positions].sort(),[...p.teams].sort(),p.country]));
    return {groups:result.groups.map(group=>({id:String(group.representative.person.personId||group.representative.person.id),representative:group.representative.person,people:group.items.map(p=>p.person),cohesion:group.cohesion})),isolated:result.isolated.map(p=>p.person),weights,focus,count:result.count};
  }
  function clusterEntities(entities,requestedCount=3){
    const profiles=entities.map(entity=>({entity,people:new Set(entity.people.map(p=>p.personId||p.id))}));
    const result=partition(profiles,requestedCount,(a,b)=>jaccard(a.people,b.people),p=>JSON.stringify([...p.people].sort()),true);
    return {groups:result.groups.map(group=>({id:String(group.representative.entity.key||group.representative.entity.code),representative:group.representative.entity,items:group.items.map(p=>p.entity),cohesion:group.cohesion})),isolated:result.isolated.map(p=>p.entity),count:result.count};
  }
  function teamOverlap(a,b){
    const members=new Set(b.people.map(p=>p.personId||p.id));
    const people=a.people.filter(p=>members.has(p.personId||p.id));
    const union=a.people.length+b.people.length-people.length;
    return {people,shared:people.length,union,similarity:union?people.length/union:0};
  }
  function orderTeams(teams){
    const n=teams.length;
    if(n<2)return [...teams];
    const similarities=Array.from({length:n},()=>new Float32Array(n));
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)similarities[i][j]=similarities[j][i]=teamOverlap(teams[i],teams[j]).similarity;
    let groups=teams.map((_,i)=>({members:[i],order:[i],id:i}));
    while(groups.length>1){
      let chosenA=0,chosenB=1,best=-1;
      for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
        let sum=0;
        for(const i of groups[a].members)for(const j of groups[b].members)sum+=similarities[i][j];
        const average=sum/(groups[a].members.length*groups[b].members.length);
        if(average>best+1e-9){best=average;chosenA=a;chosenB=b;}
      }
      const first=groups[chosenA],second=groups[chosenB],variants=[];
      for(const a of [first.order,[...first.order].reverse()])for(const b of [second.order,[...second.order].reverse()]){
        variants.push({order:[...a,...b],boundary:similarities[a[a.length-1]][b[0]]});
        variants.push({order:[...b,...a],boundary:similarities[b[b.length-1]][a[0]]});
      }
      variants.sort((a,b)=>b.boundary-a.boundary||a.order.join(',').localeCompare(b.order.join(',')));
      const merged={members:[...first.members,...second.members],order:variants[0].order,id:Math.min(first.id,second.id)};
      groups=groups.filter((_,i)=>i!==chosenA&&i!==chosenB);
      groups.push(merged);
      groups.sort((a,b)=>a.id-b.id);
    }
    return groups[0].order.map(i=>teams[i]);
  }
  global.PitchCluster={cluster,clusterEntities,teamOverlap,orderTeams,PRESETS};
  if(typeof module!=='undefined')module.exports=global.PitchCluster;
})(typeof window!=='undefined'?window:globalThis);
