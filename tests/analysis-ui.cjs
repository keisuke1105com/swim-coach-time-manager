const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const helper=s.slice(s.indexOf('const analysisUiState='),s.indexOf('function screenshotAnalysisCard()'));
const element=(extra={})=>({style:{},dataset:{},value:'',open:false,...extra});
const group=element({dataset:{playerId:'sample'}}),event=element({dataset:{analysisEvent:'sample-event'}});
const nodes={lapPlayerSelect:element(),qualifierMeetSelect:element(),qualifierTokyo:element(),qualifierYume:element(),qualifierYamanashi:element(),'analysis-screenshot':element({id:'analysis-screenshot'}),target:element({tagName:'DETAILS',scrollIntoView(){this.scrolled=true}})};
let listener;const root=element({querySelectorAll:()=>[event],contains:()=>true,addEventListener:(type,fn)=>{listener=fn}});
const context={document:{querySelectorAll:()=>[group],getElementById:id=>nodes[id]},$:selector=>selector==='#analysis'?root:nodes[selector.slice(1)]};
vm.createContext(context);vm.runInContext(helper,context);
context.selectAnalysisPlayer('sample');assert.equal(group.open,true);assert.equal(group.style.display,'');
context.restoreAnalysisUi();event.open=true;listener({target:event});nodes['analysis-screenshot'].open=true;listener({target:nodes['analysis-screenshot']});
context.analysisJump('target','yamanashi');assert.equal(nodes.target.scrolled,true);assert.equal(nodes.target.open,true);assert.equal(nodes.qualifierYamanashi.style.display,'block');assert.equal(nodes.qualifierTokyo.style.display,'none');
// Simulate DOM replacement while the same page session remains alive.
const replacement=element({dataset:{analysisEvent:'sample-event'}});root.querySelectorAll=()=>[replacement];nodes.lapPlayerSelect.value='';nodes['analysis-screenshot'].open=false;
context.restoreAnalysisUi();assert.equal(nodes.lapPlayerSelect.value,'sample');assert.equal(replacement.open,true);assert.equal(nodes['analysis-screenshot'].open,true);assert.equal(nodes.qualifierMeetSelect.value,'yamanashi');
replacement.open=false;listener({target:replacement});context.restoreAnalysisUi();assert.equal(replacement.open,false,'closing an event is remembered too');
assert.ok(s.includes('id="analysis-jo-ranking"')&&s.includes('id="analysis-pref-ranking"')&&s.includes('id="analysis-personal"'));
console.log('PASS: player/event/screenshot state across DOM replacement, hidden qualifier activation, record-list opening, anchor targets');
