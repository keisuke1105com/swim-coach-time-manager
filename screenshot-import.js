/* Screenshot drafts only: no network or persistence. */
(function(root){
  const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  const nameKey=value=>clean(value).replace(/\s/g,'');
  function seconds(value){
    const text=clean(value);
    if(!/^(?:\d{1,3}:)?\d{1,2}\.\d{1,2}$/.test(text))return NaN;
    const parts=text.split(':').map(Number);
    if(parts.length===2&&parts[1]>=60)return NaN;
    const total=parts.length===2?parts[0]*60+parts[1]:parts[0];
    return total>0?total:NaN;
  }
  function laps(text,distance,total){
    let previous=0,previousDistance=0;const result=[];
    for(const line of String(text||'').split('\n').filter(x=>x.trim())){
      const match=clean(line).match(/^(\d+)\s*m?\s*[:：,、\s]\s*((?:\d+:)?\d{1,2}\.\d{1,2})$/i);
      if(!match)throw Error('ラップは「50m 30.12」のように距離と通過タイムを入力してください。');
      const d=Number(match[1]),time=seconds(match[2]);
      if(d!==previousDistance+50||d>distance||!Number.isFinite(time)||time<=previous||time>total)throw Error('ラップは50mから50mごとに、距離・順序・通過タイムを確認してください。');
      if(d===distance&&Math.abs(time-total)>.011)throw Error('最終通過タイムと今回のタイムが一致していません。');
      result.push({distance:d,cumulative_time:match[2],split_time:(time-previous).toFixed(2)});
      previous=time;previousDistance=d;
    }
    return result;
  }
  function validate(rows,meta,players){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)||!Number.isFinite(Date.parse(meta.date))||new Date(meta.date).toISOString().slice(0,10)!==meta.date)throw Error('競技日を指定してください。');
    if(!clean(meta.meet))throw Error('大会名を入力してください。');
    const selected=rows.filter(r=>r.save);if(!selected.length)throw Error('保存する記録を選択してください。');
    return selected.map(row=>{
      const player=players.find(p=>String(p.id)===String(row.playerId));
      if(!player||!row.verified)throw Error('選手名と画像の内容を確認し、各行の確認欄にチェックしてください。');
      const imageName=row.imageName??row.ocrName;
      if(imageName&&nameKey(imageName)!==nameKey(player.name))throw Error('画像の選手名と登録先が一致しません。画像の選手名の誤読を修正するか、登録先を選び直してください。');
      if(!['自由形','背泳ぎ','平泳ぎ','バタフライ','個人メドレー'].includes(row.stroke)||![25,50,100,200,400,800,1500].includes(Number(row.distance))||!['長水路','短水路'].includes(row.course))throw Error('種目・距離・水路を指定してください。');
      const time=seconds(row.time);if(!Number.isFinite(time))throw Error('今回のタイムを「24.57」「1:02.34」の形式で入力してください。');
      return {...row,name:player.name,time:clean(row.time),distance:Number(row.distance),timeSeconds:time,laps:laps(row.lapText,row.distance,time)};
    });
  }
  function parse(text,players,event){
    const lines=String(text||'').split('\n').map(clean).filter(Boolean),rows=[];let pending='',current=null;
    const timePattern=/(?:\d{1,3}:)?\d{1,2}\.\d{1,2}/;
    for(const line of lines){
      if(/^[\[【(（]/.test(line)||/^RT\s*:/i.test(line))continue;
      const lap=line.match(/^[●•]?\s*(\d+)\s*m\s+((?:\d+:)?\d{1,2}\.\d{1,2})/i);
      if(lap){if(current)current.lapText+=(current.lapText?'\n':'')+lap[1]+'m '+lap[2];continue;}
      const match=line.match(timePattern);
      if(!match){
        if(/(?:レーン|組|タイム|ラップ|自由形|背泳ぎ|平泳ぎ|バタフライ|メドレー|所属|大会)/.test(line))continue;
        const player=players.find(p=>nameKey(line.replace(/^\d+\s*/,''))===nameKey(p.name));
        if(player||/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・\s]{2,24}$/u.test(line)){pending=player?.name||line;current=null;}
        continue;
      }
      const index=match.index;if(line.slice(0,index).includes('['))continue;
      const before=line.slice(0,index).replace(/^\d+\s*/,'').trim();
      const name=before||pending;if(!name||name.length>24)continue;
      const player=players.find(p=>nameKey(p.name)===nameKey(name));
      current={playerId:player?.id||'',name,ocrName:name,time:match[0],stroke:event.stroke||'',distance:event.distance||null,course:'',save:false,verified:false,lapText:''};
      rows.push(current);pending='';
    }
    return rows;
  }
  const api={seconds,laps,validate,parse,nameKey};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.ScreenshotImport=api;
})(typeof window!=='undefined'?window:globalThis);
