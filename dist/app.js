(function(){
  'use strict';
  const POS={ST:'中锋',LW:'左边锋',RW:'右边锋',CM:'中前卫',LM:'左前卫',RM:'右前卫',CAM:'前腰',CDM:'后腰',CB:'中后卫',LB:'左后卫',RB:'右后卫',GK:'门将'};
  const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>crypto.randomUUID?.()||'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const norm=s=>String(s||'').trim().toLocaleLowerCase();
  const personKey=p=>p.personId||norm(p.name)||p.id;
  const key='pitch-lab-data-v1';
  const defaultSearchSettings={durationSeconds:5,exploration:1,restartEvery:7000,targetLimit:24};
  function normalizeSearchSettings(raw){
    const source=raw&&typeof raw==='object'?raw:{};
    const number=value=>value===null||value===undefined||value===''?NaN:Number(value);
    const durationSeconds=number(source.durationSeconds),exploration=number(source.exploration),restartEvery=number(source.restartEvery),targetLimit=number(source.targetLimit);
    return {
      durationSeconds:Number.isInteger(durationSeconds)&&durationSeconds>=1&&durationSeconds<=120?durationSeconds:defaultSearchSettings.durationSeconds,
      exploration:Number.isFinite(exploration)&&exploration>=0.1&&exploration<=5?exploration:defaultSearchSettings.exploration,
      restartEvery:Number.isInteger(restartEvery)&&restartEvery>=0&&restartEvery<=100000?restartEvery:defaultSearchSettings.restartEvery,
      targetLimit:Number.isInteger(targetLimit)&&targetLimit>=1&&targetLimit<=64?targetLimit:defaultSearchSettings.targetLimit
    };
  }
  function defaultGroups(){return [...Array.from({length:11},(_,i)=>({id:uid(),kind:'starter',index:i,position:PitchSolver.FORMATIONS['4-3-3'][i],options:[]})),...Array.from({length:7},(_,i)=>({id:uid(),kind:'bench',index:i,options:[]}))];}
  function normalizeGroups(groups,formation){const preset=PitchSolver.FORMATIONS[formation]||PitchSolver.FORMATIONS['4-3-3'];return (Array.isArray(groups)?groups:defaultGroups()).map(g=>g.kind==='starter'?{...g,options:[...(g.options||[])],position:POS[g.position]?g.position:preset[g.index]||'CM'}:{...g,options:[...(g.options||[])]});}
  function normalizePlayers(players){
    const byName=new Map(),byPerson=new Map();
    return players.map(raw=>{
      const shared=byPerson.get(raw.personId)||byName.get(norm(raw.name));
      const p=shared?{...raw,personId:shared.personId,name:shared.name,nationality:shared.nationality,teams:[...shared.teams],positions:[...shared.positions]}:{...raw,personId:raw.personId||raw.id,teams:Array.isArray(raw.teams)?raw.teams:[],positions:Array.isArray(raw.positions)?raw.positions:[]};
      byPerson.set(p.personId,p);byName.set(norm(p.name),p);return p;
    });
  }
  function hydrate(d){return {...d,players:normalizePlayers(d.players),combos:(d.combos||[]).map(c=>({...c,members:[...(c.members||[])]})),pool:[...(d.pool||[])],groups:normalizeGroups(d.groups,d.formation),formation:d.formation||'4-3-3',priority:d.scoreModelVersion===2&&['final','chemistry','rating'].includes(d.priority)?d.priority:'final',scoreModelVersion:2,algorithm:d.algorithm==='guided'?'guided':'annealing',searchSettings:normalizeSearchSettings(d.searchSettings)};}
  function load(){
    try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&Array.isArray(saved.players))return hydrate(saved);}catch(e){}
    const defaults=window.PitchDefaultData;
    if(defaults&&Array.isArray(defaults.players))return hydrate(defaults);
    return {players:[],combos:[],pool:[],groups:defaultGroups(),formation:'4-3-3',priority:'final',scoreModelVersion:2,algorithm:'annealing',searchSettings:{...defaultSearchSettings}};
  }
  let data=load(),view='normal',result=null,running=false,editingPlayer=null,variantSourceId=null,editingCombo=null,pendingSlotGroup=null,pendingPlayerCombos=[],editingTeams=[],pendingImport=null,search='',librarySearch='',libraryComposing=false;
  const analyticsState={minShared:1,networkTeam:null,teamPair:null,teamShareLimit:12,teamShareA:null,teamShareB:null,sourcePosition:null,positionPair:null,nationMetric:'count',country:null,club:null,clusterKind:'players',clusterFocus:'balanced',clusterCount:4,clusterSelected:null,clusterEntity:null,teamMatrixLimit:20,teamMatrixA:null,teamMatrixB:null};
  const save=()=>localStorage.setItem(key,JSON.stringify(data));
  const toast=message=>{const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3000);};
  const player=id=>data.players.find(p=>p.id===id);
  const variantsFor=p=>data.players.filter(x=>personKey(x)===personKey(p));
  const uniquePeople=players=>new Set(players.map(personKey)).size;
  const parseTeams=value=>String(value||'').split(/[,，、\n;；]+/).map(x=>x.trim()).filter(Boolean);
  function uniqueTeams(teams){const seen=new Set();return teams.filter(team=>{const key=norm(team);if(!key||seen.has(key))return false;seen.add(key);return true;});}
  function renderTeamChips(){
    $('#selectedTeams').innerHTML=editingTeams.length?editingTeams.map((team,index)=>`<button type="button" class="team-chip" data-action="removeTeam" data-index="${index}" aria-label="移除球队 ${esc(team)}">${esc(team)} <span aria-hidden="true">×</span></button>`).join(''):'<span class="hint">尚未添加球队</span>';
  }
  function setTeams(teams){editingTeams=uniqueTeams([...teams]);renderTeamChips();}
  function addTeamEntries(value){const incoming=parseTeams(value);if(!incoming.length){$('#pTeamEntry').focus();return;}setTeams([...editingTeams,...incoming]);$('#pTeamEntry').value='';$('#pTeamEntry').focus();}
  function populateProfileSuggestions(){
    const options=values=>uniqueTeams(values).sort((a,b)=>a.localeCompare(b,'zh-CN')).map(value=>`<option value="${esc(value)}"></option>`).join('');
    $('#nationSuggestions').innerHTML=options(data.players.map(p=>p.nationality));
    $('#teamSuggestions').innerHTML=options(data.players.flatMap(p=>p.teams||[]));
  }
  const combosForName=name=>{const needle=norm(name);return needle?data.combos.filter(c=>(c.members||[]).some(member=>norm(member)===needle)):[];};
  const comboSummary=name=>{const list=combosForName(name);return list.length?`<br>化学反应：${list.map(c=>esc(c.name)).join(' · ')}`:'';};
  const playerRow=(p,action='remove')=>`<div class="player-row"><div class="avatar">${esc(p.name.slice(0,1))}</div><div class="player-info"><b>${esc(p.name)}</b><small>${esc(p.nationality)} · ${p.positions.map(x=>POS[x]).join(' / ')}</small></div><div class="rating">${p.rating}</div><button class="icon-btn" data-action="${action}" data-id="${esc(p.id)}" aria-label="${action==='remove'?'移出候选':'删除球员'}">×</button></div>`;
  function setView(next){view=next;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===view));render();}
  function toolbar(title,desc,controls=''){$('#viewDescription').innerHTML=`<h2>${title}</h2><p>${desc}</p>`;$('#viewControls').innerHTML=controls;}
  function formationControl(){return `<label class="formation-label">阵型 <select id="formationSelect">${Object.keys(PitchSolver.FORMATIONS).map(f=>`<option ${data.formation===f?'selected':''}>${f}</option>`).join('')}</select></label>`;}
  function matchTemplateControl(){return `<label class="formation-label">快速填入 <select id="matchTemplateSelect"><option value="">选择模板…</option>${Object.keys(PitchSolver.FORMATIONS).map(f=>`<option value="${f}">${f}</option>`).join('')}</select></label>`;}
  function priorityControl(){return `<label class="formation-label">优化目标 <select id="prioritySelect"><option value="final" ${data.priority==='final'?'selected':''}>最终分数</option><option value="chemistry" ${data.priority==='chemistry'?'selected':''}>化学优先</option><option value="rating" ${data.priority==='rating'?'selected':''}>评分优先</option></select></label>`;}
  function algorithmControl(){const name=view==='match'&&data.algorithm==='guided'?'目标引导分层搜索':'模拟退火';return `<button type="button" class="ghost-btn" id="algorithmBtn" title="调整算法和搜索参数" ${running?'disabled':''}>算法：${name} · ${data.searchSettings.durationSeconds} 秒</button>`;}
  function renderRatingRuleList(){
    const thresholds=[990,995,1001,1006,1012,1017,1023,1028,1034,1039,1045,1050,1056,1061];
    $('#ratingRuleList').innerHTML='<div class="rating-tier"><span>990 以下</span><strong>+0%</strong></div>'+thresholds.map(from=>{const t=PitchSolver.ratingBonusTier(from);return `<div class="rating-tier"><span>${t.from}–${t.to}</span><strong>+${t.percent}%</strong></div>`;}).join('');
  }
  function openAlgorithmSettings(){
    $('#guidedAlgorithmOption').disabled=view!=='match';
    $('#algorithmSelect').value=view==='match'?data.algorithm:'annealing';
    $('#searchDuration').value=data.searchSettings.durationSeconds;
    $('#searchExploration').value=data.searchSettings.exploration;
    $('#searchRestart').value=data.searchSettings.restartEvery;
    $('#searchTargetLimit').value=data.searchSettings.targetLimit;
    syncAlgorithmFields();
    $('#algorithmDialog').showModal();
  }
  function syncAlgorithmFields(){
    const guided=$('#algorithmSelect').value==='guided';
    document.querySelectorAll('.annealing-only').forEach(field=>{field.hidden=guided;field.querySelector('input').disabled=guided;});
    document.querySelectorAll('.guided-only').forEach(field=>{field.hidden=!guided;field.querySelector('input').disabled=!guided;});
    $('#algorithmDescription').textContent=guided?'先筛出有机会达到加成档位的球队和国家目标；每次选定 18 人后，精确比较其所有首发组合，再调整候选名单。':'现有的模拟退火搜索；允许暂时接受较差方案，并定期重新生成起点。';
  }
  function render(){
    if(view==='normal')renderNormal();else if(view==='match')renderMatch();else if(view==='players')renderPlayers();else if(view==='analytics')renderAnalytics();else renderCombos();
  }
  function renderNormal(){
    toolbar('普通模式','从资料库加入至少 19 名候选，选择 11 名首发和 7 名替补。',`${formationControl()}${priorityControl()}${algorithmControl()}<button class="primary-btn" id="calculateBtn" ${running?'disabled':''}>${running?'计算中…':'计算最佳阵容'}</button>`);
    const pool=data.pool.map(player).filter(Boolean),count=uniquePeople(pool);
    $('#viewContent').innerHTML=`<div class="workspace"><div class="work-left"><div class="panel-title">候选球员 <span>${count} 人 · ${pool.length} 个评分版本 · 需至少 19 人</span></div><div class="search-row"><div class="search-box"><input id="poolSearch" autocomplete="off" placeholder="搜索球员姓名，加入候选名单" value="${esc(search)}"><div class="search-results" id="poolSearchResults" hidden></div></div><button class="outline-btn" id="newFromPool">+ 新建球员</button></div><div style="height:17px"></div><div class="candidate-list">${pool.length?pool.map(p=>playerRow(p)).join(''):'<div class="empty">候选名单还是空的。先从上方搜索球员，或手动创建。</div>'}</div></div><div class="work-right"><div class="panel-title">阵容分析 <span>${data.formation} 阵型</span></div><div class="stats"><div class="stat"><b>${count}</b><span>候选球员</span></div><div class="stat"><b>${new Set(pool.map(p=>norm(p.nationality))).size}</b><span>国家 / 地区</span></div><div class="stat"><b>${data.combos.length}</b><span>已设置组合</span></div></div><div class="progress"><div style="width:${Math.min(100,count/19*100)}%"></div></div><p class="hint">${count<19?`再添加 <strong>${19-count}</strong> 人即可开始计算。`:'已满足计算条件；默认按最终分数寻找最佳方案。'}</p><div id="resultMount">${result&&result.mode==='normal'?renderResult(result.value):'<div class="empty">计算结果将在这里展示首发、替补与最终分数。</div>'}</div></div></div>`;
    updateSearchResults();
  }
  function slotName(g){return g.kind==='starter'?`${POS[g.position]||'未指定'} · 首发 ${g.index+1}`:g.kind==='bench'?`替补 ${g.index+1}`:`预备队 ${g.index+1}`;}
  function slotCard(g,pickedByGroup,destinationById,highlightedIds){
    const options=g.options.map(player).filter(Boolean);
    const positionPicker=g.kind==='starter'?`<label class="slot-position-row">场上位置 <select data-position-group="${g.id}" aria-label="首发 ${g.index+1} 的场上位置">${Object.entries(POS).map(([code,label])=>`<option value="${code}" ${g.position===code?'selected':''}>${label}</option>`).join('')}</select></label>`:'';
    const removeButton=g.kind==='reserve'?`<button type="button" class="reserve-remove" data-action="deleteReserve" data-group="${g.id}" aria-label="移除预备队 ${g.index+1} 位置">移除位置</button>`:'';
return `<div class="slot-card"><h4>${g.kind==='starter'?`首发 ${g.index+1}`:esc(slotName(g))}<span>${options.length}/5</span></h4>${positionPicker}<div class="slot-options">${options.length?options.map(p=>{const destination=pickedByGroup.get(g.id)===p.id?destinationById.get(p.id):null;return `<div class="slot-option ${destination?'slot-option-selected':''} ${destination&&highlightedIds.has(p.id)?'slot-option-final':''}"><button type="button" class="slot-player-detail" data-action="editPlayer" data-id="${p.id}" aria-label="查看并编辑 ${esc(p.name)} ${p.rating} 分版本" title="点击查看并编辑球员"><span>${esc(p.name)}</span><b>${p.rating}</b></button><button type="button" class="icon-btn" data-action="slotRemove" data-group="${g.id}" data-id="${p.id}" aria-label="从该位置移除 ${esc(p.name)}">×</button>${destination?`<span class="slot-destination">最终去向：${esc(destination)}</span>`:''}</div>`;}).join(''):'<span class="hint">待添加候选</span>'}</div>${options.length<5?`<div class="slot-search-wrap"><input data-slot-search="${g.id}" autocomplete="off" placeholder="搜索球员，未找到可新建" aria-label="${esc(slotName(g))}的候选球员"><div class="slot-search-results" hidden></div></div>`:''}${removeButton}</div>`;
  }
  function renderMatch(){
    const filled=data.groups.filter(g=>g.options.length).length;
    const solved=result?.mode==='match'?result.value:null;
    const pickedByGroup=new Map((solved?.state.picked||[]).map(choice=>[choice.groupId,choice.id]));
    const destinationById=new Map();
    const highlightedIds=new Set(solved?.state.starters||[]);
    solved?.score.bonus.forEach(bonus=>bonus.benchIds?.forEach(id=>highlightedIds.add(id)));
    solved?.state.starters.forEach((id,index)=>destinationById.set(id,`首发 ${index+1} · ${POS[solved.slots[index]]||'未指定位置'}`));
    solved?.state.bench.forEach((id,index)=>destinationById.set(id,`替补 ${index+1}`));
toolbar('比赛模式','逐格指定 11 个首发位置，可重复；每格最多 5 名候选，计算时选人并按允许位置调换。',`${matchTemplateControl()}${priorityControl()}${algorithmControl()}<button class="ghost-btn" id="autoFillBtn">从普通候选池填充</button><button class="ghost-btn" id="randomFillBtn" title="从资料库随机补足每个位置的候选；首发只选能踢该位置的球员">随机填满空位</button><button class="ghost-btn" id="clearMatchBtn" title="清空比赛模式全部位置的候选球员，保留位置设置和球员资料" ${running?'disabled':''}>一键清空候选</button><button class="ghost-btn" id="addReserveBtn">+ 预备队位置</button><button class="primary-btn" id="calculateBtn" ${running?'disabled':''}>${running?'计算中…':'计算最佳方案'}</button>`);
$('#viewContent').innerHTML=`<div class="workspace"><div class="work-left"><div class="panel-title">位置候选 <span>${filled}/${data.groups.length} 个位置已填</span></div>${data.players.length?'':'<p class="hint">可直接在下方任一位置搜索或创建球员。</p>'}${solved?'<p class="hint">首发和参与化学反应加成的替补会高亮；标签显示所有入选球员的最终去向。</p>':''}<div class="group-label">首发位置 · 11</div><div class="match-grid">${data.groups.filter(g=>g.kind==='starter').map(g=>slotCard(g,pickedByGroup,destinationById,highlightedIds)).join('')}</div><div class="group-label">替补位置 · 7</div><div class="match-grid">${data.groups.filter(g=>g.kind==='bench').map(g=>slotCard(g,pickedByGroup,destinationById,highlightedIds)).join('')}</div><div class="group-label">预备队 · ${data.groups.filter(g=>g.kind==='reserve').length}</div><div class="match-grid">${data.groups.filter(g=>g.kind==='reserve').map(g=>slotCard(g,pickedByGroup,destinationById,highlightedIds)).join('')}</div></div><div class="work-right"><div class="panel-title">计算说明</div><p class="hint">每个位置只能选 1 人，同一球员的评分版本不会重复入选。选出后，所有入选球员可在其允许的位置之间调换；预备队球员也可进入首发或替补。</p><div class="stats"><div class="stat"><b>${filled}</b><span>已填位置</span></div><div class="stat"><b>${data.groups.length}</b><span>总位置</span></div><div class="stat"><b>${uniquePeople(data.players)}</b><span>资料库球员</span></div></div><div id="resultMount">${solved?renderResult(solved):'<div class="empty">填满 18 个基础位置后即可计算比赛方案。</div>'}</div></div></div>`;
  }
  function renderLibraryRows(){
    const grouped=new Map();
    for(const p of data.players){const key=personKey(p);if(!grouped.has(key))grouped.set(key,{base:p,variants:[]});grouped.get(key).variants.push(p);}
    const list=[...grouped.values()].filter(({base})=>norm(base.name).includes(norm(librarySearch))||norm(base.nationality).includes(norm(librarySearch))).sort((a,b)=>a.base.name.localeCompare(b.base.name,'zh-CN'));
    const rows=list.map(({base,variants})=>`<div class="library-row person-row"><div class="avatar">${esc(base.name.slice(0,1))}</div><div class="player-info"><b>${esc(base.name)}</b><small>${esc(base.nationality)} · ${base.positions.map(x=>POS[x]).join(' / ')}<br>${esc(base.teams.join(' · ')||'暂无球队资料')}${comboSummary(base.name)}</small></div><div class="rating-versions">${variants.sort((a,b)=>b.rating-a.rating).map(p=>`<div class="rating-version"><strong>${p.rating}</strong><button class="mini-btn" data-action="editPlayer" data-id="${p.id}" aria-label="编辑 ${p.rating} 分版本">编辑</button><button class="icon-btn" data-action="deletePlayer" data-id="${p.id}" aria-label="删除 ${p.rating} 分版本">×</button></div>`).join('')}</div><button class="mini-btn" data-action="addVariant" data-id="${base.id}">+ 评分版本</button></div>`).join('');
    $('#libraryList').innerHTML=rows||'<div class="empty">没有找到球员。点击右上角添加第一位球员。</div>';
  }
  function renderPlayers(){
    libraryComposing=false;
    toolbar('球员资料库','同一球员可有多个评分版本；姓名、国籍、位置和球队由所有版本共享。',`<button class="ghost-btn" id="demoBtn">载入演示球员</button><button class="primary-btn" id="newPlayerBtn">+ 添加球员</button>`);
    $('#viewContent').innerHTML=`<div class="library-layout"><div class="search-row" style="margin:2px 0 17px"><div class="search-box"><input id="librarySearch" placeholder="搜索姓名或国籍" value="${esc(librarySearch)}"></div></div><div class="library-list" id="libraryList"></div></div>`;
    renderLibraryRows();
  }
  function renderAnalytics(){
    toolbar('关联分析','探索球队、可踢位置、国籍和球员画像之间的关系。',`<button class="primary-btn" id="newPlayerBtn">+ 添加球员</button>`);
    const model=PitchAnalytics.build(data.players);
    const clustered=analyticsState.clusterKind==='teams'?PitchCluster.clusterEntities([...model.teams.values()],analyticsState.clusterCount):analyticsState.clusterKind==='positions'?PitchCluster.clusterEntities([...model.positions.values()],analyticsState.clusterCount):PitchCluster.cluster(model.people,analyticsState.clusterCount,analyticsState.clusterFocus);
    if(analyticsState.clusterKind==='teams'){
      const teams=[...model.teams.values()].sort((a,b)=>b.people.length-a.people.length||a.name.localeCompare(b.name,'zh-CN'));
      clustered.totalTeams=teams.length;
      clustered.matrixOrder=PitchCluster.orderTeams(teams.slice(0,analyticsState.teamMatrixLimit));
    }
    $('#viewContent').innerHTML=PitchAnalyticsView.render(model,POS,analyticsState,clustered);
  }
  function randomFillMatch(){
    if(!data.players.length){toast('请先在球员资料库添加球员');return;}
    const filled=PitchMatchFill.fill(data.groups,data.players);
    if(!filled.added&&!filled.removed){
      toast(filled.matchedGroups<data.groups.length?'当前候选无法为每个位置分配不同球员':filled.unfilledGroups?`${filled.unfilledGroups} 个位置没有更多合适球员`:'所有位置均已填满');
      return;
    }
    data.groups=filled.groups;save();result=null;render();
    const details=[`已随机添加 ${filled.added} 个候选`];
    if(filled.unfilledGroups)details.push(`${filled.unfilledGroups} 个位置不足 5 人`);
    if(filled.matchedGroups<data.groups.length)details.push('目前无法为每个位置分配不同球员');
    toast(details.join('；'));
  }
  function renderCombos(){
    toolbar('三人组合','按姓名匹配，无需先把所有成员加入资料库。',`<button class="primary-btn" id="newComboBtn">+ 添加组合</button>`);
    $('#viewContent').innerHTML=`<div class="library-layout"><div class="library-list">${data.combos.length?data.combos.map(c=>`<div class="combo-row"><div><b>${esc(c.name)}</b><small>${c.members.map(esc).join(' · ')}</small></div><div class="combo-actions"><button class="mini-btn" data-action="editCombo" data-id="${c.id}">编辑</button><button class="mini-btn" data-action="deleteCombo" data-id="${c.id}">删除</button></div></div>`).join(''):'<div class="empty">尚未设置三人组合。组合可以先于球员资料创建。</div>'}</div></div>`;
  }
  function renderResult(r){
    const p=id=>player(id);
    const lineup=r.state.starters.map((id,i)=>`<div class="lineup-tile"><b>${POS[r.slots[i]]}</b><span>${esc(p(id)?.name||'')}</span><small>评分 ${p(id)?.rating||0}</small></div>`).join('');
    const bench=r.state.bench.map(id=>`<div class="lineup-tile"><span>${esc(p(id)?.name||'')}</span><small>评分 ${p(id)?.rating||0}</small></div>`).join('');
    const contributorGroup=(ids,starter)=>ids.length?`<div class="bonus-contributor-group"><strong>${starter?'首发':'替补'} · ${ids.length} 人</strong><div class="bonus-contributor-list">${ids.map(id=>{const index=(starter?r.state.starters:r.state.bench).indexOf(id),place=starter?`${POS[r.slots[index]]||'场上位置'} · 首发 ${index+1}`:`替补 ${index+1}`;return `<button type="button" data-action="editPlayer" data-id="${esc(id)}" aria-label="查看 ${esc(p(id)?.name||'球员')} 的资料"><span>${esc(p(id)?.name||'未知球员')}</span><small>${esc(place)}</small></button>`;}).join('')}</div></div>`:'';
    const bonus=r.score.bonus.sort((a,b)=>b.value-a.value).map(b=>`<details class="bonus-breakdown"><summary class="bonus">${b.type==='team'?'球队':b.type==='nation'?'国家':'组合'} · ${esc(b.label)} +${b.value}</summary><div class="bonus-contributors">${contributorGroup(b.starterIds||[],true)}${contributorGroup(b.benchIds||[],false)}</div></details>`).join('');
    const chosen=r.state.picked?`<div class="result-section"><h4>各位置选中球员</h4><div class="bonus-list">${r.state.picked.map(x=>`<span class="bonus">${esc(slotName(data.groups.find(g=>g.id===x.groupId)||{kind:'reserve',index:0}))}：${esc(p(x.id)?.name||'')}</span>`).join('')}</div></div>`:'';
    const algorithmLabel=r.algorithm==='guided'?'目标引导分层搜索 · 固定 18 人后精确分配':'模拟退火';
return `<div class="result-card"><div class="result-top"><div><h3>当前找到的最佳方案</h3><small>已评估约 ${r.iterations.toLocaleString()} 次调整 · ${algorithmLabel} ${r.searchSettings.duration/1000} 秒 · 尚未证明全局最优</small></div><span class="bonus">${data.priority==='rating'?'评分优先':data.priority==='chemistry'?'化学优先':'最终分数'}</span></div><div class="result-grid final-result-grid"><div class="result-metric final-result-metric"><strong>${r.score.finalScore.toLocaleString('zh-CN',{maximumFractionDigits:2})}</strong><span>最终分数</span></div><div class="result-metric"><strong>${r.score.rating}</strong><span>首发总评分</span></div><div class="result-metric"><strong>${r.score.chemistry}</strong><span>化学反应${r.score.rawChemistry>100?' · 已达上限':''}</span></div></div><p class="hint score-formula">${r.score.rating} + ${r.score.chemistry} × (1 + ${r.score.ratingTier.percent}%) = ${r.score.finalScore.toLocaleString('zh-CN',{maximumFractionDigits:2})}；首发评分 ${r.score.ratingTier.from===null?'低于 990 分':`${r.score.ratingTier.from}–${r.score.ratingTier.to} 档`}</p><div class="result-section"><h4>首发 11 人 · ${r.state.picked?'自选位置':data.formation}</h4><div class="lineup-grid">${lineup}</div></div><div class="result-section"><h4>替补 7 人</h4><div class="lineup-grid">${bench}</div></div><div class="result-section"><h4>化学反应明细</h4>${r.score.rawChemistry>100?`<p class="hint">各项加成原始合计 +${r.score.rawChemistry}；实际计入化学反应 100。</p>`:''}<div class="bonus-list">${bonus||'<span class="hint">尚无加成</span>'}</div></div>${chosen}</div>`;
  }
  function updateSearchResults(){const input=$('#poolSearch'),el=$('#poolSearchResults');if(!input||!el)return;const q=norm(input.value);if(!q){el.hidden=true;return;}const list=data.players.filter(p=>norm(p.name).includes(q)&&!data.pool.includes(p.id)).slice(0,8),exact=data.players.find(p=>norm(p.name)===q);el.innerHTML=list.map(p=>`<div class="search-result" data-action="addPool" data-id="${p.id}"><span>${esc(p.name)} <small>${p.positions.map(x=>POS[x]).join(' / ')}</small></span><b>+ ${p.rating}</b></div>`).join('')+`<div class="search-result" data-action="createFromSearch"><span>${exact?'添加该球员的评分版本':`没有找到？创建「${esc(input.value.trim())}」`}</span><b>＋</b></div>`;el.hidden=false;}
  function placeSlotSearchResults(input,el){
    el.classList.remove('open-up');
    const dashboard=input.closest('.dashboard')?.getBoundingClientRect(),field=input.getBoundingClientRect(),height=el.getBoundingClientRect().height;
    const lowerEdge=Math.min(window.innerHeight,dashboard?.bottom??window.innerHeight),upperEdge=Math.max(0,dashboard?.top??0);
    if(lowerEdge-field.bottom<height+8&&field.top-upperEdge>lowerEdge-field.bottom)el.classList.add('open-up');
  }
  function updateSlotSearchResults(input){
    const group=data.groups.find(g=>g.id===input.dataset.slotSearch),el=input.parentElement.querySelector('.slot-search-results'),q=norm(input.value);
    if(!group||!el)return;
    if(!q){el.hidden=true;return;}
    const matches=data.players.filter(p=>norm(p.name).includes(q)&&!group.options.includes(p.id)).slice(0,6),exact=data.players.find(p=>norm(p.name)===q),alreadyHere=exact&&group.options.includes(exact.id);
    el.innerHTML=matches.map(p=>`<button type="button" class="search-result slot-search-result" data-action="slotPick" data-group="${group.id}" data-id="${p.id}"><span>${esc(p.name)} <small>${p.positions.map(x=>POS[x]).join(' / ')}</small></span><b>+ ${p.rating}</b></button>`).join('')+(alreadyHere?'<div class="slot-search-note">该球员已有一个评分版本在此位置</div>':'')+(exact?`<button type="button" class="search-result slot-search-result" data-action="slotCreateVariant" data-group="${group.id}"><span>添加该球员的新评分版本</span><b>＋</b></button>`:`<button type="button" class="search-result slot-search-result" data-action="slotCreate" data-group="${group.id}"><span>${matches.length?'创建新球员':'没找到？创建'}「${esc(input.value.trim())}」</span><b>＋</b></button>`);
    el.hidden=false;placeSlotSearchResults(input,el);
  }
  function updateRelatedCombos(){
    const name=$('#pName').value.trim(),el=$('#relatedComboList');
    if(!name){el.innerHTML='<p class="hint">先输入姓名，即可查看已有的相关组合。</p>';return;}
    const saved=combosForName(name).map(c=>({name:c.name,members:c.members,pending:false}));
    const drafts=pendingPlayerCombos.map(c=>({name:c.name,members:[name,...c.others],pending:true}));
    const related=[...saved,...drafts];
    el.innerHTML=related.length?related.map(c=>`<div class="related-combo"><div><b>${esc(c.name)}</b>${c.pending?'<span class="pending-tag">待保存</span>':''}</div><small>${c.members.map(esc).join(' · ')}</small></div>`).join(''):'<p class="hint">暂无包含该球员的三人组合。</p>';
  }
  function syncNameLookup(){
    if(editingPlayer||variantSourceId)return;
    const match=data.players.find(p=>norm(p.name)===norm($('#pName').value));
    if(match){
      $('#pNation').value=match.nationality;setTeams(match.teams);
      document.querySelectorAll('#positionChoices input').forEach(input=>input.checked=match.positions.includes(input.value));
      $('#variantNotice').textContent=`已有 ${variantsFor(match).length} 个评分版本；本次会新增版本，其他资料与该球员共享。`;
    }else $('#variantNotice').textContent='同名球员将作为新的评分版本；姓名、国籍、位置和球队信息共享。';
  }
  function openPlayer(id=null,prefill='',slotGroup=null,sourceVariantId=null){
    editingPlayer=id;variantSourceId=sourceVariantId;pendingSlotGroup=slotGroup;pendingPlayerCombos=[];
    const p=id?player(id):sourceVariantId?player(sourceVariantId):null;
    $('#playerDialogTitle').textContent=id?'编辑评分版本':sourceVariantId?'添加评分版本':'添加球员';
    $('#pName').value=p?.name||prefill;$('#pRating').value=id?p.rating:90;$('#pNation').value=p?.nationality||'';setTeams(p?.teams||[]);$('#pTeamEntry').value='';populateProfileSuggestions();
    $('#positionChoices').innerHTML=Object.entries(POS).map(([code,label])=>`<label><input type="checkbox" value="${code}" ${p?.positions.includes(code)?'checked':''}><span>${label}</span></label>`).join('');
    $('#playerComboNames').innerHTML=data.players.map(x=>`<option value="${esc(x.name)}"></option>`).join('');
    $('#pcName').value='';$('#pcMember1').value='';$('#pcMember2').value='';$('#playerComboEditor').hidden=true;
    $('#variantNotice').textContent=p?'评分独立；修改姓名、国籍、位置或球队会同步到该球员的所有版本。':'';
    syncNameLookup();
    updateRelatedCombos();$('#playerDialog').showModal();$('#pName').focus();
  }
  function stagePlayerCombo(){
    const playerName=$('#pName').value.trim(),name=$('#pcName').value.trim(),others=[$('#pcMember1').value.trim(),$('#pcMember2').value.trim()];
    if(!playerName){toast('请先填写球员姓名');$('#pName').focus();return;}
    if(!name||others.some(x=>!x)){toast('请填写组合名称和另外两名球员');return;}
    const members=[playerName,...others];
    if(new Set(members.map(norm)).size!==3){toast('组合需要三名不同球员');return;}
    const signature=list=>list.map(norm).sort().join('\u0000');
    if(data.combos.some(c=>signature(c.members||[])===signature(members))||pendingPlayerCombos.some(c=>signature([playerName,...c.others])===signature(members))){toast('这三名球员的组合已存在');return;}
    pendingPlayerCombos.push({id:uid(),name,others});
    $('#pcName').value='';$('#pcMember1').value='';$('#pcMember2').value='';
    updateRelatedCombos();$('#pcName').focus();toast('已加入待保存组合，可继续添加');
  }
  function openCombo(id=null){editingCombo=id;const c=data.combos.find(x=>x.id===id);$('#comboDialogTitle').textContent=c?'编辑三人组合':'添加三人组合';$('#cName').value=c?.name||'';for(let i=0;i<3;i++)$('#cMember'+i).value=c?.members[i]||'';$('#allPlayers').innerHTML=data.players.map(p=>`<option value="${esc(p.name)}"></option>`).join('');$('#comboDialog').showModal();}
  function demo(){if(data.players.length&&!confirm('演示球员会追加到现有资料库。继续吗？'))return;const names=['林岳','苏航','周霖','陈锋','许岚','叶涛','韩峻','邱泽','卫青','顾驰','罗钧','高驰','陆淮','白浩','夏野','江宁','余信','陶然','宋晟','沈卓','赵远','段云','魏鸣','秦舟'];const positions=[['GK'],['LB'],['CB'],['CB'],['RB'],['CM'],['CDM'],['CM'],['LW'],['ST'],['RW'],['GK'],['LB','LM'],['CB'],['RB','RM'],['CAM','CM'],['LW','LM'],['ST'],['RW','RM'],['CDM'],['CB'],['CM','CAM'],['ST'],['LM','RM']];const nations=['中国','中国','中国','中国','中国','中国','中国','中国','中国','中国','中国','日本','中国','中国','韩国','中国','中国','中国','中国','中国','中国','中国','中国','中国'];names.forEach((name,i)=>{if(data.players.some(p=>p.name===name))return;const id=uid();data.players.push({id,personId:id,name,rating:76+i%11,nationality:nations[i],teams:i<11?['海城联','青峰竞技']:i<19?['海城联','远山城']:['远山城'],positions:positions[i]});});save();render();toast('已加入 24 位虚构演示球员');}
  async function calculate(){
    if(running)return;
    if(view==='normal'&&uniquePeople(data.pool.map(player).filter(Boolean))<19){toast('普通模式至少需要 19 名不同球员');return;}
    if(view==='match'&&data.groups.some(g=>!g.options.length)){toast('请为每个比赛位置添加至少一名候选');return;}
    running=true;render();const button=$('#calculateBtn');
    try{
      const settings={...data.searchSettings};
      const guided=view==='match'&&data.algorithm==='guided';
      const slots=view==='match'?data.groups.filter(g=>g.kind==='starter').sort((a,b)=>a.index-b.index).map(g=>g.position):undefined;
      const onProgress=x=>{if(button)button.textContent=guided?`搜索中 · ${x.evaluations.toLocaleString()} 组 18 人`:`搜索中 · ${x.iterations.toLocaleString()} 次`;};
      const value=guided?await PitchGuidedSolver.optimize({players:data.players,combos:data.combos,groups:data.groups,slots,priority:data.priority,duration:settings.durationSeconds*1000,targetLimit:settings.targetLimit,onProgress}):await PitchSolver.optimize({players:data.players,combos:data.combos,ids:data.pool,groups:view==='match'?data.groups:null,formation:data.formation,slots,priority:data.priority,duration:settings.durationSeconds*1000,exploration:settings.exploration,restartEvery:settings.restartEvery,onProgress});
      result={mode:view,value};toast('阵容计算完成');
    }
    catch(e){toast(e.message||'计算失败');}
    finally{running=false;render();}
  }
  document.addEventListener('click',e=>{
    const tab=e.target.closest('.tab');if(tab){setView(tab.dataset.view);return;}
    const action=e.target.closest('[data-action]');
    if(action){const {action:a,id,group}=action.dataset;
      if(a==='analyticsTeam'){analyticsState.networkTeam=action.dataset.team;analyticsState.teamPair=null;renderAnalytics();return;}
      if(a==='analyticsTeamPair'){analyticsState.teamPair=PitchAnalytics.pairKey(action.dataset.a,action.dataset.b);analyticsState.networkTeam=null;renderAnalytics();return;}
      if(a==='analyticsTeamShare'){analyticsState.teamShareA=action.dataset.a;analyticsState.teamShareB=action.dataset.b;renderAnalytics();return;}
      if(a==='analyticsPositionPair'){analyticsState.sourcePosition=action.dataset.from;analyticsState.positionPair={from:action.dataset.from,to:action.dataset.to};renderAnalytics();return;}
      if(a==='analyticsCountryTeam'){analyticsState.country=action.dataset.country;analyticsState.club=action.dataset.team;renderAnalytics();return;}
      if(a==='analyticsCluster'){analyticsState.clusterSelected=action.dataset.cluster;analyticsState.clusterEntity=null;renderAnalytics();return;}
      if(a==='analyticsClusterEntity'){analyticsState.clusterEntity=action.dataset.entity;renderAnalytics();return;}
      if(a==='analyticsTeamMatrix'){analyticsState.teamMatrixA=action.dataset.a;analyticsState.teamMatrixB=action.dataset.b;renderAnalytics();return;}
      if(a==='removeTeam'){editingTeams.splice(Number(action.dataset.index),1);renderTeamChips();return;}
      if(a==='addPool'){data.pool.push(id);search='';save();render();return;}
      if(a==='remove'){data.pool=data.pool.filter(x=>x!==id);save();result=null;render();return;}
      if(a==='createFromSearch'){const name=$('#poolSearch')?.value.trim()||'',existing=data.players.find(p=>norm(p.name)===norm(name));openPlayer(null,name,null,existing?.id||null);return;}
      if(a==='editPlayer'){openPlayer(id);return;}
      if(a==='addVariant'){const p=player(id);if(p)openPlayer(null,p.name,null,p.id);return;}
      if(a==='deletePlayer'){const p=player(id),multiple=variantsFor(p).length>1;if(confirm(multiple?`删除「${p.name}」的 ${p.rating} 分版本？`:`删除球员「${p.name}」？`)){data.players=data.players.filter(x=>x.id!==id);data.pool=data.pool.filter(x=>x!==id);data.groups.forEach(g=>g.options=g.options.filter(x=>x!==id));save();result=null;render();}return;}
      if(a==='editCombo'){openCombo(id);return;}
      if(a==='deleteCombo'){data.combos=data.combos.filter(x=>x.id!==id);save();result=null;render();return;}
      if(a==='slotPick'){const g=data.groups.find(x=>x.id===group);if(g&&g.options.length<5&&!g.options.includes(id)){g.options.push(id);save();result=null;render();}return;}
      if(a==='slotCreate'){const input=document.querySelector(`[data-slot-search="${group}"]`);openPlayer(null,input?.value.trim()||'',group);return;}
      if(a==='slotCreateVariant'){const input=document.querySelector(`[data-slot-search="${group}"]`),name=input?.value.trim()||'',existing=data.players.find(p=>norm(p.name)===norm(name));if(existing)openPlayer(null,name,group,existing.id);return;}
      if(a==='slotRemove'){const g=data.groups.find(x=>x.id===group);g.options=g.options.filter(x=>x!==id);save();result=null;render();return;}
      if(a==='deleteReserve'){data.groups=data.groups.filter(x=>x.id!==group);data.groups.filter(x=>x.kind==='reserve').forEach((x,i)=>x.index=i);save();result=null;render();return;}
    }
    if(e.target.id==='newPlayerBtn'||e.target.id==='newFromPool')openPlayer();
    if(e.target.id==='addTeamBtn')addTeamEntries($('#pTeamEntry').value);
    if(e.target.id==='addPlayerComboBtn'){if(!$('#pName').value.trim()){toast('请先填写球员姓名');$('#pName').focus();}else{$('#playerComboEditor').hidden=false;$('#pcName').focus();}}
    if(e.target.id==='savePlayerComboBtn')stagePlayerCombo();
    if(e.target.id==='cancelPlayerComboBtn')$('#playerComboEditor').hidden=true;
    if(e.target.id==='newComboBtn')openCombo();
    if(e.target.id==='demoBtn')demo();
    if(e.target.id==='algorithmBtn')openAlgorithmSettings();
    if(e.target.id==='calculateBtn')calculate();
    if(e.target.id==='addReserveBtn'){data.groups.push({id:uid(),kind:'reserve',index:data.groups.filter(x=>x.kind==='reserve').length,options:[]});save();result=null;render();}
    if(e.target.id==='autoFillBtn'){const pool=data.pool.map(player).filter(Boolean);if(!pool.length){toast('请先在普通模式添加候选球员');return;}data.groups.forEach(g=>{const choices=pool.filter(p=>g.kind!=='starter'||p.positions.includes(g.position));const offset=g.kind==='starter'?g.index:(g.kind==='bench'?11+g.index*3:18+g.index*3);const rotated=choices.length?Array.from({length:Math.min(5,choices.length)},(_,i)=>choices[(offset+i)%choices.length].id):[];g.options=[...new Set([...g.options,...rotated])].slice(0,5);});save();result=null;render();toast('已根据普通候选池填充位置');}
    if(e.target.id==='randomFillBtn')randomFillMatch();
    if(e.target.id==='clearMatchBtn'){
      const count=data.groups.reduce((sum,g)=>sum+g.options.length,0);
      if(!count){toast('比赛模式的位置候选已经是空的');return;}
      data.groups.forEach(g=>g.options=[]);
      save();result=null;render();toast(`已清空 ${count} 个位置候选`);
    }
    if(e.target.id==='closePlayerDialog'||e.target.id==='cancelPlayer')$('#playerDialog').close();
    if(e.target.id==='closeComboDialog'||e.target.id==='cancelCombo')$('#comboDialog').close();
    if(e.target.id==='closeAlgorithmDialog'||e.target.id==='cancelAlgorithm')$('#algorithmDialog').close();
    if(e.target.id==='closeImportDialog'||e.target.id==='cancelImport')$('#importDialog').close();
    if(e.target.id==='updateDefaultsBtn'){
      if(running){toast('请等待计算完成后再更新');return;}
      pendingImport={players:window.PitchDefaultData.players,combos:window.PitchDefaultData.combos};
      $('#replaceImportBtn').hidden=true;
      $('#importSummary').textContent=`内置资料 ${window.PitchDefaultData.builtInRevision||''}：${pendingImport.players.length} 个评分版本、${pendingImport.combos.length} 个组合。`;
      $('#importHelp').textContent='合并会添加缺少的球员版本、球队、位置和组合，保留现有球员评分、国家、比赛候选和搜索设置。已删除的内置条目可能重新加入。';
      $('#importDialog').showModal();
    }
    if(e.target.id==='replaceImportBtn'&&pendingImport){
      data=hydrate(pendingImport);save();result=null;$('#importDialog').close();render();toast('已替换为上传的资料');
    }
    if(e.target.id==='mergeImportBtn'&&pendingImport){
      const merged=PitchDataMerge.merge(data,pendingImport,uid);
      data=hydrate(merged.data);save();result=null;$('#importDialog').close();render();
      toast(`新增 ${merged.addedPlayers} 个球员版本、${merged.addedCombos} 个组合；更新 ${merged.updatedPeople} 名球员资料`);
    }
    if(e.target.id==='exportBtn'){const blob=new Blob([JSON.stringify({version:1,...data},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='绿茵阵容资料-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  });
  document.addEventListener('input',e=>{if(e.target.id==='poolSearch'){search=e.target.value;updateSearchResults();}if(e.target.id==='pName'){syncNameLookup();updateRelatedCombos();}if(e.target.dataset.slotSearch)updateSlotSearchResults(e.target);if(e.target.id==='librarySearch'){librarySearch=e.target.value;if(!libraryComposing&&!e.isComposing)renderLibraryRows();}});
  document.addEventListener('compositionstart',e=>{if(e.target.id==='librarySearch')libraryComposing=true;});
  document.addEventListener('compositionend',e=>{if(e.target.id==='librarySearch'){libraryComposing=false;librarySearch=e.target.value;renderLibraryRows();}});
  document.addEventListener('keydown',e=>{if(e.target.id==='pTeamEntry'&&e.key==='Enter'){e.preventDefault();addTeamEntries(e.target.value);}});
  document.addEventListener('change',e=>{if(e.target.id==='formationSelect'){data.formation=e.target.value;save();result=null;render();}if(e.target.id==='matchTemplateSelect'&&PitchSolver.FORMATIONS[e.target.value]){data.groups.filter(g=>g.kind==='starter').forEach(g=>g.position=PitchSolver.FORMATIONS[e.target.value][g.index]);save();result=null;render();}if(e.target.dataset.positionGroup){const g=data.groups.find(x=>x.id===e.target.dataset.positionGroup);if(g&&POS[e.target.value]){g.position=e.target.value;save();result=null;render();}}if(e.target.id==='prioritySelect'){data.priority=e.target.value;save();result=null;render();}});
document.addEventListener('change',e=>{if(e.target.id==='teamMinShared'){analyticsState.minShared=Number(e.target.value);renderAnalytics();}if(e.target.id==='analyticsTeamShareLimit'){analyticsState.teamShareLimit=Number(e.target.value);analyticsState.teamShareA=null;analyticsState.teamShareB=null;renderAnalytics();}if(e.target.id==='analyticsSourcePosition'){analyticsState.sourcePosition=e.target.value;analyticsState.positionPair=null;renderAnalytics();}if(e.target.id==='analyticsNationMetric'){analyticsState.nationMetric=e.target.value;renderAnalytics();}if(e.target.id==='analyticsClusterKind'){analyticsState.clusterKind=e.target.value;analyticsState.clusterCount=e.target.value==='players'?4:e.target.value==='teams'?2:3;analyticsState.clusterSelected=null;analyticsState.clusterEntity=null;renderAnalytics();}if(e.target.id==='analyticsClusterFocus'){analyticsState.clusterFocus=e.target.value;analyticsState.clusterSelected=null;renderAnalytics();}if(e.target.id==='analyticsClusterCount'){analyticsState.clusterCount=Number(e.target.value);analyticsState.clusterSelected=null;analyticsState.clusterEntity=null;renderAnalytics();}if(e.target.id==='analyticsTeamMatrixLimit'){analyticsState.teamMatrixLimit=Number(e.target.value);analyticsState.teamMatrixA=null;analyticsState.teamMatrixB=null;renderAnalytics();}});
  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.network-node[data-action]')){e.preventDefault();analyticsState.networkTeam=e.target.dataset.team;analyticsState.teamPair=null;renderAnalytics();}});
  $('#algorithmSelect').addEventListener('change',syncAlgorithmFields);
  $('#playerForm').addEventListener('submit',e=>{
    e.preventDefault();
    const name=$('#pName').value.trim(),rating=Number($('#pRating').value),nationality=$('#pNation').value.trim();
    const positions=[...document.querySelectorAll('#positionChoices input:checked')].map(x=>x.value);
    const teams=uniqueTeams([...editingTeams,...parseTeams($('#pTeamEntry').value)]);
    if(!positions.length){toast('请至少选择一个位置');return;}
    if(!Number.isFinite(rating)||rating<1||rating>999){toast('评分请输入 1–999');return;}
    const current=editingPlayer?player(editingPlayer):null,source=variantSourceId?player(variantSourceId):null;
    const exact=data.players.find(p=>norm(p.name)===norm(name));
    const personId=current?personKey(current):source?personKey(source):exact?personKey(exact):uid();
    if(exact&&personKey(exact)!==personId){toast('该姓名属于另一名球员');return;}
    const siblings=data.players.filter(p=>personKey(p)===personId);
    if(siblings.some(p=>Number(p.rating)===rating&&p.id!==editingPlayer)){toast('该球员已有相同评分版本');return;}
    const oldName=siblings[0]?.name;
    if(oldName&&norm(oldName)!==norm(name))data.combos.forEach(c=>{c.members=c.members.map(member=>norm(member)===norm(oldName)?name:member);});
    siblings.forEach(p=>Object.assign(p,{name,nationality,positions:[...positions],teams:[...teams]}));
    if(current)current.rating=rating;
    else{
      const id=uid();data.players.push({id,personId,name,rating,nationality,positions:[...positions],teams:[...teams]});
      const group=data.groups.find(g=>g.id===pendingSlotGroup);
      if(group&&group.options.length<5)group.options.push(id);
      else if(view==='normal'&&search)data.pool.push(id);
    }
    const addedCombos=pendingPlayerCombos.length;
    pendingPlayerCombos.forEach(c=>data.combos.push({id:c.id,name:c.name,members:[name,...c.others]}));
    pendingPlayerCombos=[];pendingSlotGroup=null;variantSourceId=null;$('#playerDialog').close();search='';save();result=null;render();toast(addedCombos?`球员及 ${addedCombos} 个组合已保存`:'球员资料已保存');
  });
  $('#playerDialog').addEventListener('close',()=>{pendingSlotGroup=null;variantSourceId=null;pendingPlayerCombos=[];});
  $('#comboForm').addEventListener('submit',e=>{e.preventDefault();const name=$('#cName').value.trim(),members=[0,1,2].map(i=>$('#cMember'+i).value.trim());if(new Set(members.map(norm)).size!==3){toast('组合需要三名不同球员');return;}if(editingCombo)Object.assign(data.combos.find(x=>x.id===editingCombo),{name,members});else data.combos.push({id:uid(),name,members});$('#comboDialog').close();save();result=null;render();toast('三人组合已保存');});
  $('#algorithmForm').addEventListener('submit',e=>{
    e.preventDefault();
    const algorithm=$('#algorithmSelect').value,durationSeconds=Number($('#searchDuration').value),exploration=Number($('#searchExploration').value),restartEvery=Number($('#searchRestart').value),targetLimit=Number($('#searchTargetLimit').value);
    if(!['annealing','guided'].includes(algorithm)||algorithm==='guided'&&view!=='match'||!Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>120||!Number.isFinite(exploration)||exploration<0.1||exploration>5||!Number.isInteger(restartEvery)||restartEvery<0||restartEvery>100000||!Number.isInteger(targetLimit)||targetLimit<1||targetLimit>64){toast('请检查搜索参数');return;}
    if(view==='match')data.algorithm=algorithm;
    data.searchSettings={durationSeconds,exploration,restartEvery,targetLimit};save();result=null;$('#algorithmDialog').close();render();toast('搜索设置已保存');
  });
  $('#importFile').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const parsed=JSON.parse(await file.text());
      if(!Array.isArray(parsed.players)||!Array.isArray(parsed.combos))throw Error('文件格式不正确');
      pendingImport=parsed;
      $('#replaceImportBtn').hidden=false;
      $('#importHelp').textContent='合并：添加新球员、评分版本和三人组合，保留当前比赛位置。替换：使用上传文件中的全部资料和位置设置。';
      $('#importSummary').textContent=`${file.name}：${parsed.players.length} 个评分版本、${parsed.combos.length} 个组合。`;
      $('#importDialog').showModal();
    }catch(err){pendingImport=null;toast(err.message||'导入失败');}
    finally{e.target.value='';}
  });
  $('#importDialog').addEventListener('close',()=>{pendingImport=null;});
  window.PitchApp={
    snapshot:()=>JSON.parse(JSON.stringify(data)),
    searchMatch:async()=>{if(running)throw Error('计算正在进行');setView('match');await calculate();},
    importOCR:draft=>{
      if(running)throw Error('请等待计算完成后再导入');
      const merged=PitchOCR.mergeDraft(data,draft,PitchDataMerge.merge,uid);
      const next=hydrate(merged.data);localStorage.setItem(key,JSON.stringify(next));data=next;result=null;setView('match');
      toast(`已导入 ${draft.slots.length} 个位置，新增 ${merged.addedPlayers} 个评分版本`);return merged.addedPlayers;
    }
  };
  renderRatingRuleList();render();
})();
