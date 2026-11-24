(function (root) {
  const labels = {
    prefect_grade: '山梨県 同学年', national_grade: '全国 同学年',
    prefect_school: '山梨県 学種別', national_school: '全国 学種別',
    japan: '日本ランキング', aqua: 'アクアポイント',
  };
  const strokes = ['自由形', '背泳ぎ', '平泳ぎ', 'バタフライ', '個人メドレー'];
  const distances = [50, 100, 200, 400, 800, 1500];
  const courses = ['長水路', '短水路'];
  const normalize = text => String(text || '').normalize('NFKC');
  const nameKey = text => normalize(text).replace(/\s/g, '');
  const athleteKey = text => nameKey(text).replace(/[\p{Cf}\uFE00-\uFE0F\u{E0100}-\u{E01EF}・]/gu, '');
  function matchesProfileName(text, athleteName) {
    const expected = athleteKey(athleteName);
    return Boolean(expected) && String(text || '').split(/\r?\n/).some(line => {
      const normalized = athleteKey(line);
      return (normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu) || [])
        .some(part => part === expected) || normalized === expected;
    });
  }
  const integer = text => Number(String(text).replace(/,/g, ''));

  const individualLabels = {
    prefect_school: /山梨(?:県)?(?:高校|中学|大学|小学)総合/,
    national_school: /(?:全国|日本)(?:高校|中学|大学|小学)総合/,
    japan: /(?:全国|日本)(?:総合|ランキング)|全体/,
    aqua: /アクア(?:ポイント|pt)|(?:World)?AquaticsPoints|AQUAPOINTS?/i,
  };
  const rankPattern = /^([\d,]+)位(?:\/([\d,]+)人?)?$/;
  const pointsPattern = /^([\d,]+)(?:pt\.?|点)$/i;

  function readValue(text, metric) {
    const match = nameKey(text).match(metric === 'aqua' ? pointsPattern : rankPattern);
    if (!match) return null;
    return { value: integer(match[1]), entrants: match[2] ? integer(match[2]) : '' };
  }

  function positionLines(words) {
    const rows = [];
    const ordered = words.filter(word => word.text && word.bbox).map(word => ({
      text: nameKey(word.text), x: word.bbox.x0,
      y: (word.bbox.y0 + word.bbox.y1) / 2,
      height: word.bbox.y1 - word.bbox.y0,
    })).sort((a, b) => a.y - b.y);
    for (const word of ordered) {
      const row = rows.find(candidate => Math.abs(candidate.y - word.y) <= Math.min(candidate.height, word.height) * 0.7);
      if (row) row.words.push(word);
      else rows.push({ y: word.y, height: word.height, words: [word] });
    }
    return rows.map(row => {
      let text = '';
      for (const word of row.words.sort((a, b) => a.x - b.x)) {
        word.offset = text.length;
        text += word.text;
      }
      return { ...row, text };
    });
  }

  function readIndividualPositions(words) {
    const rows = positionLines(words);
    const anchors = [];
    for (const row of rows) {
      for (const [metric, pattern] of Object.entries(individualLabels)) {
        const match = row.text.match(pattern);
        if (!match) continue;
        const start = row.words.find(word => word.offset + word.text.length > match.index);
        anchors.push({ metric, x: start.x, y: row.y, height: row.height });
      }
    }
    const output = {};
    for (const anchor of anchors) {
      const next = anchors.filter(other => other.x > anchor.x && Math.abs(other.y - anchor.y) < anchor.height * 4)
        .sort((a, b) => a.x - b.x)[0];
      const right = next ? next.x - anchor.height : Infinity;
      for (const row of rows) {
        if (row.y <= anchor.y || row.y - anchor.y > anchor.height * 8) continue;
        const wordsInColumn = row.words.filter(word => word.x >= anchor.x - anchor.height && word.x < right);
        const text = wordsInColumn.map(word => word.text).join('');
        const value = readValue(anchor.metric === 'aqua' ? text.replace(/^[^\d]+/, '') : text, anchor.metric);
        if (value) { output[anchor.metric] = value; break; }
      }
    }
    return output;
  }

  function parse(ocr, athleteName, format) {
    const lines = normalize(ocr.text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const result = { imageName: '', values: {} };
    const knownName = nameKey(athleteName);
    if (format === 'individual') {
      result.imageName = matchesProfileName(ocr.text, athleteName) || matchesProfileName(ocr.profileNameText, athleteName) ? athleteName : '';
      result.values = readIndividualPositions(ocr.words || []);
      for (const [key, pattern] of Object.entries(individualLabels)) {
        if (result.values[key]) continue;
        const candidates = lines.flatMap((line, i) => {
          const compact = nameKey(line);
          const label = compact.match(pattern);
          if (!label) return [];
          const tail = compact.slice(label.index + label[0].length);
          const value = readValue(tail || lines[i + 1], key);
          return value ? [value] : [];
        });
        if (candidates.length === 1) result.values[key] = candidates[0];
      }
      return result;
    }

    // Read the two rank columns only when the headers and a unique athlete row are visible.
    const positioned = positionLines(ocr.words || []).map(row => row.words.map(word => word.text).join(' '));
    for (const candidates of [lines, positioned]) {
      if (!candidates.some(line => /順位全体タイム/.test(nameKey(line)))) continue;
      const matches = candidates.map(line => line.match(/^([\d,]+)\s+([\d,]+)\s+((?:\d+:)?\d{1,2}\.\d{2})\s+(.+)$/))
        .filter(match => match && nameKey(match[4]).startsWith(knownName));
      if (matches.length !== 1) continue;
      const match = matches[0];
      result.imageName = athleteName;
      result.values.japan = { value: integer(match[2]), entrants: '' };
      result.listRank = integer(match[1]);
      break;
    }
    return result;
  }

  function observations(draft, player) {
    if (!draft.confirmed || nameKey(draft.imageName) !== nameKey(player.name)) {
      throw Error('画像の選手名と登録先を確認してください。');
    }
    const year = Number(draft.year);
    const distance = Number(draft.distance);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
        !strokes.includes(draft.stroke) || !distances.includes(distance) || !courses.includes(draft.course)) {
      throw Error('年度・種目・水路を確認してください。');
    }
    const date = new Date(draft.observedOn);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.observedOn) ||
        !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== draft.observedOn) {
      throw Error('順位の確認日を入力してください。');
    }
    const rows = [];
    for (const [metric, label] of Object.entries(labels)) {
      const item = draft.values[metric];
      if (!item || item.value === '') continue;
      const value = Number(item.value);
      const entrants = item.entrants === '' ? 0 : Number(item.entrants);
      if (!Number.isInteger(value) || value < (metric === 'aqua' ? 0 : 1) || value > 10000000 ||
          !Number.isInteger(entrants) || entrants < 0 || entrants > 10000000 ||
          (entrants && (entrants < value || metric === 'aqua'))) {
        throw Error(label + 'の数値を確認してください。');
      }
      const category = nameKey(metric.endsWith('_grade') ? draft.grade : metric.endsWith('_school') ? draft.school : '');
      if (category === '') {
        if (metric.endsWith('_grade') || metric.endsWith('_school')) throw Error(label + 'の学種・学年を確認してください。');
      }
      rows.push({
        swimmer_id: player.id, season: year, stroke: draft.stroke, distance, course: draft.course,
        metric, category, value, entrants, observed_on: draft.observedOn,
      });
    }
    if (!rows.length) throw Error('保存する順位またはポイントを入力してください。');
    return rows;
  }

  function latest(rows) {
    const seen = new Set();
    return rows.filter(row => {
      const key = JSON.stringify([row.season, row.stroke, row.distance, row.course, row.metric, row.category]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const api = { labels, strokes, distances, courses, parse, observations, latest, matchesProfileName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RankingImageImport = api;
})(globalThis);
