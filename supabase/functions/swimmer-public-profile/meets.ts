// Called only after validating the enabled, consented token and active swimmer.
// Never project participant lists, entry times, class labels, notes or private IDs.
const TOKYO_MEET_ID = '9cfab7f6-d11d-4688-a651-dfee38168f26';
const TOKYO_START = '2026-10-30';
const TOKYO_END = '2026-11-03';

export async function getPublicMeetSchedule(sb: any, swimmerId: string, today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)) {
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
      .select('meet_id,stroke,distance,course').eq('swimmer_id', swimmerId)
      .in('meet_id', meets.map((m: any) => m.id)).order('id').range(from, from + 499);
    if (entryError) throw entryError;
    rows.push(...(page || []));
    if ((page || []).length < 500) break;
  }
  const events: any[] = [];
  const seen = new Set<string>();
  for (const row of rows || []) {
    const distance = Number(row.distance);
    if (!['自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー'].includes(row.stroke) ||
        ![50,100,200,400,800,1500].includes(distance) || !['長水路','短水路'].includes(row.course)) continue;
    const key = [row.meet_id,row.stroke,distance,row.course].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({meet_id:row.meet_id,stroke:row.stroke,distance,course:row.course});
  }
  return meets.map((m: any) => ({
    id:m.id,name:m.name,meet_date:m.meet_date,venue:m.venue,
    ...(m.id === TOKYO_MEET_ID && m.meet_date === TOKYO_START ? {end_date:TOKYO_END} : {}),
    events:events.filter((e: any) => e.meet_id === m.id).map((e: any) => ({stroke:e.stroke,distance:e.distance,course:e.course})),
  }));
}
