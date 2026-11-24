function openRankingImageImport(playerId, stroke = '', distance = '', course = '') {
  const player = playerById(playerId);
  if (!session || !coachApproved || !player) return;
  const epoch = authorizationEpoch;
  const api = RankingImageImport;
  const dialog = document.createElement('dialog');
  dialog.id = 'rankingImageDialog';
  dialog.setAttribute('aria-label', 'ランキング画像取込・履歴');
  dialog.style.cssText = 'width:min(90vw,640px);max-height:85vh;overflow:auto;border:0;border-radius:16px;padding:20px';
  const form = document.createElement('form');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const history = document.createElement('section');
  const isActive = () => dialog.isConnected && epoch === authorizationEpoch && session && coachApproved;
  function element(tag, text, parent = form) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    parent.append(node);
    return node;
  }
  function field(label, type, choices, value) {
    const wrapper = element('label', label);
    wrapper.style.display = 'block';
    const input = element(choices ? 'select' : 'input', '', wrapper);
    if (choices) {
      for (const [key, title] of Object.entries(choices)) {
        const option = element('option', title, input);
        option.value = key;
      }
    } else input.type = type;
    input.value = value ?? '';
    return input;
  }
  const choices = values => Object.fromEntries(values.map(value => [value, value]));
  const eventChoices = values => ({ '': '選択してください', ...choices(values) });
  element('h3', player.name + 'のランキング画像取込');
  const format = field('画像形式', '', { individual: '個人種目別成績', list: 'ランキング一覧' }, 'individual');
  const listScope = field('一覧の絞り込み区分', '', {
    '': '選択してください', prefect_grade: api.labels.prefect_grade, national_grade: api.labels.national_grade,
    prefect_school: api.labels.prefect_school, national_school: api.labels.national_school, japan: api.labels.japan,
  });
  listScope.parentElement.hidden = true;
  const file = field('画像', 'file');
  file.accept = 'image/*';
  const read = element('button', '画像を読み取る');
  read.type = 'button';
  const preview = element('img', '');
  preview.alt = '確認用のランキング画像';
  preview.style.cssText = 'max-width:100%;max-height:260px;object-fit:contain';
  preview.hidden = true;
  const rawDetails = element('details', '');
  element('summary', '読み取りテキスト', rawDetails);
  const raw = element('pre', '', rawDetails);
  raw.style.whiteSpace = 'pre-wrap';
  const imageName = field('画像の選手名', 'text');
  const year = field('年度', 'number');
  const event = field('泳法', '', eventChoices(api.strokes), stroke);
  const length = field('距離 (m)', '', eventChoices(api.distances), distance);
  const pool = field('水路', '', eventChoices(api.courses), course);
  const school = field('学種（例 高校）', 'text');
  const grade = field('学年（例 高校2年）', 'text');
  school.maxLength = grade.maxLength = 24;
  const observedOn = field('順位の確認日', 'date');
  const fields = Object.fromEntries(Object.entries(api.labels).map(([key, label]) => [
    key, { value: field(label, 'number'), entrants: key === 'aqua' ? null : field(label + 'の対象人数', 'number') },
  ]));
  const confirmed = field('画像と登録先・種目・区分・数値を照合しました', 'checkbox');
  const save = element('button', '確認した項目を保存');
  const close = element('button', '閉じる');
  close.type = 'button';
  close.className = 'secondary';
  close.onclick = () => dialog.close();
  dialog.append(form, status, history);
  document.body.append(dialog);
  let previewUrl = '';
  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    preview.removeAttribute('src');
    preview.hidden = true;
    raw.textContent = '';
  }
  dialog.addEventListener('close', () => { clearPreview(); dialog.remove(); });
  form.addEventListener('input', e => { if (e.target !== confirmed) confirmed.checked = false; });
  function clearDraft() {
    clearPreview();
    imageName.value = '';
    for (const inputs of Object.values(fields)) {
      inputs.value.value = '';
      if (inputs.entrants) inputs.entrants.value = '';
    }
  }
  function resetImage() {
    clearDraft();
    year.value = '';
    school.value = '';
    grade.value = '';
    observedOn.value = '';
    event.value = stroke;
    length.value = distance;
    pool.value = course;
  }
  format.onchange = () => { listScope.parentElement.hidden = format.value !== 'list'; resetImage(); };
  listScope.onchange = clearDraft;
  file.onchange = resetImage;
  async function loadHistory() {
    let query = sb.from('swimmer_ranking_observations').select('season,stroke,distance,course,metric,category,value,entrants,observed_on')
      .eq('swimmer_id', player.id);
    if (stroke) query = query.eq('stroke', stroke).eq('distance', Number(distance)).eq('course', course);
    const { data, error } = await query.order('observed_on', { ascending: false }).order('id', { ascending: false }).limit(200);
    if (error) throw error;
    if (!isActive()) return;
    history.replaceChildren();
    if (!data.length) { element('p', '画像取込の履歴はありません。', history); return; }
    function show(row, parent) {
      element('li', [
        row.observed_on, row.season + '年度', row.stroke + row.distance + 'm', row.course,
        api.labels[row.metric], row.category,
        row.value + (row.metric === 'aqua' ? ' pt' : '位'),
        row.entrants ? '/ ' + row.entrants + '人' : '',
      ].filter(Boolean).join('　'), parent);
    }
    element('h3', '区分ごとの最新値', history);
    const current = element('ul', '', history);
    api.latest(data).forEach(row => show(row, current));
    const details = element('details', '', history);
    element('summary', '順位履歴（最大200件）', details);
    const list = element('ul', '', details);
    data.forEach(row => show(row, list));
  }

  read.onclick = async () => {
    const image = file.files[0];
    if (!image || !image.type.startsWith('image/')) { status.textContent = '画像ファイルを選択してください。'; return; }
    if (format.value === 'list' && !listScope.value) { status.textContent = '一覧の絞り込み区分を選択してください。'; return; }
    const selectedFormat = format.value;
    const scope = listScope.value;
    clearDraft();
    confirmed.checked = false;
    previewUrl = URL.createObjectURL(image);
    preview.src = previewUrl;
    preview.hidden = false;
    read.disabled = save.disabled = true;
    status.textContent = '端末で文字を読み取っています…';
    try {
      await ensureTesseract();
      if (!isActive()) return;
      const { data } = await Tesseract.recognize(image, 'jpn+eng');
      if (!isActive() || image !== file.files[0] || selectedFormat !== format.value || scope !== listScope.value) return;
      raw.textContent = data.text;
      const draft = api.parse(data, player.name, selectedFormat);
      imageName.value = draft.imageName;
      if (draft.listRank && scope !== 'japan') draft.values[scope] = { value: draft.listRank, entrants: '' };
      for (const [key, item] of Object.entries(draft.values)) {
        fields[key].value.value = item.value;
        if (fields[key].entrants) fields[key].entrants.value = item.entrants;
      }
      const detected = detectShotEvent(data.text);
      if (!event.value && detected.stroke) event.value = detected.stroke;
      if (!length.value && detected.distance) length.value = detected.distance;
      const years = [...new Set([...data.text.normalize('NFKC').replace(/\s/g, '').matchAll(/(20\d{2})年度/g)].map(match => match[1]))];
      if (!year.value && years.length === 1) year.value = years[0];
      const normalized = data.text.normalize('NFKC').replace(/\s/g, '');
      const grades = [...new Set([...normalized.matchAll(/(?:小学|中学|高校)[1-6](?:年)?/g)]
        .map(match => match[0].replace(/年?$/, '年')))];
      if (!grade.value && grades.length === 1) grade.value = grades[0];
      const schools = [...new Set([...normalized.matchAll(/(?:全国|山梨県?)(小学|中学|高校|大学)総合/g)]
        .map(match => match[1]))];
      if (!school.value && schools.length === 1) school.value = schools[0];
      const pools = api.courses.filter(course => data.text.replace(/\s/g, '').includes(course));
      if (!pool.value && pools.length === 1) pool.value = pools[0];
      status.textContent = '元画像と見比べ、空欄や誤読を修正してください。';
    } catch {
      if (isActive()) status.textContent = '画像を読み取れませんでした。画像を見ながら入力できます。';
    } finally { if (isActive()) read.disabled = save.disabled = false; }
  };

  form.onsubmit = async e => {
    e.preventDefault();
    if (!isActive() || save.disabled) return;
    try {
      const draft = {
        imageName: imageName.value, year: year.value, stroke: event.value, distance: length.value,
        course: pool.value, observedOn: observedOn.value, school: school.value.trim(), grade: grade.value.trim(),
        confirmed: confirmed.checked,
        values: Object.fromEntries(Object.entries(fields).map(([key, inputs]) => [
          key, { value: inputs.value.value, entrants: inputs.entrants?.value ?? '' },
        ])),
      };
      const rows = api.observations(draft, player);
      if (stroke && (draft.stroke !== stroke || Number(draft.distance) !== Number(distance) || draft.course !== course)) {
        throw Error('種目別ベストの対象種目と一致する内容を入力してください。');
      }
      save.disabled = read.disabled = true;
      const { error } = await sb.from('swimmer_ranking_observations').upsert(rows, {
        onConflict: 'swimmer_id,season,stroke,distance,course,metric,category,observed_on,value,entrants',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      if (!isActive()) return;
      confirmed.checked = false;
      status.textContent = '確認した項目を保存しました。';
      renderImportedRankingBadges(player);
      try { await loadHistory(); }
      catch { if (isActive()) status.textContent = '保存しました。履歴を表示できませんでした。'; }
    } catch (error) { if (isActive()) status.textContent = error.message; }
    finally { if (isActive()) save.disabled = read.disabled = false; }
  };
  dialog.showModal();
  loadHistory().catch(() => { if (isActive()) history.textContent = '順位履歴を取得できませんでした。'; });
}

async function renderImportedRankingBadges(player) {
  if (!session || !coachApproved) return;
  const pending = [...document.querySelectorAll('[data-ranking-player]')]
    .filter(badge => badge.dataset.rankingPlayer === String(player.id));
  if (!pending.length) return;
  const epoch = authorizationEpoch;
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const season = swimFiscalYear(today);
  const grade = jasfGradeFromBirthDate(player, season)?.label;
  if (!grade) return;
  try {
    const { data, error } = await sb.from('swimmer_ranking_observations')
      .select('season,stroke,distance,course,metric,category,value,observed_on')
      .eq('swimmer_id', player.id).eq('season', season).eq('category', grade)
      .in('metric', ['national_grade', 'prefect_grade'])
      .order('observed_on', { ascending: false }).order('id', { ascending: false });
    if (error || epoch !== authorizationEpoch) return;
    const entries = new Map();
    for (const row of RankingImageImport.latest(data)) {
      const key = rankBadgeId(player.id, row.stroke, row.distance, row.course);
      if (!entries.has(key)) entries.set(key, {});
      entries.get(key)[row.metric] = row;
    }
    for (const badge of pending) {
      if (!badge.isConnected || !entries.has(badge.id)) continue;
      const { national_grade: national, prefect_grade: prefecture } = entries.get(badge.id);
      const legacy = getNationalRankCache(player.id, badge.dataset.stroke, badge.dataset.distance, badge.dataset.course, season);
      const legacyNation = legacy?.found && (legacy.gradeRank || legacy.rank);
      const legacyPrefecture = legacy?.found && legacy.prefRank;
      const imported = row => row.value + '位（' + row.observed_on + '）';
      badge.textContent = [
        national ? '🇯🇵 同学年 全国 ' + imported(national) : legacyNation ? '🇯🇵 同学年 全国 ' + legacyNation + '位' : '',
        prefecture ? '🗻 山梨県 ' + imported(prefecture) : legacyPrefecture ? '🗻 ' + (legacy.prefName || '都道府県内') + ' ' + legacyPrefecture + '位' : '',
      ].filter(Boolean).join(' ／ ');
      badge.className = 'badge';
    }
  } catch {
    // Keep the existing ranking display when observation history is unavailable.
  }
}
