// Browser checks run only against synthetic data and mocked persistence.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
const functions=html.slice(html.indexOf('function shotEscape('),html.indexOf('const analysisUiState='));
const parser=html.slice(html.indexOf('function parseShotRows('),html.indexOf('function shotEvaluation('));
const event=html.slice(html.indexOf('function detectShotEvent('),html.indexOf('function parseShotRows('));
const card=html.slice(html.indexOf('function screenshotAnalysisCard()'),html.indexOf('\n',html.indexOf('function screenshotAnalysisCard()')));
const ocr=html.slice(html.indexOf('async function ensureTesseract('),html.indexOf('function normalizeOcrText('));
const setup=`
const $=s=>document.querySelector(s);let PLAYERS=[{id:'synthetic',name:'テスト 選手'}],records=[];
let screenshotRows=[],screenshotEvent={},screenshotOcrReady=false;
const writes=[],alerts=[];let failRead=false,failInsert=false,failAt=0,readCount=0;
window.alert=x=>alerts.push(String(x));
function normalizeOcrText(t){return String(t||'').replace(/\\s+/g,' ').trim()}
const playerById=id=>PLAYERS.find(p=>p.id===id);
const recordExactKey=r=>[r.swimmer_id,r.record_date,r.stroke,r.distance,r.course,Number(r.time_seconds).toFixed(3)].join('|');
async function loadCloud(options){readCount++;if(failRead)throw Error('synthetic read failure');}
const joMeetInfo=()=>null,standard=()=>null;
async function recalcPersonalBests(){writes.push({type:'best'});}
function renderHome(){}function renderPlayers(){}function renderAnalysis(){}
const sb={from:table=>({insert:payload=>({select:()=>({single:async()=>{if(failInsert||(++failAt===2&&window.failSecond))return {error:Error('synthetic insert failure')};writes.push({type:'insert',table,payload});return {data:{...payload,id:'inserted-'+writes.length}}}})})})};
window.Tesseract={recognize:async()=>({data:{text:'100m自由形 タイム決勝\\nテスト 選手\\nクラブ（一般）\\n1:02.34\\n[1:01.00]\\n● 50m 30.12 30.12 RT:0.57\\n● 100m 1:02.34 32.22'}})};
`;
async function run(type,name,options){
 const browser=await type.launch(options);
 try{
  for(const width of [390,1280]){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
   await page.route('**/*',route=>route.abort());page.on('pageerror',e=>errors.push(e.message));
   await page.setContent('<!doctype html><html lang="ja"><meta name="viewport" content="width=device-width, initial-scale=1"><body><main id="test"></main></body></html>');
   await page.addStyleTag({content:html.match(/<style>([\s\S]*?)<\/style>/)[1]});
   await page.addScriptTag({content:fs.readFileSync('screenshot-import.js','utf8')});
   await page.addScriptTag({content:setup+event+parser+ocr+functions+card+`;document.querySelector('#test').innerHTML=screenshotAnalysisCard();document.querySelector('details').open=true;`});
   const file={name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')};
   await page.locator('#screenshotFile').setInputFiles(file);
   await page.getByRole('button',{name:'🔎 スクリーンショットを解析',exact:true}).click();
   await page.waitForFunction(()=>screenshotRows.length===1);
   assert.equal(await page.evaluate(()=>writes.length),0);
   assert.equal(await page.getByLabel('今回のタイム',{exact:true}).inputValue(),'1:02.34');
   assert.equal(await page.getByLabel('水路',{exact:true}).inputValue(),'');
   await page.getByLabel('大会名',{exact:true}).fill('検証用大会');
   await page.getByLabel('競技日',{exact:true}).fill('2026-11-15');
   await page.getByLabel('水路',{exact:true}).selectOption('長水路');
   await page.getByLabel('この記録を保存対象にする',{exact:true}).check();
   await page.getByLabel('画像と選手・種目・距離・水路・今回のタイム・ラップを照合しました',{exact:true}).check();
   await page.getByRole('button',{name:'保存内容を確認する',exact:true}).click();
   assert.equal(await page.locator('#shotFinalReview').count(),1,'final review is reachable by real input events');
   assert.equal(await page.evaluate(()=>writes.length),0,'preview writes nothing');
   await page.locator('#shotFinalReview').getByRole('button',{name:'修正に戻る',exact:true}).click();
   assert.equal(await page.locator('#shotFinalReview').count(),0);
   await page.getByRole('button',{name:'保存内容を確認する',exact:true}).click();
   await page.locator('#shotFinalReview').getByRole('button',{name:'キャンセル',exact:true}).click();
   assert.equal(await page.evaluate(()=>writes.length),0,'cancel writes nothing');
   // Populate another draft through the parser, then verify persistence is gated.
   await page.evaluate(()=>{screenshotRows=parseShotRows('100m自由形\nテスト 選手 1:02.34\n50m 30.12\n100m 1:02.34');screenshotMeta={date:'2026-11-15',meet:'検証用大会'};Object.assign(screenshotRows[0],{course:'長水路',save:true,verified:true});renderScreenshotRows();});
   await page.getByRole('button',{name:'保存内容を確認する',exact:true}).click();
   await page.locator('#shotFinalReview').getByRole('button',{name:'確認して保存',exact:true}).click();
   await page.waitForFunction(()=>!screenshotSaving);
   const saved=await page.evaluate(()=>writes.filter(w=>w.type==='insert'));
   assert.equal(saved.length,1);assert.equal(saved[0].payload.record_date,'2026-11-15');assert.equal(saved[0].payload.laps.length,2);assert.equal(saved[0].payload.laps[1].split_time,'32.22');
   // A read failure must never be mistaken for an empty database.
   await page.evaluate(()=>{screenshotRows=[{playerId:'synthetic',name:'テスト 選手',stroke:'自由形',distance:50,course:'長水路',time:'27.50',lapText:'',save:true,verified:true}];screenshotMeta={date:'2026-11-15',meet:'検証用大会'};failRead=true;renderScreenshotRows();});
   await page.getByRole('button',{name:'保存内容を確認する',exact:true}).click();
   await page.locator('#shotFinalReview').getByRole('button',{name:'確認して保存',exact:true}).click();await page.waitForFunction(()=>!screenshotSaving);
   assert.equal(await page.evaluate(()=>writes.filter(w=>w.type==='insert').length),1,'read failure prevents insertion');
   assert.deepEqual(errors,[]);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
   await page.screenshot({path:'/tmp/screenshot-import-'+name+'-'+width+'.png',fullPage:true});
   await context.close();console.log('PASS:',name,width,'OCR draft → review → cancel/edit → explicit save, no writes on read failure');
  }
 }finally{await browser.close();}
}
(async()=>{await run(chromium,'chromium',{executablePath:process.env.CHROMIUM_EXECUTABLE==='bundled'?undefined:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});if(process.env.TEST_WEBKIT==='1')await run(webkit,'webkit',{headless:true});})().catch(e=>{console.error(e);process.exitCode=1});
