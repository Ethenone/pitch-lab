(function(){
  'use strict';
  const api=window.pitchDesktopOCR;if(!api)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let config={rect:null,slots:[],delay:750,refreshKnown:false},draft=null,screenshot=null,mode='points',selected=null,active=false;
  const dialog=document.createElement('dialog');dialog.id='ocrDialog';dialog.innerHTML=`
    <div class="dialog-head"><div><span class="section-kicker">DESKTOP OCR · 开发中</span><h2>游戏候选采集</h2></div><button type="button" class="icon-btn" id="ocrClose" aria-label="关闭">×</button></div>
    <p class="ocr-warning" id="ocrDevelopmentNotice"><b>OCR 功能开发中，功能不稳定。</b>识别和自动操作可能失败，请核对采集结果；自动操作期间可按 Esc 停止。</p>
    <p class="hint">先在比赛模式指定首发位置和预备队数量。打开微信游戏的阵容页面，框选游戏内容（不含顶部微信标题栏），再标记各位置。采集时软件会隐藏，请保持游戏窗口不动。<b>Esc 随时停止并保留断点（也支持 Ctrl + Alt + F8）。</b></p>
    <p class="hint">默认每张卡都打开详情：读姓名、评分、国籍和位置。新球员继续读取球队、组合并滚动去重。中锋 L.马丁内斯映射为劳塔罗，后卫保留 L.马丁内斯；歧义会停止。</p>
    <p class="ocr-warning">依次采集首发 → 替补 → 预备队。启用临时选人后，每格读取五名候选，再确认一名不重复球员，让前 18 人完成翻卡以打开预备队。不会点击“锁定阵容”。</p>
    <div class="ocr-actions"><button class="outline-btn" id="ocrRegion">① 在屏幕上框选区域</button><button class="outline-btn" id="ocrLineup">② 标记首发和替补</button><button class="outline-btn" id="ocrReserve">③ 标记预备队</button><button class="primary-btn" id="ocrStart">开始自动采集</button><button class="ghost-btn" id="ocrStop" disabled>停止采集</button></div>
    <div class="ocr-settings"><label>点击后等待（毫秒）<input id="ocrDelay" type="number" min="350" max="3000" step="50" value="750"></label><label>详情额外等待（秒）<input id="ocrDetailWait" type="number" min="0" max="30" value="8"></label><label><input id="ocrResume" type="checkbox" checked> 配置未变时从断点继续</label><label><input id="ocrRefresh" type="checkbox"> 已有球员也重新读取球队和组合</label><label><input id="ocrTemporary" type="checkbox" checked> 读取后临时选人（不锁定）</label><label><input id="ocrSearch" type="checkbox" checked> 导入后立即搜索</label></div>
    <p id="ocrStatus" role="status">正在检查本机 OCR…</p>
    <div class="ocr-calibration"><div><p class="hint" id="ocrCanvasHint">点击“在屏幕上框选区域”，软件隐藏后直接在整个屏幕上拖框；松开确认，Esc 或右键取消。</p><canvas id="ocrCanvas" width="1000" height="600"></canvas></div><div><h3>位置标记</h3><p class="hint">选择下面的位置，再点击截图中对应的卡片。首发位置须与游戏一致，可先回比赛模式修改。预备队超过一屏时，填写从顶部向下滚动的次数，并在该页截图上标记。</p><div id="ocrSlots"></div><label>预备队截图向下滚动次数 <input id="ocrPage" type="number" min="0" max="30" value="0"></label></div></div>
    <section id="ocrReview" hidden><h3>采集校对</h3><p class="hint">检查姓名、评分、位置和球队。黄色提示需要手动确认；不完整的采集不能导入。导入会更新全部比赛候选，保留现有资料库，并合并新资料。采集前的资料备份与最新草稿保存在数据文件夹的 automation 目录。</p><div id="ocrReviewSlots"></div><h3>新读取的三人组合</h3><div id="ocrReviewCombos"></div><button class="primary-btn" id="ocrImport">确认并导入比赛模式</button></section>`;
  document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);
  const button=document.createElement('button');button.className='text-button';button.textContent='游戏采集（开发中）';button.title='OCR 功能开发中，功能不稳定';button.id='ocrOpen';document.querySelector('.top-actions').prepend(button);
  const label=g=>g.kind==='starter'?`首发 ${g.index+1} · ${PitchOCR.POS[g.position]}`:g.kind==='bench'?`替补 ${g.index+1}`:`预备队 ${g.index+1}`;
  function syncSlots(){config.slots=PitchApp.snapshot().groups.map(g=>{const old=config.slots.find(s=>s.id===g.id);return {...g,label:label(g),point:old?.point||null,scroll:old?.scroll||0};});renderSlots();}
  function status(text){$('ocrStatus').textContent=text;}
  function renderSlots(){
    $('ocrSlots').innerHTML=config.slots.map(s=>`<button type="button" class="ocr-slot ${selected===s.id?'selected':''}" data-slot="${esc(s.id)}">${esc(s.label)} <span>${s.point?'✓':'待标记'}</span>${s.kind==='reserve'&&s.scroll?` <small>滚动 ${s.scroll} 次</small>`:''}</button>`).join('');
    $('ocrSlots').querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{selected=b.dataset.slot;mode='points';renderSlots();draw();status(`请在截图点击 ${config.slots.find(s=>s.id===selected).label} 的卡片`);});
  }
  const canvas=$('ocrCanvas'),ctx=canvas.getContext('2d');
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);if(!screenshot)return;ctx.drawImage(screenshot,0,0,canvas.width,canvas.height);
    if(mode==='points')for(const s of config.slots.filter(s=>s.point&&(s.kind==='reserve')===(config.previewKind==='reserve')&&(s.kind!=='reserve'||s.scroll===Number($('ocrPage').value)))){
      const x=s.point.x*canvas.width,y=s.point.y*canvas.height;ctx.fillStyle=s.id===selected?'#ff908e':'#c8f065';ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#071313';ctx.font='bold 15px sans-serif';ctx.fillText(String(s.index+1),x-5,y+5);
    }
  }
  async function showImage(data){screenshot=new Image();await new Promise((resolve,reject)=>{screenshot.onload=resolve;screenshot.onerror=reject;screenshot.src=data;});canvas.width=screenshot.naturalWidth;canvas.height=screenshot.naturalHeight;draw();}
  const point=event=>{const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)*canvas.width/r.width,y:(event.clientY-r.top)*canvas.height/r.height};};
  canvas.onpointerdown=event=>{
    if(active||!screenshot)return;const p=point(event);
    if(selected){const s=config.slots.find(s=>s.id===selected);if((s.kind==='reserve')!==(config.previewKind==='reserve'))return status('请先切换到该位置所在的阵容／预备队截图');s.point={x:p.x/canvas.width,y:p.y/canvas.height};s.scroll=s.kind==='reserve'?Number($('ocrPage').value):0;const next=config.slots.find(x=>!x.point&&(x.kind==='reserve')===(s.kind==='reserve'));selected=next?.id||s.id;renderSlots();draw();status(next?`已标记 ${s.label}，接下来点击 ${next.label}`:'此页面的位置标记完成');}
  };
  function busy(value){active=value;for(const id of ['ocrRegion','ocrLineup','ocrReserve','ocrStart','ocrClose','ocrImport'])$(id).disabled=value;$('ocrStop').disabled=!value;}
  const safe=fn=>async()=>{try{await fn();}catch(e){let message=e.message||String(e);message=message.replace(/^Error invoking remote method '[^']+': Error: /,'');if(/Target lost focus|Game activation timed out/.test(message))message='未能保持游戏在前台，操作已停止。请重试，在软件隐藏后 12 秒内点击游戏顶部白色标题栏；不要移动窗口。已有标记保留。';if(message.includes('Game window closed'))message='游戏窗口已关闭，请打开游戏后重新框选。';status(message);}};
  button.onclick=safe(async()=>{syncSlots();dialog.showModal();const health=await api.health();status(health.ready?'本机中文 OCR 可用。先框选区域并标记位置。':'请在 Windows 语言设置安装简体中文 OCR。');});
  $('ocrClose').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(active){e.preventDefault();api.stop();}});
  $('ocrRegion').onclick=safe(async()=>{
    if(active)return;busy(true);$('ocrStop').disabled=true;
    status('请直接在屏幕上拖框选中游戏内容区，松开鼠标确认；Esc 或右键取消。');
    try{
      const shot=await api.screen();if(shot.cancelled){status('已取消框选，原区域和位置标记保留。');return;}
      await showImage(shot.image);config.rect=shot.rect;config.slots.forEach(s=>s.point=null);
      config.previewKind='starter';mode='points';selected=config.slots.find(s=>s.kind==='starter')?.id;
      renderSlots();draw();status('区域已选定。请在游戏阵容调整页面标记首发和替补，再切换预备队标记。');
    }finally{busy(false);}
  });
  async function calibrate(kind){
    if(active)return;if(!config.rect)throw Error('请先框选区域');busy(true);$('ocrStop').disabled=true;
    status('正在切换游戏窗口；如未自动置前，请在软件隐藏后点击游戏顶部白色标题栏（12 秒内），不要移动窗口。');
    try{
      const shot=await api.calibrate({...config,previewScroll:Number($('ocrPage').value)},kind);
      await showImage(shot.image);config.previewKind=kind;mode='points';
      selected=config.slots.find(s=>(s.kind==='reserve')===(kind==='reserve')&&!s.point)?.id||config.slots.find(s=>(s.kind==='reserve')===(kind==='reserve'))?.id;
      renderSlots();draw();status(`点击截图标记 ${config.slots.find(s=>s.id===selected)?.label||'对应位置'}`);
    }finally{busy(false);}
  }
  $('ocrLineup').onclick=safe(()=>calibrate('starter'));$('ocrReserve').onclick=safe(()=>calibrate('reserve'));
  $('ocrStart').onclick=safe(async()=>{
    syncSlots();if(!config.rect||config.slots.some(s=>!s.point))throw Error('请先完成区域框选和全部位置标记');
    config.delay=Number($('ocrDelay').value);config.detailWaitMs=Number($('ocrDetailWait').value)*1000;config.resume=$('ocrResume').checked;config.refreshKnown=$('ocrRefresh').checked;config.temporarySelection=$('ocrTemporary').checked;busy(true);status('开始采集；Esc 或 Ctrl + Alt + F8 停止，保留断点');
    try{draft=await api.start(config,PitchApp.snapshot());renderReview();status(draft.error||'采集完成，请校对识别结果');
      let ready=draft.status==='complete';try{PitchOCR.validateDraft(draft);}catch{ready=false;}
      if(ready){PitchApp.importOCR(draft);dialog.close();if($('ocrSearch').checked)await PitchApp.searchMatch();}
    }finally{busy(false);}
  });
  $('ocrStop').onclick=()=>api.stop();api.onProgress(event=>status(event.message));
  function renderReview(){
    if(!draft)return;$('ocrReview').hidden=false;
    $('ocrReviewSlots').innerHTML=draft.slots.map((slot,si)=>`<details class="ocr-review-slot" ${slot.players.some(p=>p.issues.length)?'open':''}><summary>${esc(slot.label)} · ${slot.players.length}/5 人</summary>${slot.players.map((p,pi)=>`<div class="ocr-player" data-si="${si}" data-pi="${pi}"><div class="ocr-review-fields"><label>姓名<input data-field="name" value="${esc(p.name)}"></label><label>评分<input data-field="rating" type="number" min="1" max="999" value="${p.rating??''}"></label><label>国家<input data-field="nationality" value="${esc(p.nationality)}"></label><label>球队（逗号分隔）<input data-field="teams" value="${esc(p.teams.join('，'))}"></label></div><div class="ocr-positions">${Object.entries(PitchOCR.POS).map(([code,text])=>`<label><input type="checkbox" data-position="${code}" ${p.positions.includes(code)?'checked':''}>${text}</label>`).join('')}</div>${p.issues.length?`<p class="ocr-warning">${esc(p.issues.join('；'))}</p><label><input data-ack type="checkbox">我已校对该球员信息及相关组合</label>`:''}</div>`).join('')}</details>`).join('');
    $('ocrReviewCombos').innerHTML=draft.combos.map((c,i)=>`<div class="ocr-combo" data-ci="${i}"><label>组合名<input data-combo-name value="${esc(c.name)}"></label>${c.members.map((m,j)=>`<label>成员 ${j+1}<input data-member="${j}" value="${esc(m)}"></label>`).join('')}${c.issues.length?`<p class="ocr-warning">${esc(c.issues.join('；'))}</p><label><input data-ack type="checkbox">已核对三名成员身份</label>`:''}<label><input data-exclude type="checkbox">不导入这条组合</label></div>`).join('')||'<p class="hint">没有新增组合记录。</p>';
  }
  $('ocrImport').onclick=safe(async()=>{
    const reviewed=JSON.parse(JSON.stringify(draft));
    dialog.querySelectorAll('.ocr-player').forEach(el=>{const p=reviewed.slots[el.dataset.si].players[el.dataset.pi];el.querySelectorAll('[data-field]').forEach(input=>{p[input.dataset.field]=input.dataset.field==='rating'?Number(input.value):input.dataset.field==='teams'?input.value.split(/[,，、;；]/).map(s=>s.trim()).filter(Boolean):input.value.trim();});p.positions=[...el.querySelectorAll('[data-position]:checked')].map(x=>x.dataset.position);if(el.querySelector('[data-ack]')?.checked)p.issues=[];});
    const excluded=new Set();dialog.querySelectorAll('.ocr-combo').forEach(el=>{const i=Number(el.dataset.ci),c=reviewed.combos[i];c.name=el.querySelector('[data-combo-name]').value.trim();c.members=[...el.querySelectorAll('[data-member]')].map(x=>x.value.trim());if(el.querySelector('[data-ack]')?.checked)c.issues=[];if(el.querySelector('[data-exclude]').checked)excluded.add(i);});reviewed.combos=reviewed.combos.filter((_,i)=>!excluded.has(i));
    PitchApp.importOCR(reviewed);draft=reviewed;dialog.close();if($('ocrSearch').checked)await PitchApp.searchMatch();
  });
  api.settings().then(saved=>{if(saved.config)config=saved.config;draft=saved.draft;syncSlots();$('ocrDelay').value=config.delay||750;$('ocrDetailWait').value=(config.detailWaitMs??8000)/1000;$('ocrResume').checked=config.resume!==false;$('ocrRefresh').checked=!!config.refreshKnown;renderReview();}).catch(e=>status(e.message));
})();
