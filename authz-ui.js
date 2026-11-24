// Authorization UI. No credentials or local test fixtures.
function resetAuthorizationState(){
 window.VenueMode?.dismiss();
 JASF_ATHLETE_IDS={};JASF_PROFILE_TO_RANKING_CODES={};JASF_ATHLETE_IDENTITIES={};
 document.getElementById('coachApprovalManager')?.remove();
 document.getElementById('rankingImageDialog')?.close();
 shareAdmin=false;coachApproved=false;PLAYERS=[];records=[];manualLaps=[];sharedGoals=[];
 selectedPlayerId='';meetList=[];meetEntries=[];meetEventEntries=[];
 screenshotGeneration++;screenshotRows=[];screenshotReview=null;
 const celebration=document.getElementById('pbCelebration');if(celebration)celebration.hidden=true;
 document.getElementById('pbCelebrationContent')?.replaceChildren();
 videoImportRows=[];videoSavedRows=[];
 $$('#app section').forEach(el=>el.replaceChildren());
 document.querySelectorAll('[role="dialog"],#meSwimmerForm').forEach(el=>el.closest('div[style*="position:fixed"]')?.remove());
}
function requireSwimAdmin(){if(!session||!coachApproved||!shareAdmin){showAuthorizationNotice('この操作は管理者専用です。');return false}return true}
function showAuthorizationNotice(message){setStatus(String(message),'notice');}
function authorizationPrompt(message,value=''){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','入力の確認');dialog.style.cssText='border:0;border-radius:16px;max-width:500px;width:85%;padding:24px';
  const label=document.createElement('label');label.textContent=message;
  const input=document.createElement('input');input.id='authorizationPromptValue';input.value=value;label.append(input);
  const cancel=document.createElement('button');cancel.textContent='キャンセル';cancel.className='secondary';
  const save=document.createElement('button');save.textContent='保存';
  const done=v=>{dialog.close();dialog.remove();resolve(v)};
  cancel.onclick=()=>done(null);save.onclick=()=>done(input.value);dialog.oncancel=e=>{e.preventDefault();done(null)};
  dialog.append(label,cancel,save);document.body.append(dialog);dialog.showModal();input.focus();
 });
}
async function confirmAuthorizationChange(message){return (await authorizationPrompt(message+'（実行する場合は「実行」と入力）',''))==='実行';}
function applyAuthorizationUi(){
 const names=['removePlayer','delRecord','cleanupAllExactDuplicates','cleanupJasfDuplicates','cleanupAllJasfDuplicates','fetchJasfLatest','updateAllPlayersJasfLaps','importTestJasfLaps','saveShareSettings','openShareManager','editMeet','editMeetEntry','downloadSwimBackup','migrateLocalV3'];
 document.querySelectorAll('#app button[onclick]').forEach(el=>{
  if(names.some(n=>new RegExp('\\b'+n+'\\s*\\(').test(el.getAttribute('onclick'))))el.hidden=!shareAdmin;
 });
 document.querySelectorAll('[data-meet-action]').forEach(el=>el.hidden=!shareAdmin);
 if(!coachApproved)return;
 const home=document.getElementById('home');
 if(shareAdmin&&home?.children.length&&!document.getElementById('coachApprovalManagerButton')){
  const card=document.createElement('div');card.className='card';card.id='coachApprovalAdminCard';
  const heading=document.createElement('h3');heading.textContent='コーチの承認・停止';
  const text=document.createElement('p');text.textContent='コーチの承認状態を管理します。管理者の追加はできません。';
  const button=document.createElement('button');button.id='coachApprovalManagerButton';button.textContent='コーチの承認・停止を管理';button.onclick=openCoachApprovalManager;
  card.append(heading,text,button);home.append(card);
 }
}
async function openCoachApprovalManager(){
 if(!requireSwimAdmin())return;
 const epoch=authorizationEpoch;
 document.getElementById('coachApprovalManager')?.remove();
 const panel=document.createElement('dialog');panel.id='coachApprovalManager';panel.setAttribute('aria-label','コーチの承認・停止');panel.style.cssText='border:0;border-radius:16px;width:min(90%,650px);max-height:85vh;overflow:auto;padding:22px';
 const title=document.createElement('h2');title.textContent='コーチの承認・停止';
 const note=document.createElement('p');note.textContent='承認すると全選手の閲覧・登録・編集が可能になります。停止は次のデータアクセスから反映されます。取得済みの情報は回収できません。';
 const rows=document.createElement('div');rows.id='coachApprovalRows';
 const status=document.createElement('p');status.id='coachApprovalStatus';status.setAttribute('role','status');status.textContent='読み込み中…';
 const close=document.createElement('button');close.textContent='閉じる';close.className='secondary';close.onclick=()=>{panel.close();panel.remove()};
 const reload=document.createElement('button');reload.textContent='一覧を再読み込み';reload.className='secondary';reload.onclick=refresh;
 panel.append(title,note,rows,status,reload,close);document.body.append(panel);panel.showModal();
 const labels={approved:'承認済み',pending:'未承認',suspended:'停止中'};
 async function refresh(){
  rows.replaceChildren();status.textContent='読み込み中…';
  const {data,error}=await sb.rpc('list_coach_approvals');
  if(epoch!==authorizationEpoch||!panel.isConnected)return;
  if(error){status.textContent='取得できません：'+error.message;return;}
  for(const row of data){
   const box=document.createElement('div');box.className='result';
   const email=document.createElement('b');email.textContent=row.email;
   const current=document.createElement('p');current.textContent='現在の状態：'+labels[row.status];
   box.append(email,current);
   for(const [next,label] of [['approved','承認する'],['suspended','停止する'],['pending','未承認に戻す']]){
    if(next===row.status)continue;
    const button=document.createElement('button');button.textContent=label;button.style.margin='4px';button.className=next==='approved'?'':'secondary';
    button.onclick=async()=>{
     if(!requireSwimAdmin())return;
     if(!await confirmAuthorizationChange(row.email+' を「'+labels[next]+'」に変更します。'))return;
     if(epoch!==authorizationEpoch||!panel.isConnected)return;
     panel.querySelectorAll('button').forEach(b=>b.disabled=true);
     try{
      const response=await sb.rpc('set_coach_approval',{p_user_id:row.user_id,p_status:next,p_expected_status:row.status});
      if(epoch!==authorizationEpoch||!panel.isConnected)return;
      if(response.error){status.textContent='変更できません：'+response.error.message;return;}
      await refresh();status.textContent=labels[next]+'に変更しました。変更履歴を保存しました。';
     }finally{if(panel.isConnected)panel.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    box.append(button);
   }
   rows.append(box);
  }
  status.textContent=data.length+'人のコーチを表示しています。';
 }
 await refresh();
}
let authorizationUiQueued=false;
new MutationObserver(()=>{if(authorizationUiQueued)return;authorizationUiQueued=true;queueMicrotask(()=>{authorizationUiQueued=false;applyAuthorizationUi()})}).observe(document.getElementById('app'),{childList:true,subtree:true});
async function authorizedFetch(input,options){const epoch=authorizationEpoch;const response=await fetch(input,options);const url=new URL(input instanceof Request?input.url:String(input),location.href);if(epoch!==authorizationEpoch&&url.pathname.includes('/rest/v1/'))throw new Error('利用者が切り替わったため取得を中止しました');return response;}
