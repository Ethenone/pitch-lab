(function(global){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=(part,total)=>total?Math.round(part/total*100):0;
  const heat=ratio=>`background:rgba(200,240,101,${(0.06+Math.min(1,ratio)*0.40).toFixed(2)})`;
  const name=(model,key)=>model.teams.get(key)?.name||key;
  const playerButtons=(people,limit=24)=>people.length?`<div class="analytics-player-list">${[...people].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')).slice(0,limit).map(p=>`<button type="button" data-action="editPlayer" data-id="${esc(p.id)}" title="查看并编辑球员">${esc(p.name)}</button>`).join('')}${people.length>limit?`<span>还有 ${people.length-limit} 人</span>`:''}</div>`:'<p class="hint">暂无符合条件的球员。</p>';
  function renderNetwork(model,state){
    const top=[...model.teams.values()].sort((a,b)=>b.degree-a.degree||b.people.length-a.people.length||a.name.localeCompare(b.name,'zh-CN')).slice(0,14);
    const keys=new Set(top.map(t=>t.key));
    const edges=[...model.teamPairs.values()].filter(e=>keys.has(e.a)&&keys.has(e.b)&&e.people.length>=state.minShared).sort((a,b)=>b.people.length-a.people.length);
    const coords=new Map(top.map((team,i)=>{const angle=-Math.PI/2+i*2*Math.PI/top.length;return [team.key,{x:400+270*Math.cos(angle),y:230+175*Math.sin(angle),side:Math.cos(angle)>=0?1:-1}];}));
    const maxWeight=Math.max(1,...edges.map(e=>e.people.length));
    const lines=edges.map(e=>{const a=coords.get(e.a),b=coords.get(e.b),selected=state.teamPair===e.key||state.networkTeam&&!state.teamPair&&(e.a===state.networkTeam||e.b===state.networkTeam);return `<line class="network-edge ${selected?'selected':''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${(1.5+e.people.length/maxWeight*5).toFixed(1)}" data-action="analyticsTeamPair" data-a="${esc(e.a)}" data-b="${esc(e.b)}"><title>${esc(name(model,e.a))} ↔ ${esc(name(model,e.b))}：${e.people.length} 位共同球员</title></line>`;}).join('');
    const nodes=top.map(team=>{const point=coords.get(team.key),radius=Math.min(19,7+Math.sqrt(team.people.length)*2),selected=state.networkTeam===team.key;return `<g class="network-node ${selected?'selected':''}" data-action="analyticsTeam" data-team="${esc(team.key)}" role="button" tabindex="0" aria-label="查看球队 ${esc(team.name)} 的关联"><circle cx="${point.x}" cy="${point.y}" r="${radius.toFixed(1)}"></circle><text x="${point.x+point.side*(radius+6)}" y="${point.y+4}" text-anchor="${point.side>0?'start':'end'}">${esc(team.name.length>10?team.name.slice(0,9)+'…':team.name)}</text><title>${esc(team.name)}：${team.people.length} 位球员</title></g>`;}).join('');
    let detail;
    const selectedPair=state.teamPair&&model.teamPairs.get(state.teamPair);
    if(selectedPair){
      detail=`<h4>${esc(name(model,selectedPair.a))} ↔ ${esc(name(model,selectedPair.b))}</h4><p>${selectedPair.people.length} 位球员曾效力这两支球队。</p>${playerButtons(selectedPair.people)}`;
    }else{
      const team=model.teams.get(state.networkTeam)||top[0];
      if(team){const linked=[...model.teamPairs.values()].filter(e=>e.a===team.key||e.b===team.key).sort((a,b)=>b.people.length-a.people.length).slice(0,8);detail=`<h4>${esc(team.name)}</h4><p>资料库有 ${team.people.length} 位球员曾效力该队；关联数为共享球员人数。</p><div class="analytics-link-list">${linked.length?linked.map(e=>{const other=e.a===team.key?e.b:e.a;return `<button type="button" data-action="analyticsTeamPair" data-a="${esc(e.a)}" data-b="${esc(e.b)}"><span>${esc(name(model,other))}</span><strong>${e.people.length} 人</strong></button>`;}).join(''):'<span class="hint">暂无其他球队关联。</span>'}</div>${playerButtons(team.people)}`;}else detail='<p class="hint">先添加具有球队资料的球员。</p>';
    }
    const edgeList=edges.slice(0,10).map(e=>`<button type="button" data-action="analyticsTeamPair" data-a="${esc(e.a)}" data-b="${esc(e.b)}"><span>${esc(name(model,e.a))} ↔ ${esc(name(model,e.b))}</span><strong>${e.people.length}</strong></button>`).join('');
    return `<section class="analytics-panel"><div class="analytics-panel-head"><div><span class="section-kicker">TEAM LINKS</span><h3>球队共享球员网络</h3><p>同一球员的多支曾效力球队两两连线；线越粗，共同球员越多。履历关联不代表同一时间效力。</p></div><label>至少共享 <select id="teamMinShared"><option value="1" ${state.minShared===1?'selected':''}>1 人</option><option value="2" ${state.minShared===2?'selected':''}>2 人</option><option value="3" ${state.minShared===3?'selected':''}>3 人</option><option value="5" ${state.minShared===5?'selected':''}>5 人</option></select></label></div>${top.length?`<div class="analytics-network-layout"><div class="network-wrap"><svg class="team-network" viewBox="0 0 800 460" role="img" aria-label="球队共享球员关系图">${lines}${nodes}</svg><small>图中显示关联最多的 ${top.length} 支球队。点击球队或连线查看球员。</small></div><div class="analytics-detail">${detail}</div></div><div class="analytics-link-list top-links">${edgeList||'<span class="hint">当前筛选条件下没有球队连线。</span>'}</div>`:'<div class="analytics-empty">资料库暂无球队资料。给球员添加曾效力球队后，这里会出现网络。</div>'}</section>`;
  }
  function renderTeamShares(model,state){
    const limit=[12,20,30].includes(state.teamShareLimit)?state.teamShareLimit:12;
    const teams=[...model.teams.values()].sort((a,b)=>b.people.length-a.people.length||b.degree-a.degree||a.name.localeCompare(b.name,'zh-CN')).slice(0,limit);
    const shared=(a,b)=>a.key===b.key?model.teamOnly.get(a.key)||[]:model.teamPairs.get(model.pairKey(a.key,b.key))?.people||[];
    let from=teams.find(team=>team.key===state.teamShareA),to=teams.find(team=>team.key===state.teamShareB);
    if(!from||!to){
      let best=0;
      for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++){
        const count=shared(teams[i],teams[j]).length;
        if(count>best){best=count;from=teams[i];to=teams[j];}
      }
      if(!from&&teams.length)from=to=teams[0];
    }
    const header=`<div class="team-matrix-corner">曾效力 ↓<br>也曾效力 →</div>${teams.map(team=>`<div class="team-matrix-heading" title="${esc(team.name)}">${esc(team.name)}</div>`).join('')}`;
    const rows=teams.map(row=>`<div class="team-matrix-rowname" title="${esc(row.name)}：${row.people.length} 人">${esc(row.name)}<small>${row.people.length} 人</small></div>${teams.map(column=>{
      const only=row.key===column.key,people=shared(row,column),percentage=pct(people.length,row.people.length),selected=from?.key===row.key&&to?.key===column.key;
      return `<button type="button" class="team-matrix-cell team-share-cell ${only?'self':''} ${selected?'selected':''}" style="${heat(people.length/row.people.length)}" data-action="analyticsTeamShare" data-a="${esc(row.key)}" data-b="${esc(column.key)}" aria-label="${only?`仅曾效力${esc(row.name)}`:`${esc(row.name)}与${esc(column.name)}共享球员`}：${people.length} 人，占${esc(row.name)}球员的 ${percentage}%" title="${people.length}/${row.people.length} 人，${percentage}%"><strong>${people.length}</strong><small>${percentage}%</small></button>`;
    }).join('')}`).join('');
    const people=from&&to?shared(from,to):[],only=from?.key===to?.key;
    const detail=from?`<div class="analytics-detail"><h4>${only?`仅曾效力${esc(from.name)}`:`${esc(from.name)} → ${esc(to.name)}`}</h4><p>${people.length} / ${from.people.length} 人，${pct(people.length,from.people.length)}%。${only?'这些球员只填写了这一支曾效力球队。':'这些球员的履历同时包含两支球队。'}</p>${playerButtons(people,people.length)}</div>`:'';
    return `<section class="analytics-panel"><div class="analytics-panel-head"><div><span class="section-kicker">TEAM PATHS</span><h3>球队共享球员矩阵</h3><p>交叉格显示两队共享球员人数，以及占行球队球员的比例；对角格显示仅填写了该队的球员。点击格子查看名单。</p></div><label>显示球队 <select id="analyticsTeamShareLimit"><option value="12" ${limit===12?'selected':''}>最多 12 支</option><option value="20" ${limit===20?'selected':''}>最多 20 支</option><option value="30" ${limit===30?'selected':''}>最多 30 支</option></select></label></div>${teams.length?`<div class="analytics-matrix-layout"><div class="heat-scroll team-matrix-scroll"><div class="team-matrix-grid" style="grid-template-columns:118px repeat(${teams.length},70px)">${header}${rows}</div></div>${detail}</div><p class="analytics-footnote">按资料库球员人数显示 ${teams.length} 支球队${model.teams.size>teams.length?`，另有 ${model.teams.size-teams.length} 支未显示`:''}。同一球员的不同评分版本只统计一次；履历关联不代表同期效力。</p>`:'<div class="analytics-empty">给球员添加曾效力球队后，这里会出现矩阵。</div>'}</section>`;
  }
  function renderPositions(model,labels,state){
    const codes=Object.keys(labels),most=[...model.positions.values()].sort((a,b)=>{
      const links=code=>codes.filter(other=>other!==code).reduce((sum,other)=>sum+(model.positionPairs.get(`${code}\u0000${other}`)?.people.length||0),0);
      return links(b.code)-links(a.code)||b.people.length-a.people.length;
    })[0];
    const source=model.positions.has(state.sourcePosition)?state.sourcePosition:most?.code||codes[0];
    const sourceCount=model.positions.get(source)?.people.length||0;
    const header=`<div class="heat-corner">已有位置 ↓<br>也可踢 →</div>${codes.map(code=>`<div class="heat-heading" title="${esc(labels[code])}">${esc(labels[code])}</div>`).join('')}`;
    const rows=codes.map(from=>{const total=model.positions.get(from)?.people.length||0;return `<div class="heat-row-heading ${source===from?'selected':''}" title="${esc(labels[from])}：${total} 人">${esc(labels[from])}<small>${total} 人</small></div>${codes.map(to=>{const only=from===to,count=only?(model.positionOnly.get(from)?.length||0):(model.positionPairs.get(`${from}\u0000${to}`)?.people.length||0),rate=total?count/total:0;return `<button type="button" class="heat-cell ${only?'self':''}" style="${heat(rate)}" data-action="analyticsPositionPair" data-from="${from}" data-to="${to}" title="${only?`仅能踢${esc(labels[from])}`:`${esc(labels[from])} → ${esc(labels[to])}`}：${count}/${total} 人，${pct(count,total)}%">${total?pct(count,total)+'%':'—'}</button>`;}).join('')}`;}).join('');
    const selected=state.positionPair?.from===source?state.positionPair:null;
    let detail;
    if(selected){const only=selected.to===source,joint=only?(model.positionOnly.get(source)||[]):(model.positionPairs.get(`${source}\u0000${selected.to}`)?.people||[]);detail=`<h4>${only?`仅能踢${esc(labels[source])}`:`${esc(labels[source])} → ${esc(labels[selected.to])}`}</h4><p>${joint.length} / ${sourceCount} 人，约 ${pct(joint.length,sourceCount)}%。${only?'这些球员只填写了这一个可踢位置。':'这些球员同时允许踢两个位置。'}</p>${playerButtons(joint)}`;}
    else{const alternatives=codes.filter(code=>code!==source).map(to=>({to,count:model.positionPairs.get(`${source}\u0000${to}`)?.people.length||0})).filter(x=>x.count).sort((a,b)=>b.count-a.count),onlyCount=model.positionOnly.get(source)?.length||0;detail=`<h4>${esc(labels[source])}的其他可踢位置</h4><p>资料库共有 ${sourceCount} 人可踢${esc(labels[source])}。比例的分母是这 ${sourceCount} 人。</p><div class="analytics-link-list"><button type="button" data-action="analyticsPositionPair" data-from="${source}" data-to="${source}"><span>仅能踢${esc(labels[source])}</span><strong>${pct(onlyCount,sourceCount)}% · ${onlyCount} 人</strong></button>${alternatives.length?alternatives.map(x=>`<button type="button" data-action="analyticsPositionPair" data-from="${source}" data-to="${x.to}"><span>${esc(labels[x.to])}</span><strong>${pct(x.count,sourceCount)}% · ${x.count} 人</strong></button>`).join(''):''}</div>`;}
    return `<section class="analytics-panel"><div class="analytics-panel-head"><div><span class="section-kicker">POSITION PATHS</span><h3>可踢位置关联</h3><p>非对角格表示“能踢行位置的人中，有多少也能踢列位置”；对角格表示其中仅能踢该位置的比例。依据填写的可踢位置，不是实际出场记录。</p></div><label>重点位置 <select id="analyticsSourcePosition">${codes.map(code=>`<option value="${code}" ${source===code?'selected':''}>${esc(labels[code])}</option>`).join('')}</select></label></div><div class="analytics-matrix-layout"><div class="heat-scroll"><div class="position-heatmap">${header}${rows}</div></div><div class="analytics-detail">${detail}</div></div></section>`;
  }
  function renderCountryTeams(model,state){
    const countries=[...model.countries.values()].sort((a,b)=>b.people.length-a.people.length).slice(0,8);
    const teams=[...model.teams.values()].sort((a,b)=>b.people.length-a.people.length).slice(0,8);
    const maxCount=Math.max(1,...countries.flatMap(country=>teams.map(team=>model.countryTeams.get(model.countryTeamKey(country.key,team.key))?.people.length||0)));
    const isShare=state.nationMetric==='share';
    const header=`<div class="country-matrix-head">国家 \ 球队</div>${teams.map(team=>`<div class="country-matrix-head" title="${esc(team.name)}">${esc(team.name)}</div>`).join('')}`;
    const rows=countries.map(country=>`<div class="country-matrix-label" title="${esc(country.name)}：${country.people.length} 人">${esc(country.name)}<small>${country.people.length} 人</small></div>${teams.map(team=>{const count=model.countryTeams.get(model.countryTeamKey(country.key,team.key))?.people.length||0,share=pct(count,country.people.length),ratio=isShare?count/country.people.length:count/maxCount;return `<button type="button" class="country-matrix-cell" style="${heat(ratio)}" data-action="analyticsCountryTeam" data-country="${esc(country.key)}" data-team="${esc(team.key)}" title="${esc(country.name)} · ${esc(team.name)}：${count} 人，占该国家 ${share}%">${isShare?share+'%':count}</button>`;}).join('')}`).join('');
    const selectedCountry=model.countries.get(state.country),selectedClub=model.teams.get(state.club);
    const selected=selectedCountry&&selectedClub?{country:state.country,team:state.club,people:model.countryTeams.get(model.countryTeamKey(state.country,state.club))?.people||[]}:null;
    const strongest=[...model.countryTeams.values()].sort((a,b)=>b.people.length-a.people.length)[0];
    const pair=selected||strongest;
    const country=pair&&model.countries.get(pair.country),team=pair&&model.teams.get(pair.team),people=pair?.people||[];
    const detail=pair?`<h4>${esc(country?.name)} · ${esc(team?.name)}</h4><p>${people.length} 位该国球员曾效力这支球队，占资料库中该国球员的 ${pct(people.length,country?.people.length)}%。</p>${playerButtons(people)}`:'<p class="hint">添加国籍和球队资料后，这里会显示关联球员。</p>';
    return `<section class="analytics-panel"><div class="analytics-panel-head"><div><span class="section-kicker">COUNTRY × CLUB</span><h3>国家与球队</h3><p>每位球员的国籍与其所有曾效力球队分别建立一条关系。切换人数或国籍内占比，观察不同规模国家的特点。</p></div><label>显示方式 <select id="analyticsNationMetric"><option value="count" ${!isShare?'selected':''}>球员人数</option><option value="share" ${isShare?'selected':''}>国籍内占比</option></select></label></div>${countries.length&&teams.length?`<div class="analytics-matrix-layout"><div class="heat-scroll"><div class="country-heatmap" style="grid-template-columns:110px repeat(${teams.length},minmax(95px,1fr))">${header}${rows}</div></div><div class="analytics-detail">${detail}</div></div><p class="analytics-footnote">热图显示球员人数最多的 ${countries.length} 个国家和 ${teams.length} 支球队；同一球员可计入多支球队。</p>`:'<div class="analytics-empty">需要至少一位同时填写国籍和球队的球员。</div>'}</section>`;
  }
  const clusterKindControl=state=>`<label>聚类对象 <select id="analyticsClusterKind"><option value="players" ${state.clusterKind==='players'?'selected':''}>球员</option><option value="teams" ${state.clusterKind==='teams'?'selected':''}>球队</option><option value="positions" ${state.clusterKind==='positions'?'selected':''}>位置</option></select></label>`;
  const clusterCountControl=state=>`<label>最多分组 <select id="analyticsClusterCount">${[2,3,4,5,6,7,8].map(count=>`<option value="${count}" ${state.clusterCount===count?'selected':''}>${count} 组</option>`).join('')}</select></label>`;
  function renderPlayerClusters(result,labels,state){
    const groups=result.groups,selected=groups.find(group=>group.id===state.clusterSelected)||groups[0];
    const topValues=(people,extract,limit=3)=>{
      const counts=new Map();
      for(const person of people)for(const value of new Set(extract(person).filter(Boolean)))counts.set(value,(counts.get(value)||0)+1);
      return [...counts].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'zh-CN')).slice(0,limit);
    };
    const tags=group=>[
      ...topValues(group.people,p=>(p.positions||[]).map(code=>labels[code]),2).map(([value,count])=>`${value} ${count} 人`),
      ...topValues(group.people,p=>p.teams||[],2).map(([value,count])=>`${value} ${count} 人`),
      ...topValues(group.people,p=>[p.nationality],1).map(([value,count])=>`${value} ${count} 人`)
    ];
    const cards=groups.map((group,index)=>`<button type="button" class="cluster-card ${selected?.id===group.id?'selected':''}" data-action="analyticsCluster" data-cluster="${esc(group.id)}"><span class="cluster-number">第 ${index+1} 组 <strong>${group.people.length} 人</strong></span><b>代表球员：${esc(group.representative.name)}</b><small>${group.cohesion===null?'单人组':`组内与代表球员平均相似度 ${pct(group.cohesion,1)}%`}</small><span class="cluster-tags">${tags(group).slice(0,3).map(tag=>`<em>${esc(tag)}</em>`).join('')}</span></button>`).join('');
    const details=selected?`<div class="analytics-detail cluster-detail"><h4>第 ${groups.indexOf(selected)+1} 组 · ${selected.people.length} 人</h4><p>代表球员：${esc(selected.representative.name)}。以下是组内常见的资料标签，人数可重叠。</p><div class="cluster-tags">${tags(selected).map(tag=>`<em>${esc(tag)}</em>`).join('')}</div><p>点击球员可查看或修改资料。</p>${playerButtons(selected.people,selected.people.length)}</div>`:'';
    const isolated=result.isolated.length?`<div class="cluster-isolated"><strong>${result.isolated.length} 人暂未成组</strong><p>这些球员与资料库中其他人没有共享的球队、位置或国籍；补充资料后可重新聚类。</p>${playerButtons(result.isolated,result.isolated.length)}</div>`:'';
    return `<section class="analytics-panel"><div class="analytics-panel-head"><div><span class="section-kicker">PLAYER CLUSTERS</span><h3>球员画像聚类</h3><p>按可踢位置、曾效力球队和国籍的相似度，把资料库中的球员分组。侧重点会改变分组结果。</p></div><div class="cluster-controls">${clusterKindControl(state)}<label>侧重点 <select id="analyticsClusterFocus"><option value="balanced" ${state.clusterFocus==='balanced'?'selected':''}>综合</option><option value="positions" ${state.clusterFocus==='positions'?'selected':''}>位置</option><option value="teams" ${state.clusterFocus==='teams'?'selected':''}>球队</option><option value="country" ${state.clusterFocus==='country'?'selected':''}>国籍</option></select></label>${clusterCountControl(state)}</div></div>${groups.length?`<div class="cluster-layout"><div class="cluster-cards">${cards}</div>${details}</div>`:'<div class="analytics-empty">目前没有可比较的球员资料。添加共同位置、球队或国籍后，这里会出现分组。</div>'}${isolated}<p class="analytics-footnote">使用加权资料相似度和代表球员迭代分组；相似度是资料匹配程度，并非概率。资料完全相同或缺少关联时，实际组数可能少于设置值。</p></section>`;
  }
  function renderTeamMatrix(result,state){
    const teams=result.matrixOrder||[];
    const cached=new Map(),overlap=(a,b)=>{const key=a.key<b.key?`${a.key}\u0000${b.key}`:`${b.key}\u0000${a.key}`;if(!cached.has(key))cached.set(key,global.PitchCluster.teamOverlap(a,b));return cached.get(key);};
    let a=teams.find(team=>team.key===state.teamMatrixA),b=teams.find(team=>team.key===state.teamMatrixB);
    if(!a||!b){let best=-1;for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++){const value=overlap(teams[i],teams[j]).similarity;if(value>best){best=value;a=teams[i];b=teams[j];}}if(!a&&teams.length)a=b=teams[0];}
    const selected=a&&b?overlap(a,b):null;
    const header=`<div class="team-matrix-corner">球队</div>${teams.map(team=>`<div class="team-matrix-heading" title="${esc(team.name)}">${esc(team.name)}</div>`).join('')}`;
    const rows=teams.map(row=>`<div class="team-matrix-rowname" title="${esc(row.name)}：${row.people.length} 人">${esc(row.name)}<small>${row.people.length} 人</small></div>${teams.map(column=>{const value=overlap(row,column),marked=a&&b&&(row.key===a.key&&column.key===b.key||row.key===b.key&&column.key===a.key);return `<button type="button" class="team-matrix-cell ${row.key===column.key?'self':''} ${marked?'selected':''}" style="${heat(value.similarity)}" data-action="analyticsTeamMatrix" data-a="${esc(row.key)}" data-b="${esc(column.key)}" aria-label="${esc(row.name)}与${esc(column.name)}相似度 ${pct(value.similarity,1)}%，共同 ${value.shared} 人" title="共同 ${value.shared} 人 / 并集 ${value.union} 人">${pct(value.similarity,1)}%</button>`;}).join('')}`).join('');
    const detail=selected?`<div class="analytics-detail"><h4>${esc(a.name)}${a.key===b.key?'':` ↔ ${esc(b.name)}`}</h4><p>${a.key===b.key?`这支球队有 ${a.people.length} 位资料库球员。`:`共同球员 ${selected.shared} 人，两队球员并集 ${selected.union} 人，相似度 ${pct(selected.similarity,1)}%。`}</p>${playerButtons(selected.people,selected.people.length)}</div>`:'';
    return `<section class="analytics-panel"><div class="analytics-panel-head"><div><span class="section-kicker">CLUSTERED TEAM MATRIX</span><h3>球队相似度矩阵</h3><p>颜色越亮，两队共享球员的比例越高。行和列使用同一顺序，由平均连接层次聚类排列。</p></div><label>显示球队 <select id="analyticsTeamMatrixLimit"><option value="12" ${state.teamMatrixLimit===12?'selected':''}>最多 12 支</option><option value="20" ${state.teamMatrixLimit===20?'selected':''}>最多 20 支</option><option value="30" ${state.teamMatrixLimit===30?'selected':''}>最多 30 支</option></select></label></div>${teams.length?`<div class="analytics-matrix-layout"><div class="heat-scroll team-matrix-scroll"><div class="team-matrix-grid" style="grid-template-columns:118px repeat(${teams.length},62px)">${header}${rows}</div></div>${detail}</div><p class="analytics-footnote">显示资料库球员人数最多的 ${teams.length} 支球队${result.totalTeams>teams.length?`，另有 ${result.totalTeams-teams.length} 支未显示`:''}。相似度 = 共同球员数 ÷ 两队球员并集人数；对角线为 100%。点击格子查看球员。</p>`:'<div class="analytics-empty">资料库暂无球队资料。</div>'}</section>`;
  }
  function renderEntityClusters(result,labels,state,kind){
    const isTeam=kind==='teams',entityName=entity=>isTeam?entity.name:(labels[entity.code]||entity.code),entityKey=entity=>isTeam?entity.key:entity.code;
    const noun=isTeam?'球队':'位置',groups=result.groups,selected=groups.find(group=>group.id===state.clusterSelected)||groups[0];
    const selectedEntity=selected?.items.find(item=>entityKey(item)===state.clusterEntity)||selected?.representative;
    const cards=groups.map((group,index)=>`<button type="button" class="cluster-card ${selected?.id===group.id?'selected':''}" data-action="analyticsCluster" data-cluster="${esc(group.id)}"><span class="cluster-number">第 ${index+1} 组 <strong>${group.items.length} ${isTeam?'队':'个位置'}</strong></span><b>代表${noun}：${esc(entityName(group.representative))}</b><small>${group.cohesion===null?'单一成员':`与代表${noun}平均重叠 ${pct(group.cohesion,1)}%`}</small><span class="cluster-tags">${group.items.slice(0,4).map(item=>`<em>${esc(entityName(item))}</em>`).join('')}${group.items.length>4?'<em>…</em>':''}</span></button>`).join('');
    let details='';
    if(selected){
      const shared=new Map();
      for(const item of selected.items)for(const person of item.people){const key=person.personId||person.id;if(!shared.has(key))shared.set(key,{person,count:0});shared.get(key).count++;}
      const connectors=[...shared.values()].filter(x=>x.count>1).sort((a,b)=>b.count-a.count||a.person.name.localeCompare(b.person.name,'zh-CN')).map(x=>x.person);
      details=`<div class="analytics-detail cluster-detail"><h4>第 ${groups.indexOf(selected)+1} 组 · ${selected.items.length} ${isTeam?'支球队':'个位置'}</h4><p>成员之间通过共同球员形成关联；以下球员同时连接组内至少两个${noun}。</p>${playerButtons(connectors,connectors.length)}<div class="cluster-member-list">${selected.items.map(item=>`<button type="button" class="${entityKey(item)===entityKey(selectedEntity)?'selected':''}" data-action="analyticsClusterEntity" data-entity="${esc(entityKey(item))}">${esc(entityName(item))} <small>${item.people.length} 人</small></button>`).join('')}</div><p><strong>${esc(entityName(selectedEntity))}</strong>的球员：</p>${playerButtons(selectedEntity.people,selectedEntity.people.length)}</div>`;
    }
    const isolated=result.isolated.length?`<div class="cluster-isolated"><strong>${result.isolated.length} 个${noun}暂未成组</strong><p>它们与其他${noun}没有共享球员。</p><div class="cluster-tags">${result.isolated.map(item=>`<em>${esc(entityName(item))}</em>`).join('')}</div></div>`:'';
    return `<section class="analytics-panel"><div class="analytics-panel-head"><div><span class="section-kicker">${isTeam?'TEAM':'POSITION'} CLUSTERS</span><h3>${noun}聚类</h3><p>${isTeam?'按曾效力该队的球员重叠程度分组；曾效力记录不代表同一时期。':'按可踢这些位置的球员重叠程度分组；反映位置资格，不代表实际出场。'}</p></div><div class="cluster-controls">${clusterKindControl(state)}${clusterCountControl(state)}</div></div>${groups.length?`<div class="cluster-layout"><div class="cluster-cards">${cards}</div>${details}</div>`:`<div class="analytics-empty">没有共享球员的${noun}，暂时无法形成有意义的分组。</div>`}${isolated}<p class="analytics-footnote">两项之间的重叠度 = 共同球员数 ÷ 两项球员的并集人数。按代表${noun}迭代分组；资料完全相同或没有重叠时，实际组数可能少于设置值。</p></section>${isTeam?renderTeamMatrix(result,state):''}`;
  }
  function render(model,labels,state,clusters){
    const people=model.people,multiTeam=people.filter(p=>new Set((p.teams||[]).map(x=>String(x).trim().toLocaleLowerCase()).filter(Boolean)).size>1).length,multiPosition=people.filter(p=>new Set(p.positions||[]).size>1).length;
    return `<div class="analytics-page"><div class="analytics-intro"><div><span class="section-kicker">PLAYER LIBRARY INSIGHTS</span><h2>球员之间的隐藏连线</h2><p>用整个球员资料库探索履历、可踢位置与国籍。每名球员只统计一次，多个评分版本不会重复计数。</p></div><div class="analytics-summary"><div><strong>${people.length}</strong><span>不同球员</span></div><div><strong>${multiTeam}</strong><span>多球队经历</span></div><div><strong>${multiPosition}</strong><span>多位置球员</span></div></div></div>${renderNetwork(model,state)}${renderTeamShares(model,state)}${renderPositions(model,labels,state)}${renderCountryTeams(model,state)}${clusters?(state.clusterKind==='teams'||state.clusterKind==='positions'?renderEntityClusters(clusters,labels,state,state.clusterKind):renderPlayerClusters(clusters,labels,state)):''}</div>`;
  }
  global.PitchAnalyticsView={render};
  if(typeof module!=='undefined')module.exports=global.PitchAnalyticsView;
})(typeof window!=='undefined'?window:globalThis);
