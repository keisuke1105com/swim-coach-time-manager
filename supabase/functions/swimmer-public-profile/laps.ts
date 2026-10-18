// Pure projection: never overwrite or delete stored official/manual data.
export function mergePublicLaps(record: any, manual: any[]) {
  const seconds = (value: any) => {
    if (value === null || value === undefined || value === '') return NaN;
    return String(value).split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  };
  const format = (value: number) => `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, '0')}`;
  let official = record.laps;
  if (typeof official === 'string') {
    try { official = JSON.parse(official); } catch { official = []; }
  }
  const points = new Map<number, {time: number; source: string}>();
  const finish = Number(record.distance), total = Number(record.time_seconds);
  const add = (distance: any, time: number, source: string) => {
    const d = Number(distance);
    if (Number.isInteger(d) && d > 0 && d <= finish && Number.isFinite(time) && time > 0 && time <= total) {
      points.set(d, { time, source });
    }
  };
  for (const lap of manual) add(lap.distance, Number(lap.cumulative_seconds), 'manual');
  let priorOfficial = 0;
  for (const lap of (Array.isArray(official) ? [...official] : []).sort((a, b) => Number(a.distance) - Number(b.distance))) {
    let time = seconds(lap.cumulative_time);
    if (!Number.isFinite(time)) time = priorOfficial + seconds(lap.split_time);
    add(lap.distance, time, 'official');
    if (Number.isFinite(time)) priorOfficial = time;
  }
  if (points.size && !points.has(finish)) add(finish, total, 'finish');
  // Discard inconsistent manual points between authoritative official boundaries.
  const anchors = [...points].filter(([, p]) => p.source !== 'manual').sort((a,b) => a[0]-b[0]);
  const result: any[] = [];
  let previous = 0;
  for (const [distance, point] of [...points].sort((a, b) => a[0] - b[0])) {
    const next = anchors.find(([d]) => d > distance);
    if (point.time <= previous || (point.source === 'manual' && next && point.time >= next[1].time)) continue;
    result.push({distance, cumulative_time: format(point.time), split_time: format(point.time - previous), lap_source: point.source});
    previous = point.time;
  }
  return result;
}
