// Called only after validating the enabled, consented token and active swimmer.
// Never project participant lists, entry times, class labels, notes or private IDs.
const TOKYO_MEET_ID = '9cfab7f6-d11d-4688-a651-dfee38168f26';
const TOKYO_START = '2026-10-30';
const TOKYO_END = '2026-11-03';

export async function getPublicMeetSchedule(sb: any, swimmerId: string, today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10), gender = '') {
  const { data: participants, error: participantError } = await sb.from('swim_meet_swimmers')
    .select('meet_id').eq('swimmer_id', swimmerId);
  if (participantError) throw participantError;
  const ids = [...new Set((participants || []).map((p: any) => p.meet_id).filter(Boolean))];
  if (!ids.length) return [];

  // Include Tokyo SC while its five-day meet is in progress.
  const earliest = new Date(today + 'T00:00:00Z');
  earliest.setUTCDate(earliest.getUTCDate() - 4);
  const { data: meetRows, error: meetError } = await sb.from('swim_meets')
    .select('id,name,meet_date,venue').in('id', ids)
    .gte('meet_date', earliest.toISOString().slice(0, 10)).order('meet_date').limit(30);
  if (meetError) throw meetError;
  const meets = (meetRows || []).filter((m: any) => {
    const end = m.id === TOKYO_MEET_ID && m.meet_date === TOKYO_START ? TOKYO_END : m.meet_date;
    return end >= today;
  });
  if (!meets.length) return [];
  const rows: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data: page, error: entryError } = await sb.from('swim_meet_entries')
      .select('id,meet_id,stroke,distance,course').eq('swimmer_id', swimmerId)
      .in('meet_id', meets.map((m: any) => m.id)).order('id').range(from, from + 499);
    if (entryError) throw entryError;
    rows.push(...(page || []));
    if ((page || []).length < 500) break;
  }
  const programs: any[] = [], timetable: any[] = [];
  const entryIds = rows.map((r: any) => r.id).filter(Boolean);
  // Never query other swimmers' program assignments, even with service credentials.
  for (let start = 0; start < entryIds.length; start += 100) {
    for (let from = 0; ; from += 500) {
      const {data, error} = await sb.from('swim_meet_programs')
        .select('entry_id,race_date,round,program_number,heat,lane')
        .in('entry_id', entryIds.slice(start, start + 100)).order('id').range(from, from + 499);
      if (error) throw error;
      programs.push(...(data || [])); if ((data || []).length < 500) break;
    }
  }
  for (let from = 0; ; from += 500) {
    const {data, error} = await sb.from('swim_meet_timetable')
      .select('meet_id,race_date,course,program_number,gender,stroke,distance,round,scheduled_time')
      .in('meet_id', meets.map((m: any) => m.id)).order('id').range(from, from + 499);
    if (error) throw error;
    timetable.push(...(data || [])); if ((data || []).length < 500) break;
  }
  const publicTime = (t: any) => ({race_date:t.race_date,round:t.round,program_number:t.program_number,
    scheduled_time:String(t.scheduled_time).slice(0,5),time_estimated:!!t.time_estimated});
  const eventTimes = (entry: any) => {
    const matching = timetable.filter((t: any) => t.meet_id===entry.meet_id && t.course===entry.course &&
      t.stroke===entry.stroke && Number(t.distance)===Number(entry.distance));
    const direct = matching.filter((t: any) => t.gender===gender);
    const inferred: any[] = [];
    if (gender==='男子') for (const female of matching.filter((t: any) => t.gender==='女子')) {
      if (direct.some((t: any) => t.race_date===female.race_date && t.round===female.round)) continue;
      const candidates=matching.filter((t: any) => t.gender==='女子' && t.race_date===female.race_date && t.round===female.round);
      const match=String(female.scheduled_time).match(/^(\d{2}):(\d{2})(?::00)?$/);
      if(candidates.length!==1 || !match || Number(match[1])>23 || Number(match[2])>59)continue;
      const minutes=Number(match[1])*60+Number(match[2])+2;if(minutes>=1440)continue;
      inferred.push({...female,program_number:null,time_estimated:true,
        scheduled_time:String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')});
    }
    return [...direct,...inferred].map(publicTime);
  };
  const events: any[] = [];
  const seen = new Set<string>();
  for (const row of rows || []) {
    const distance = Number(row.distance);
    if (!['自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー'].includes(row.stroke) ||
        ![50,100,200,400,800,1500].includes(distance) || !['長水路','短水路'].includes(row.course)) continue;
    const key = [row.meet_id,row.stroke,distance,row.course].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const times=eventTimes(row);
    const starts=programs.filter((p: any) => p.entry_id===row.id).map((p: any) => {
      const time=times.find((t: any) => t.race_date===p.race_date && t.round===p.round &&
        (t.time_estimated || Number(t.program_number)===Number(p.program_number)));
      return {race_date:p.race_date,round:p.round,program_number:p.program_number,heat:p.heat,lane:p.lane,
        ...(time?{scheduled_time:time.scheduled_time,time_estimated:time.time_estimated}:{})};
    });
    events.push({meet_id:row.meet_id,stroke:row.stroke,distance,course:row.course,
      ...(starts.length?{programs:starts}:{}),...(times.length?{timetable:times}:{})});
  }
  return meets.map((m: any) => ({
    id:m.id,name:m.name,meet_date:m.meet_date,venue:m.venue,
    ...(m.id === TOKYO_MEET_ID && m.meet_date === TOKYO_START ? {end_date:TOKYO_END} : {}),
    events:events.filter((e: any) => e.meet_id === m.id).map((e: any) => ({stroke:e.stroke,distance:e.distance,course:e.course,...(e.programs?{programs:e.programs}:{}),...(e.timetable?{timetable:e.timetable}:{})})),
  }));
}
