// Opt-in test of the actual Windows OCR engine, using the user's six reference screenshots.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {WindowsBridge}=require('../desktop/automation/bridge.cjs');
const OCR=require('../dist/ocr-core.js');
const bridge=new WindowsBridge();
(async()=>{
 const root=path.resolve('release/ocr-fixtures');
 const frame=await bridge.call('ocr',{path:path.join(root,'detail.png')});
 const p=OCR.detail(frame);assert.equal(p.name,'O.马尔穆什');assert.equal(p.nationality,'埃及');assert.deepEqual(new Set(p.positions),new Set(['ST','LW','LM']));
 const rating=await bridge.call('ocr',{path:path.join(root,'detail.png'),crop:{x:1425,y:310,width:110,height:95},scale:3,invert:true,language:'en-GB'});
 assert.equal(OCR.rating(rating),96);
 const comboFrame=await bridge.call('ocr',{path:path.join(root,'combos.png'),crop:{x:450,y:280,width:1080,height:660},scale:1.7,invert:true});
 const combos=OCR.combos(comboFrame,[]);assert.equal(combos.length,2);assert.deepEqual(combos[1].members,['R.谢尔基','O.马尔穆什','E.哈兰德']);assert.deepEqual(combos[0].members,['N.冈萨雷斯','O.马尔穆什','B.席尔瓦']);
 const teams=await bridge.call('ocr',{path:path.join(root,'teams.png'),crop:{x:1305,y:460,width:220,height:183},scale:2});
 console.log('Teams recognized:',OCR.teams(teams));assert.ok(OCR.teams(teams).includes('大众狼堡队'));assert.ok(OCR.teams(teams).includes('米勒港闪电队'));
 for(const name of ['lineup','reserves','choices','teams']){const f=await bridge.call('ocr',{path:path.join(root,name+'.png'),scale:1.4});assert.equal(OCR.state(f),name);}
 console.log('Windows screenshot OCR passed: all six states, name, nationality, positions, 96 rating, two combinations and club names.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>bridge.close());
