const assert=require('node:assert/strict');
const OCR=require('../dist/ocr-core.js');
const {merge}=require('../dist/data-merge.js');
const players=[
 {id:'lautaro',personId:'a',name:'劳塔罗',rating:98,nationality:'阿根廷',positions:['ST'],teams:['蓝黑队']},
 {id:'lisandro',personId:'b',name:'L.马丁内斯',rating:96,nationality:'阿根廷',positions:['CB','CDM'],teams:['红魔']}
];
assert.equal(OCR.identity('L. 马 丁 内 斯',['ST'],players).name,'劳塔罗');
assert.equal(OCR.identity('L．马丁内斯',['CB'],players).name,'L.马丁内斯');
assert.ok(OCR.identity('L.马丁内斯',[],players).issue);
assert.ok(OCR.identity('L.马丁内斯',['ST','CB'],players).issue);
assert.equal(OCR.identity('0 ， 马 尔 穆 什').name,'O.马尔穆什');
assert.equal(OCR.identity('一 N. 冈 萨 雷 斯').name,'N.冈萨雷斯');
assert.equal(OCR.rating({lines:[{text:'评分'},{text:'96'}]}),96);
assert.equal(OCR.rating({lines:[{text:'96 98'}]}),null);
assert.match(OCR.blocker({text:'阵 容 18 人 未 翻 卡 不 可 选 择 预 备 队'}),/18 人翻卡/);
assert.equal(OCR.blocker({text:'球员详情'}),'');
const smallFrame={width:800,height:458,text:'',lines:[
 {text:'H. 埃 基 蒂 克',x:250,y:120,width:100,height:16},
 {text:'中锋 左前卫',x:235,y:145,width:100,height:12},
 {text:'法国到 2002-06-20',x:235,y:163,width:100,height:12}
]};
assert.equal(OCR.detail(smallFrame,[{name:'测试',nationality:'法国'}]).nationality,'法国','Strip flag OCR noise using known nationality names');
const candidates=[players[0],players[1],...['甲','乙','丙'].map((n,i)=>({id:n,personId:n,name:n,rating:90+i,nationality:'中国',positions:['ST'],teams:['甲队']}))];
const current={players:candidates,combos:[],groups:[{id:'g',kind:'bench',index:0,options:[]}],pool:['lautaro']};
const draft={slots:[{groupId:'g',kind:'bench',label:'替补1',players:candidates.map(p=>({...p,issues:[]}))}],combos:[]};
let id=0;const result=OCR.mergeDraft(current,draft,merge,()=>String(++id));
assert.equal(result.data.players.length,5);
assert.deepEqual(result.data.groups[0].options,candidates.map(p=>p.id));
assert.deepEqual(result.data.pool,['lautaro']);
assert.deepEqual(current.groups[0].options,[],'Import preparation must not mutate current data');
const invalid=structuredClone(draft);invalid.slots[0].players[0].issues=['评分待确认'];
assert.throws(()=>OCR.mergeDraft(current,invalid,merge,()=>String(++id)),/未确认/);
invalid.slots[0].players[0].issues=[];invalid.slots[0].players.pop();
assert.throws(()=>OCR.validateDraft(invalid),/5 名候选/);
const different=structuredClone(current);different.groups[0].id='changed';
assert.throws(()=>OCR.mergeDraft(different,draft,merge,()=>String(++id)),/位置已改变/);
console.log('OCR identity disambiguation, rating ambiguity and transactional import passed');
