const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// 実際のバックアップ実装だけを実行する。ネットワーク・認証・initは実行しない。
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('const SWIM_BACKUP_FORMAT_VERSION='),html.indexOf('function renderHome()'));
const fixture=()=>({
  swimmers:[{id:'s2',name:'架空選手B',active:false},{id:'s1',name:'架空選手A',active:true}],
  swim_records:[{id:'r1',swimmer_id:'s1',time_seconds:30,laps:[{distance:25,cumulative_time:'15.00'}]}],
  swim_manual_laps:[{id:'l1',record_id:'r1',distance:10,cumulative_seconds:6}]
});
function harness({data=fixture(),modify=()=>{},cap=1000,answers=[true,true],admin=true,authenticated=true}={}){
  const calls=[],alerts=[],confirms=[],downloads=[],blobs=[];
  const button={disabled:false,textContent:'📥 バックアップを保存'};
  let counts=0;
  const context=vm.createContext({
    APP_BUILD_VERSION:'test-app-v1',session:authenticated?{}:null,shareAdmin:admin,
    sb:{from(table){
      const query={select(_fields,options){this.options=options;return this;},
        order(field,options){assert.equal(field,'id');assert.equal(options.ascending,true);this.ordered=true;return this;},
        range(from,to){this.from=from;this.to=to;return this;},
        then(resolve,reject){
          try{
            assert.equal(this.options.count,'exact');
            const head=!!this.options.head;
            if(!head)assert.equal(this.ordered,true);
            const sorted=[...data[table]].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
            const result={count:sorted.length,error:null,data:head?null:sorted.slice(this.from,Math.min(this.to+1,this.from+cap))};
            const call={table,head,from:this.from,to:this.to,countCall:head?++counts:null};
            calls.push(call);modify(result,call);resolve(result);
          }catch(e){reject(e);}
        }
      };return query;
    }},
    confirm(message){confirms.push(message);return answers.shift()??false;},
    alert(message){alerts.push(message);},
    document:{getElementById(){return button;},body:{appendChild(){}},createElement(){return {click(){downloads.push(this.download);},remove(){}};}},
    Blob:class{constructor(parts){blobs.push(parts.join(''));}},
    URL:{createObjectURL(){return 'blob:fake';},revokeObjectURL(){}},setTimeout(){},
  });
  vm.runInContext(source,context);
  return {context,calls,alerts,confirms,downloads,blobs,button};
}

test('固定ID順・小さいサーバー上限でも全件取得し、形式v2のメタデータを保存',async()=>{
  const data=fixture();
  data.swimmers=Array.from({length:1005},(_,i)=>({id:`s${String(1004-i).padStart(4,'0')}`,active:i%2===0}));
  data.swim_records[0].swimmer_id='s0000';
  const h=harness({data,cap:37});
  await h.context.downloadSwimBackup();
  assert.equal(h.downloads.length,1);
  const backup=JSON.parse(h.blobs[0]);
  assert.equal(backup.format,'swim-time-manager-backup');
  assert.equal(backup.format_version,2);
  assert.equal(backup.app_version,'test-app-v1');
  assert.equal(backup.counts.swimmers,1005);
  assert.equal(backup.data.swimmers[0].id,'s0000');
  assert.equal(backup.data.swimmers.at(-1).id,'s1004');
  assert.equal(backup.validation.status,'passed');
  assert.equal(backup.validation.consistent_snapshot,false);
  assert.equal(backup.validation.scope,'current_user_readable_rows');
  assert.deepEqual(backup.validation.source_counts_before,backup.counts);
  assert.deepEqual(backup.validation.source_counts_after,backup.counts);
  assert.ok(Object.values(backup.validation.checks).every(v=>v===true));
  for(const field of ['acquisition_started_at','acquisition_finished_at','exported_at'])assert.ok(Number.isFinite(Date.parse(backup[field])));
  assert.match(h.confirms[1],/1005名/);
  assert.match(h.confirms[1],/関連付け検証：正常/);
  assert.equal(h.button.disabled,false);
});

test('空の表も正確な0件として確認する',async()=>{
  const h=harness({data:{swimmers:[],swim_records:[],swim_manual_laps:[]}});
  const backup=await h.context.prepareSwimBackup();
  assert.equal(backup.counts.swimmers,0);
  assert.equal(backup.validation.status,'passed');
  assert.equal(h.calls.filter(c=>!c.head).length,3);
});

const failures=[
  ['件数取得エラー',(r,c)=>{if(c.head)r.error={message:'fake'};}],
  ['正確な件数が未提供',(r,c)=>{if(c.head)r.count=null;}],
  ['ページ取得エラー',(r,c)=>{if(!c.head)r.error={message:'fake'};}],
  ['途中の空ページによる欠落',(r,c)=>{if(!c.head)r.data=[];}],
  ['ページ応答が不正',(r,c)=>{if(!c.head)r.data=null;}],
  ['ページの件数変更',(r,c)=>{if(!c.head)r.count++;}],
  ['取得後に件数変更',(r,c)=>{if(c.countCall===4)r.count++;}],
  ['予定件数以上の応答',(r,c)=>{if(!c.head&&c.table==='swimmers')r.data.push({id:'s3'});}]
];
for(const [name,modify] of failures)test(`${name}ではダウンロードしない`,async()=>{
  const h=harness({modify});
  await h.context.downloadSwimBackup();
  assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);
  assert.match(h.alerts[0],/失敗/);assert.equal(h.confirms.length,1);
  assert.equal(h.button.disabled,false);
});

for(const [name,mutate] of [
  ['ID重複',d=>d.swimmers[1].id=d.swimmers[0].id],
  ['ID欠落',d=>delete d.swim_records[0].id],
  ['対応選手がない',d=>d.swim_records[0].swimmer_id='missing'],
  ['対応記録がない',d=>d.swim_manual_laps[0].record_id='missing']
])test(`${name}では保存を停止する`,async()=>{
  const data=fixture();mutate(data);const h=harness({data});
  await h.context.downloadSwimBackup();
  assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);
  assert.match(h.alerts[0],/失敗/);
});

test('検証後の確認でキャンセルしたら保存せず、再実行できる',async()=>{
  const answers=[true,false,true,true],h=harness({answers});
  await h.context.downloadSwimBackup();
  assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);
  assert.equal(h.button.disabled,false);
  await h.context.downloadSwimBackup();assert.equal(h.downloads.length,1);
});
test('管理者以外は問い合わせも保存も行わない',async()=>{
  const h=harness({admin:false});await h.context.downloadSwimBackup();
  assert.equal(h.calls.length,0);assert.equal(h.downloads.length,0);
});
test('二重クリックでも取得と保存は1回',async()=>{
  const h=harness();
  await Promise.all([h.context.downloadSwimBackup(),h.context.downloadSwimBackup()]);
  assert.equal(h.downloads.length,1);assert.equal(h.confirms.length,2);
});
test('途中失敗後もボタンを戻し、次の正常なバックアップを保存できる',async()=>{
  let fail=true;
  const h=harness({answers:[true,true,true],modify(r,c){if(fail&&!c.head)r.error={message:'fake'};}});
  await h.context.downloadSwimBackup();assert.equal(h.downloads.length,0);
  fail=false;await h.context.downloadSwimBackup();assert.equal(h.downloads.length,1);
});

test('アプリ内の全インラインスクリプトの構文が有効',()=>{
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});

function largeFixture(size){
  const id=(prefix,i)=>`${prefix}${String(i).padStart(6,'0')}`;
  return {
    swimmers:Array.from({length:size},(_,i)=>({id:id('s',i),name:`架空選手${i}`,active:i%2===0})).reverse(),
    swim_records:Array.from({length:size},(_,i)=>({id:id('r',i),swimmer_id:id('s',i),record_date:'2026-10-11',time_seconds:30+i/100,meet_name:'架空大会',memo:'確認用',laps:[{distance:25,cumulative_time:'15.00'}]})).reverse(),
    swim_manual_laps:Array.from({length:size},(_,i)=>({id:id('l',i),record_id:id('r',i),distance:10,cumulative_seconds:6})).reverse()
  };
}
for(const size of [999,1000,1001,2000,2501])test(`3テーブル各${size}件：ページ境界の全ID・全項目と保存JSONが一致`,async()=>{
  const data=largeFixture(size),h=harness({data});
  await h.context.downloadSwimBackup();
  assert.equal(h.downloads.length,1);
  const backup=JSON.parse(h.blobs[0]);
  for(const table of Object.keys(data)){
    const expected=[...data[table]].sort((a,b)=>a.id.localeCompare(b.id));
    assert.deepEqual(backup.data[table],expected);
    assert.equal(new Set(backup.data[table].map(r=>r.id)).size,size);
    assert.equal(backup.counts[table],size);
    assert.deepEqual(h.calls.filter(c=>c.table===table&&!c.head).map(c=>c.from),Array.from({length:Math.ceil(size/1000)},(_,i)=>i*1000));
  }
  assert.ok(backup.acquisition_started_at<=backup.acquisition_finished_at);
  assert.ok(backup.acquisition_finished_at<=backup.exported_at);
});
for(const table of ['swimmers','swim_records','swim_manual_laps'])test(`${table}：別ページの同一IDを検出し保存しない`,async()=>{
  const data=largeFixture(2);data[table][1].id=data[table][0].id;
  const h=harness({data,cap:1});await h.context.downloadSwimBackup();
  assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);
  assert.match(h.alerts[0],/IDが重複/);
  assert.ok(h.calls.filter(c=>c.table===table&&!c.head).length>=2);
});
test('ページ境界の重複応答は総件数が一致しても検出する',async()=>{
  const data=largeFixture(1001);
  const h=harness({data,modify(r,c){if(!c.head&&c.table==='swimmers'&&c.from===1000)r.data=[{...data.swimmers[1]}];}});
  await h.context.downloadSwimBackup();assert.equal(h.downloads.length,0);
  assert.match(h.alerts[0],/IDが重複/);
});
test('第2ページの欠落を検出し保存しない',async()=>{
  const h=harness({data:largeFixture(1001),modify(r,c){if(!c.head&&c.table==='swim_records'&&c.from===1000)r.data=[];}});
  await h.context.downloadSwimBackup();assert.equal(h.downloads.length,0);
  assert.match(h.alerts[0],/すべてのデータを取得できません/);
});
test('未ログインでは管理者フラグがtrueでも取得しない',async()=>{
  const h=harness({authenticated:false});await h.context.downloadSwimBackup();
  assert.equal(h.calls.length,0);assert.equal(h.downloads.length,0);
});
test('開始確認をキャンセルしたら取得しない',async()=>{
  const h=harness({answers:[false]});await h.context.downloadSwimBackup();
  assert.equal(h.calls.length,0);assert.equal(h.downloads.length,0);
});
test('変更前に対しバックアップ以外のアプリコードが完全一致',()=>{
  const {execFileSync}=require('node:child_process');
  const original=execFileSync('git',['show','f5f397f^:index.html'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
  const omitBackup=s=>{
    const start=s.indexOf('// 管理者向け手動バックアップ（復元は未実装）');
    const end=s.indexOf('function renderHome()',start);
    assert.ok(start>=0&&end>start);
    return s.slice(0,start)+s.slice(end);
  };
  assert.equal(omitBackup(html),omitBackup(original));
});
