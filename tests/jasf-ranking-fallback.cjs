// Run with node tests/jasf-ranking-fallback.cjs. No network or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('function jasfEventCodes('), html.indexOf('function escapeRankingError('));
const ageSource = html.slice(html.indexOf('function ageOnDate('), html.indexOf('function joMeetInfo('));
const context = vm.createContext({console, setTimeout, clearTimeout});
vm.runInContext(ageSource + source, context);
const player = {name:'テスト 選手', birth_date:'2012-10-10', gender:'女子'};
// Synthetic API-shaped rows: profile IDs intentionally differ from ranking codes.
const ids = ['11111111', '22222222'];
const row = {ranking:123, record:{record:'1:02.20'}, swimmers:{
  swimmer_code:'3333333', swimmer_name:'テスト　選手',
  school_class:{code:2, name:'中学'}, school_grade:2
}};
const encoded = value => JSON.stringify(value);
async function lookup(responses, subject = player) {
  context.responses = responses;
  context.calls = [];
  vm.runInContext(`jasfAthleteIds=()=>${encoded(ids)};
    safeFetchJasfRankingPage=async (...args)=>{
      calls.push(args); if(!responses.length)throw Error('Unexpected request');
      return responses.shift();
    };`, context);
  return await vm.runInContext(`fetchJasfRankingForPlayer(${encoded(subject)},'自由形',100,'長水路',2026)`, context);
}
(async()=>{
  let result = await lookup([[], [row], [row]]);
  assert.equal(result.status, 'found', 'fallback must use the same identity rules as initial lookup');
  assert.equal(result.gradeRank, 123);
  assert.equal(context.calls.length, 3);
  assert.equal(context.calls[0][6], 2);
  assert.equal(context.calls[1][5], '99');
  assert.equal(context.calls[2][6], 2);
  result = await lookup([[row]]);
  assert.equal(result.status, 'found', 'initial name fallback still works');
  result = await lookup([[row]], {...player, birth_date:null});
  assert.equal(result.status, 'not_listed', 'without birth date, broad name-only matching stays disabled');
  const ambiguous = {...row, swimmers:{...row.swimmers, swimmer_code:'4444444'}};
  result = await lookup([[], [row, ambiguous]]);
  assert.equal(result.status, 'not_listed', 'ambiguous names must stay unconfirmed');
  const otherGrade = {...row, swimmers:{...row.swimmers, school_grade:3}};
  result = await lookup([[], [otherGrade]]);
  assert.equal(result.status, 'not_listed', 'another grade must not be adopted');
  result = await lookup([[], []]);
  assert.equal(result.status, 'not_listed', 'absence is not a successful ranking');
  const byId = {...row, swimmers:{...row.swimmers, swimmer_code:ids[1]}};
  result = await lookup([[row, byId]]);
  assert.equal(result.gradeMatched[0].swimmers.swimmer_code, ids[1], 'all registered IDs retain priority');
  // Check syntax of every inline script, without executing app startup.
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
  console.log('PASS: 7 ranking scenarios and all inline script syntax checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
