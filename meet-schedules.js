(function(root){
 'use strict';
 // Official 57th Tokyo SC invitation order, published July 2026.
 // Only the first scheduled race (preliminary or timed final) is an entry.
 const tokyo={
  meetId:'9cfab7f6-d11d-4688-a651-dfee38168f26',
  source:'https://www.tokyo-sc.com/wp/wp-content/uploads/2026/07/26.57invitation_swim_order.pdf',
  days:[
   {day:1,date:'2026-10-30',events:[[1,100,'自由形'],[3,200,'背泳ぎ'],[5,100,'平泳ぎ'],[7,200,'バタフライ']]},
   {day:2,date:'2026-10-31',events:[[45,200,'個人メドレー'],[47,100,'背泳ぎ'],[71,1500,'自由形','タイム決勝']]},
   {day:3,date:'2026-11-01',events:[[73,50,'自由形'],[75,400,'自由形'],[77,50,'平泳ぎ']]},
   {day:4,date:'2026-11-02',events:[[111,200,'自由形'],[113,100,'バタフライ'],[115,200,'平泳ぎ'],[145,800,'自由形','タイム決勝']]},
   {day:5,date:'2026-11-03',events:[[147,50,'背泳ぎ'],[149,400,'個人メドレー'],[151,50,'バタフライ']]}
  ]
 };
 function forMeet(meet){return meet?.id===tokyo.meetId&&meet.meet_date===tokyo.days[0].date?tokyo:null}
 function findRace(schedule,entry,player){
  if(!schedule||!['女子','男子'].includes(player?.gender))return null;
  for(const day of schedule.days){
   const event=day.events.find(e=>e[1]===Number(entry.distance)&&e[2]===entry.stroke);
   if(event)return {day:day.day,date:day.date,number:event[0]+(player.gender==='男子'?1:0),round:event[3]||'予選'};
  }
  return null;
 }
 root.MeetSchedules={forMeet,findRace};
})(typeof window==='undefined'?globalThis:window);
