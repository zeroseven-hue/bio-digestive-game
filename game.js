'use strict';
const C = window.DigestiveCore, $ = id => document.getElementById(id), KEY = 'digestive_adventure_v2';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = null, mode = 'single', bank = window.DIGESTIVE_QUESTIONS, saved = null, sound = false, audio = null, tickAt = 0, pauseFocus = null;
let isRolling = false;
const TEAM_THEMES = [
  { name: '暖橘隊', color: '#ea580c', border: '#fdba74', lightBg: '#fff7ed', glow: 'rgba(234, 88, 12, 0.35)' },
  { name: '湛藍隊', color: '#0284c7', border: '#7dd3fc', lightBg: '#f0f9ff', glow: 'rgba(2, 132, 199, 0.35)' },
  { name: '晶紫隊', color: '#9333ea', border: '#d8b4fe', lightBg: '#faf5ff', glow: 'rgba(147, 51, 234, 0.35)' },
  { name: '翠綠隊', color: '#16a34a', border: '#86efac', lightBg: '#f0fdf4', glow: 'rgba(22, 163, 74, 0.35)' }
];
const colors = TEAM_THEMES.map(t => t.color);

function save() {
  if (!state) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saved = JSON.stringify(state);
    if ($('storage-status')) $('storage-status').textContent = '進度已自動保存於此瀏覽器。';
  } catch (e) {
    if ($('storage-status')) $('storage-status').textContent = '此瀏覽器無法儲存進度，請勿關閉頁面；完成後可下載紀錄。';
    if ($('save-warning')) $('save-warning').textContent = '無法自動儲存，請勿關閉頁面。';
  }
}

/* 🎵 現代 Web Audio 合成音效引擎 (零外部依賴、純離線運作) */
function tone(type = true) {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const ctx = audio;
    const now = ctx.currentTime;

    if (type === 'dice') {
      // 骰子骨碌骨碌旋轉敲擊音效
      for (let i = 0; i < 5; i++) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180 + Math.random() * 220, now + i * 0.08);
        gain.gain.setValueAtTime(0.04, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.06);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.06);
      }
    } else if (type === 'hop') {
      // 棋子一步一格跳躍彈性音效
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.09);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'fanfare' || type === true) {
      // 答對或成功之明亮大三和弦
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);
        gain.gain.setValueAtTime(0.04, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.22);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.22);
      });
    } else {
      // 答錯或提示之柔和低音
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.linearRampToValueAtTime(200, now + 0.16);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    }
  } catch (e) {}
}

function teamInputs() {
  if (!$('team-names') || !$('team-count')) return;
  const old = [...$('team-names').querySelectorAll('input')].map(i => i.value);
  $('team-names').innerHTML = Array.from({ length: +$('team-count').value }, (_, i) =>
    `<label>第 ${i + 1} 組隊伍名稱<input id="team-${i}" maxlength="24" value="${esc(old[i] || '第 ' + (i + 1) + ' 組')}"></label>`
  ).join('');
}

function setMode(next) {
  mode = next;
  if ($('single-fields')) $('single-fields').hidden = mode !== 'single';
  if ($('player-name')) $('player-name').disabled = mode !== 'single';
  if ($('team-fields')) $('team-fields').hidden = mode !== 'team';
  for (const x of ['single', 'team']) {
    const btn = $(x + '-mode');
    if (btn) {
      btn.classList.toggle('selected', x === mode);
      btn.setAttribute('aria-pressed', String(x === mode));
    }
  }
  if ($('mode-desc')) {
    $('mode-desc').textContent = mode === 'single'
      ? '完成五大器官檢核，答錯有即時提示與重答機會，不扣分、不退格。'
      : '同機輪流討論，每個基本回合都有一次答題機會，獎勵與學習分開計。';
  }
}

function sections(which) {
  for (const id of ['setup', 'play', 'results']) {
    const el = $(id);
    if (el) el.hidden = id !== which;
  }
  if ($('pause')) $('pause').hidden = which !== 'play';
}

function renderTokensOnly(overridePos = null) {
  if (!state || !$('tokens')) return;
  $('tokens').innerHTML = state.players.map((x, i) => {
    const pos = (overridePos !== null && i === state.current) ? overridePos : x.pos;
    const c = pos >= 55 ? { x: 49, y: 94 } : (window.MAP_POSITIONS[pos] || { x: 23.5, y: 7.5 });
    return `<span class="token ${i === state.current ? 'active' : ''} ${overridePos !== null && i === state.current ? 'hopping' : ''}" 
      title="${esc(x.name)}：第 ${pos} 格" 
      style="--color:${colors[i]};left:calc(${c.x}% + ${i * 4}px);top:calc(${c.y}% + ${i * 4}px)">${i + 1}</span>`;
  }).join('');
}

function render() {
  if (!state) return;
  save();
  tickAt = performance.now();
  if ($('pause-overlay')) $('pause-overlay').hidden = !state.paused;
  if (state.phase === 'ended') {
    renderResults();
    return;
  }

  sections('play');
  const p = state.players[state.current], org = C.organAt(p.pos);
  if ($('organ-name')) $('organ-name').textContent = org[1];
  if ($('organ-desc')) $('organ-desc').textContent = org[3];
  if ($('dice-log')) $('dice-log').textContent = state.lastMessage;

  // 玩家狀態條 (Bento Dashboard)
  if ($('dashboard')) {
    $('dashboard').innerHTML = state.players.map((x, i) => {
      const theme = TEAM_THEMES[i % TEAM_THEMES.length];
      return `
        <div class="badge ${i === state.current ? 'active' : ''}" 
             style="--team-color:${theme.color}; --team-border:${theme.border}; --team-bg:${theme.lightBg}; --team-glow:${theme.glow};"
             title="${esc(x.name)}">
          <div class="badge-header">
            <span class="badge-num" style="background:${theme.color}">${i + 1}</span>
            <strong style="color:${i === state.current ? theme.color : 'inherit'}">${i === state.current ? '▶ ' : ''}${esc(x.name)}</strong>
          </div>
          <small>⚡ ${x.learning} 分 · ${x.finished ? '🏁 抵達終點' : '📍 第 ' + x.pos + ' 格'}${x.skip ? ' (🐌慢行)' : ''}</small>
        </div>
      `;
    }).join('');
  }

  renderTokensOnly();

  // 器官檢核里程碑進度條
  if ($('progress')) {
    $('progress').innerHTML = state.config.mode === 'single'
      ? '<div class="check-list">' + C.organs.map(([id, name]) =>
          `<span class="${p.checks.includes(id) ? 'done' : ''}">${p.checks.includes(id) ? '✓' : '○'} ${name}檢核</span>`
        ).join('') + '</div>'
      : '<p class="subtle">' + (state.config.rule === 'rounds'
          ? `第 ${state.round} / ${state.config.rounds} 輪 · 每隊相同基本回合數`
          : `第 ${state.round} 輪 · ${state.finishRound ? '最後一輪：讓所有隊伍完成行動' : '抵達終點後完成該輪'}`) + '</p>';
  }

  const task = $('task');
  if (!task) return;
  const curTheme = TEAM_THEMES[state.current % TEAM_THEMES.length];

  if (state.phase === 'ready') {
    const lastRoll = state.lastDice && state.lastDice.length ? state.lastDice[0] : 1;
    task.innerHTML = `
      <p class="eyebrow">${state.extra ? 'BONUS MOVE · 額外前進' : 'YOUR TURN · 輪到你了'}</p>
      <h2 style="display:flex; align-items:center; gap:8px;"><span class="badge-num" style="background:${curTheme.color}; width:24px; height:24px; font-size:12px; display:inline-grid; place-items:center; border-radius:50%; color:white;">${state.current + 1}</span> <span style="color:${curTheme.color}">${esc(p.name)}</span></h2>
      <p>${state.extra ? '✨ 膽汁助攻：再擲一次，只移動，不重複出題或觸發事件。' : p.skip ? '🐌 慢行回合：本回合停留原地，仍有一次答題機會。' : '擲出 1–4 點，沿著消化道前進探索。'}</p>
      
      <div class="dice-arena">
        <div class="dice-scene">
          <div class="dice-cube show-${lastRoll}" id="diceCube">
            <div class="dice-face face-front"><span class="pip"></span></div>
            <div class="dice-face face-back"><span class="pip"></span><span class="pip"></span><span class="pip"></span><span class="pip"></span><span class="pip"></span><span class="pip"></span></div>
            <div class="dice-face face-right"><span class="pip"></span><span class="pip"></span><span class="pip"></span></div>
            <div class="dice-face face-left"><span class="pip"></span><span class="pip"></span><span class="pip"></span><span class="pip"></span></div>
            <div class="dice-face face-top"><span class="pip"></span><span class="pip"></span></div>
            <div class="dice-face face-bottom"><span class="pip"></span><span class="pip"></span><span class="pip"></span><span class="pip"></span><span class="pip"></span></div>
          </div>
        </div>
        <div class="dice-result-badge" id="diceRollStatus" style="color:${curTheme.color}; border-color:${curTheme.border}; background:${curTheme.lightBg};">
          ${p.skip ? '🐌 慢行回合（原地思考）' : state.extra ? '✨ 膽汁助攻！請再加擲一次' : '準備擲骰出發'}
        </div>
      </div>

      <button id="roll" class="primary" style="font-size:1.1rem; padding:15px 24px; background:linear-gradient(135deg, ${curTheme.color}, ${curTheme.color}ee); box-shadow:0 4px 14px ${curTheme.glow};">
        ${state.extra ? '🎲 額外加擲' : p.skip ? '開始慢行回合 ➔' : '🎲 擲骰出發 ➔'}
      </button>
    `;

    $('roll').onclick = () => {
      if (isRolling) return;
      isRolling = true;
      $('roll').disabled = true;

      if (p.skip) {
        // 慢行回合免擲骰
        isRolling = false;
        if (C.roll(state)) { tone('hop'); render(); }
        return;
      }

      const dice = Math.floor(Math.random() * 4) + 1;
      const cube = $('diceCube');
      const status = $('diceRollStatus');

      // 1. 播放 3D 骰子翻滾動畫與音效
      if (cube) cube.className = 'dice-cube rolling';
      if (status) status.textContent = '🎲 骰子翻滾中...';
      tone('dice');

      // 檢查是否處於標準瀏覽器環境 (支援 setTimeout 步進動畫)
      setTimeout(() => {
        if (cube) cube.className = `dice-cube show-${dice}`;
        if (status) status.textContent = `🎉 擲出 ${dice} 點！`;

        const startPos = p.pos;
        const willMove = C.roll(state, dice);
        if (!willMove) {
          isRolling = false;
          render();
          return;
        }

        const targetPos = p.pos;
        // 2. 棋子一步一格跳躍前進 (Step-by-step hopping)
        if (targetPos > startPos) {
          let step = startPos;
          const hopTimer = setInterval(() => {
            step++;
            renderTokensOnly(step);
            tone('hop');
            if (step >= targetPos) {
              clearInterval(hopTimer);
              setTimeout(() => {
                isRolling = false;
                render();
              }, 220);
            }
          }, 180);
        } else {
          isRolling = false;
          render();
        }
      }, 550);
    };

  } else if (state.phase === 'event') {
    task.innerHTML = `
      <p class="eyebrow">PHYSIOLOGICAL EVENT · 探索事件</p>
      <h2>✨ ${esc(state.event.title)}</h2>
      <p style="font-size:1.1rem; line-height:1.7;">${esc(state.event.text)}</p>
      <div class="explanation">
        ⚡ <b>冒險能量獎勵：+${state.event.bonus} 點</b><br>
        深入理解消化生理機制，接著完成該區器官的學習任務！
      </div>
      <button id="next" class="primary" style="margin-top:16px;">進入學習挑戰 ➔</button>
    `;
    $('next').onclick = () => {
      C.proceed(state);
      render();
    };

  } else {
    const a = state.question, q = state.bank.find(item => item.id === a.id);
    const label = C.organs.find(o => o[0] === q.organ)[1] + ' · ' + (a.kind === 'checkpoint' ? '器官必經檢核' : a.kind === 'review' ? '錯題再練習' : '隨堂挑戰');

    if (state.phase === 'question') {
      task.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <p class="eyebrow" style="margin:0;">${label}${a.attempt ? ' · 💡 提示後再試一次' : ''}</p>
          <div id="timer" class="timer">⏳ ${a.remaining ? `剩餘 ${a.remaining} 秒` : '不限時思考'}</div>
        </div>
        <h2 style="display:flex; align-items:center; gap:8px;">
          <span class="badge-num" style="background:${curTheme.color}; width:24px; height:24px; font-size:12px; display:inline-grid; place-items:center; border-radius:50%; color:white;">${state.current + 1}</span> 
          <span style="color:${curTheme.color}">${esc(p.name)}</span>
        </h2>
        <p class="question">${esc(q.q)}</p>
        ${a.attempt ? `<div class="explanation">💡 <b>觀念引導：</b>${esc(q.exp)}</div>` : ''}
        <div class="options">
          ${a.order.map((optIdx, n) => `<button data-answer="${optIdx}"><b style="color:var(--primary);">${String.fromCharCode(65 + n)}.</b> ${esc(q.opts[optIdx])}</button>`).join('')}
        </div>
      `;
      task.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => {
        if (C.answer(state, +b.dataset.answer)) {
          tone(state.question.correct ? 'fanfare' : false);
          render();
        }
      });

    } else {
      const retry = state.config.mode === 'single' && !a.correct && a.attempt === 0;
      const earnedText = (a.attempt || a.kind === 'review') 
        ? '完成觀念複習！' 
        : (a.solveTimes > 1 ? `💡 已知情報接力（第 ${a.solveTimes} 隊答對）：+${a.earned || 15} 學習分` : `🥇 首位破題拓荒者：+20 學習分！`);
      task.innerHTML = `
        <p class="eyebrow">${label} · 作答回饋</p>
        <h2 class="${a.correct ? 'right' : 'wrong'}">
          ${a.correct ? '🎉 答對了！' + earnedText : a.choice === -1 ? '⏰ 時間到了，一起釐清觀念' : '再想一想，這是深入學習的機會'}
        </h2>
        <p style="font-weight:700; margin-bottom:8px;">${esc(q.q)}</p>
        <div style="margin:10px 0; font-size:0.96rem;">你的選擇：${a.choice === -1 ? '未作答' : esc(q.opts[a.choice])}</div>
        ${retry ? '' : `<div style="margin:10px 0; color:var(--success); font-weight:800;">✓ 正確解答：${esc(q.opts[q.ans])}</div>`}
        <div class="explanation">
          <b>📖 生物學觀念詳解：</b><br>${esc(q.exp)}
        </div>
        <p class="subtle">${retry ? '接著可以重答一次。首次作答紀錄會保存，重答不重複計分。' : !a.correct ? '不扣分、不退格。此題已收錄到錯題複習庫中。' : '表現優異！觀念掌握扎實。'}</p>
        <button id="next" class="primary">${retry ? '看懂了，再試一次 ➔' : '繼續前進 ➔'}</button>
      `;
      $('next').onclick = () => {
        C.proceed(state);
        render();
      };
    }
  }

  task.setAttribute('tabindex', '-1');
  task.focus({ preventScroll: true });
}

function renderResults() {
  sections('results');
  const race = state.config.mode === 'team' && state.config.rule === 'race';
  const ranked = [...state.players].sort((a, b) => race
    ? Number(b.finished) - Number(a.finished) || b.pos - a.pos
    : b.learning - a.learning);

  $('results').innerHTML = `
    <p class="eyebrow">JOURNEY COMPLETE · 消化冒險挑戰完成</p>
    <h1>把冒險探索，化為扎實的生物學知識。</h1>
    <p>${state.config.mode === 'single' ? '已順利完成人體消化道旅程與五大器官檢核！檢核完成不代表全部答對，可繼續複習錯題提升熟練度。' : race ? '本輪所有隊伍已完成行動；同輪抵達終點者並列完賽。' : '所有隊伍已完成相同基本回合數。依學習分排名；冒險獎勵不影響成績。'}</p>
    <p class="subtle">完賽時間：${esc(new Date(state.completedAt).toLocaleString('zh-TW'))} · 成績識別碼 <b>${recordCode()}</b></p>
  ` + ranked.map((p, i) => {
    const rank = race ? (p.finished ? '🏁 完賽' : '第 ' + p.pos + ' 格') : '第 ' + (ranked.findIndex(x => x.learning === p.learning) + 1) + ' 名';
    return `
      <section class="result-card">
        <h2>${state.config.mode === 'team' ? rank + ' · ' : ''}${esc(p.name)} 成果報告</h2>
        <div class="metrics">
          <div><b>${p.learning}</b><span>學習總積分</span></div>
          <div><b>${p.total ? Math.round(p.correct / p.total * 100) + '%' : '尚無紀錄'}</b><span>首次正確率 · ${p.correct}/${p.total} 題</span></div>
          <div><b>${p.bonus}</b><span>冒險能量獎勵</span></div>
          <div><b>${p.turns}</b><span>完成回合數</span></div>
        </div>
        
        <h3>器官觀念掌握分析</h3>
        <table>
          <thead>
            <tr><th>消化器官</th><th>首次答對率</th><th>複習修正次數</th><th>掌握狀態</th></tr>
          </thead>
          <tbody>
            ${C.organs.map(([id, name]) => {
              const m = p.mastery[id];
              return `
                <tr>
                  <td><b>${name}</b></td>
                  <td>${m ? m.correct + '/' + m.total : '未出題'}</td>
                  <td>${m?.corrected || 0}</td>
                  <td>${!m ? '未涵蓋' : m.correct === m.total && m.total ? '<span style="color:var(--success); font-weight:800;">✓ 首次全對</span>' : p.review.some(r => state.bank.find(q => q.id === r.id).organ === id) ? '<span style="color:var(--accent-amber); font-weight:700;">建議複習</span>' : '<span style="color:var(--primary); font-weight:700;">已練習修正</span>'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <details style="margin: 18px 0;">
          <summary style="cursor:pointer; font-weight:700; color:var(--text-dark);">首次錯題解析（共 ${p.records.filter(r => !r.correct).length} 題，點擊展開）</summary>
          <div style="margin-top:12px;">
            ${p.records.filter(r => !r.correct).map(r => {
              const q = state.bank.find(item => item.id === r.id);
              return `
                <div style="background:var(--bg-card-warm); border:1px solid var(--border-warm); padding:12px; border-radius:var(--radius-md); margin-bottom:10px;">
                  <p style="font-weight:700; margin:0 0 6px;">${esc(q.q)}</p>
                  <p style="margin:3px 0; color:var(--accent-red); font-size:0.92rem;">你的選擇：${r.choice === -1 ? '未作答' : esc(q.opts[r.choice])}</p>
                  <p style="margin:3px 0; color:var(--success); font-size:0.92rem; font-weight:800;">正確答案：${esc(q.opts[q.ans])}</p>
                  <p class="subtle" style="margin:6px 0 0;">${esc(q.exp)}</p>
                </div>
              `;
            }).join('') || '<p class="subtle">恭喜！本次挑戰沒有首次答錯的題目，觀念非常扎實！</p>'}
          </div>
        </details>

        ${p.review.length ? `<button data-review="${p.id}" class="secondary">🔄 複習待加強題目（${p.review.length} 題）</button>` : ''}
      </section>
    `;
  }).join('') + `
    <div class="actions">
      ${state.config.mode === 'single' && state.profile ? '<button id="submit-score" class="primary" style="flex:2;">🚀 送出個人成績至教師試算表 (優先推薦)</button>' : ''}
      <button id="download" class="secondary">📥 下載學習紀錄 (JSON)</button>
      <button id="copy-score" class="secondary">📋 複製成績文字 (斷網備用)</button>
      <button id="print" class="secondary">🖨️ 列印證書 / 存 PDF</button>
      <button id="restart" class="secondary">🔄 重新開始挑戰</button>
    </div>
    <p id="copy-status" class="subtle" role="status" style="margin-top:12px; font-weight:700; text-align:center;"></p>
    <textarea id="copy-fallback" aria-label="成績文字備份" rows="6" hidden style="width:100%; margin-top:10px;"></textarea>
  `;

  if ($('submit-score')) $('submit-score').onclick = submitScore;
  if ($('copy-score')) $('copy-score').onclick = copyScore;
  if ($('download')) $('download').onclick = download;
  if ($('print')) $('print').onclick = () => window.print();
  if ($('restart')) $('restart').onclick = () => {
    sections('setup');
    if ($('resume')) $('resume').hidden = false;
    window.scrollTo(0, 0);
  };
  $('results').querySelectorAll('[data-review]').forEach(b => b.onclick = () => {
    C.reviewSession(state, +b.dataset.review);
    render();
    window.scrollTo(0, 0);
  });
}

function recordCode() {
  let n = 0;
  for (const c of state.createdAt + state.players.map(p => p.name + p.learning).join('|')) {
    n = (n * 31 + c.charCodeAt(0)) | 0;
  }
  return 'DG-' + (n >>> 0).toString(16).toUpperCase();
}

async function copyScore() {
  const text = '人體消化大冒險｜' + recordCode() + '\n' +
    state.players.map(p => `${p.name}：學習 ${p.learning} 分；首次答對 ${p.correct}/${p.total} 題；冒險獎勵 ${p.bonus} 點；完成 ${p.turns} 回合`).join('\n') +
    '\n完賽時間：' + new Date(state.completedAt).toLocaleString('zh-TW');
  try {
    await navigator.clipboard.writeText(text);
    if ($('copy-status')) $('copy-status').textContent = '✅ 已複製成績文字至剪貼簿！';
  } catch (e) {
    if ($('copy-fallback')) {
      $('copy-fallback').hidden = false;
      $('copy-fallback').value = text;
      $('copy-fallback').select();
    }
    if ($('copy-status')) $('copy-status').textContent = '請手動複製下方文字備份：';
  }
}

function submitScore() {
  if (!state || state.phase !== 'ended' || state.config.mode !== 'single' || !state.profile) return;
  if (typeof window.showScoreSubmitModal !== 'function') {
    if ($('copy-status')) $('copy-status').textContent = '成績模組未載入，請使用下載或複製備份。';
    return;
  }
  const p = state.players[0], profile = state.profile;
  window.showScoreSubmitModal({
    gameTitle: '人體消化大冒險 (54格地圖)',
    gameId: 'bio-digestive-game',
    submissionId: state.createdAt,
    class: profile.cls,
    seat: profile.seat,
    name: profile.name,
    score: p.learning,
    accuracy: p.total ? Math.round(p.correct / p.total * 100) + '%' : '--',
    scoreDisplay: `${p.learning} 學習分 · 首次答對 ${p.correct}/${p.total} 題`,
    duration: '完成消化道 54 格旅程與五區檢核',
    onRetry: () => renderResults(),
    extraLabel: '返回學習成果／複習錯題',
    onReset: () => {
      state = null;
      saved = null;
      try { localStorage.removeItem(KEY); } catch (e) {}
    }
  });
}

function download() {
  const report = {
    title: '人體消化大冒險學習紀錄',
    recordId: recordCode(),
    createdAt: state.createdAt,
    completedAt: state.completedAt,
    config: state.config,
    players: state.players.map(p => ({
      ...p,
      records: p.records.map(r => ({ ...r, question: state.bank.find(q => q.id === r.id) }))
    }))
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = '消化冒險-' + recordCode() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pause() {
  if (!state || state.phase === 'ended' || state.paused) return;
  pauseFocus = document.activeElement;
  state.paused = true;
  save();
  if ($('pause-overlay')) $('pause-overlay').hidden = false;
  if ($('unpause')) $('unpause').focus();
}

function resume() {
  state.paused = false;
  tickAt = performance.now();
  save();
  if ($('pause-overlay')) $('pause-overlay').hidden = true;
  if (pauseFocus) pauseFocus.focus({ preventScroll: true });
}

// 綁定事件監聽
if ($('single-mode')) $('single-mode').onclick = () => setMode('single');
if ($('team-mode')) $('team-mode').onclick = () => setMode('team');
if ($('team-count')) $('team-count').onchange = teamInputs;
if ($('rule')) $('rule').onchange = () => {
  if ($('rounds-label')) $('rounds-label').hidden = $('rule').value === 'race';
};

/* 🚀 開局身分確認與數位載具公約控制 (優雅 In-Page Modal，兼具相容 fallback) */
function executeStartGame(profile, names) {
  state = C.create({
    mode,
    names,
    rule: $('rule') ? $('rule').value : 'rounds',
    rounds: $('rounds') ? $('rounds').value : '8',
    seconds: $('seconds') ? $('seconds').value : '0',
    pace: $('pace') ? $('pace').value : 'full'
  }, bank);
  state.profile = profile;
  render();
  window.scrollTo(0, 0);
}

if ($('settings')) {
  $('settings').onsubmit = e => {
    e.preventDefault();
    if (saved && state?.phase !== 'ended' && !confirm('開始新冒險會取代這個瀏覽器的續玩進度，確定開始？')) return;

    if (mode === 'single') {
      const n = $('player-name') ? $('player-name').value.trim() : '';
      const c = $('class-name') ? $('class-name').value : '701';
      const seat = $('seat') ? $('seat').value : '01';
      if (!n) {
        if ($('player-name')) $('player-name').focus();
        return;
      }

      const modal = $('student-modal');
      const info = $('student-modal-info');
      const confirmBtn = $('student-modal-confirm');
      const cancelBtn = $('student-modal-cancel');

      // 若處於標準瀏覽器 DOM 環境且具備 modal 結構，彈出精緻和風公約視窗
      if (typeof HTMLElement !== 'undefined' && modal instanceof HTMLElement && info && confirmBtn && cancelBtn) {
        info.textContent = `${c} 班 ${seat} 號 ${n}`;
        modal.hidden = false;
        confirmBtn.onclick = () => {
          modal.hidden = true;
          const profile = { cls: c, seat, name: n };
          window.playerProfile = profile;
          executeStartGame(profile, [`${n}（${c}-${seat}）`]);
        };
        cancelBtn.onclick = () => {
          modal.hidden = true;
        };
      } else {
        // Node 測試環境或 fallback
        if (typeof confirm === 'function' && !confirm(`請核對身分：${c} 班 ${seat} 號 ${n}\n\n【課堂載具使用誠信公約】\n挑戰全程請專注作答。確認身分無誤，並遵守公約？`)) return;
        const profile = { cls: c, seat, name: n };
        window.playerProfile = profile;
        executeStartGame(profile, [`${n}（${c}-${seat}）`]);
      }
    } else {
      const names = $('team-names')
        ? [...$('team-names').querySelectorAll('input')].map(i => i.value)
        : ['第 1 組', '第 2 組'];
      window.playerProfile = null;
      executeStartGame(null, names);
    }
  };
}

if ($('resume')) {
  $('resume').onclick = () => {
    try {
      state = C.restore(saved);
      render();
      window.scrollTo(0, 0);
    } catch (e) {
      if ($('storage-status')) $('storage-status').textContent = e.message + '，請開始新冒險。';
      $('resume').hidden = true;
    }
  };
}

if ($('pause')) $('pause').onclick = pause;
if ($('unpause')) $('unpause').onclick = resume;
if ($('save-home')) $('save-home').onclick = () => {
  save();
  if ($('pause-overlay')) $('pause-overlay').hidden = true;
  sections('setup');
  if ($('resume')) $('resume').hidden = false;
};
if ($('home')) $('home').onclick = e => {
  e.preventDefault();
  if (state && $('play') && !$('play').hidden) pause();
  else {
    sections('setup');
    if ($('resume')) $('resume').hidden = !saved;
  }
};
if ($('large')) $('large').onclick = () => {
  document.documentElement.classList.toggle('large');
  $('large').setAttribute('aria-pressed', String(document.documentElement.classList.contains('large')));
};
if ($('sound')) $('sound').onclick = () => {
  sound = !sound;
  $('sound').textContent = '音效：' + (sound ? '開' : '關');
  $('sound').setAttribute('aria-pressed', String(sound));
  tone('hop');
};
if ($('map-zoom')) $('map-zoom').onclick = () => {
  if (!$('map-wrap')) return;
  const zoom = $('map-wrap').classList.toggle('zoomed');
  $('map-zoom').textContent = zoom ? '🌍 縮回全圖' : '🔍 放大特寫';
  if (zoom && state && $('board')) {
    const p = state.players[state.current];
    const c = p.pos >= 55 ? { x: 49, y: 94 } : (window.MAP_POSITIONS[p.pos] || { x: 23.5, y: 7.5 });
    setTimeout(() => {
      const targetY = (c.y / 100) * ($('board').clientHeight) - ($('map-wrap').clientHeight / 2);
      $('map-wrap').scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }, 50);
  }
};

if ($('pause-overlay')) {
  $('pause-overlay').onkeydown = e => {
    if (e.key === 'Escape') { e.preventDefault(); resume(); }
    if (e.key === 'Tab') {
      const first = $('unpause'), last = $('save-home');
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state && $('play') && !$('play').hidden) pause();
});
window.addEventListener('pagehide', save);

// 計時器輪詢
setInterval(() => {
  if (!state || state.paused || state.phase !== 'question' || !state.config.seconds || ($('play') && $('play').hidden)) return;
  const now = performance.now(), elapsed = Math.floor((now - tickAt) / 1000);
  if (elapsed < 1) return;
  tickAt += elapsed * 1000;
  state.question.remaining = Math.max(0, state.question.remaining - elapsed);
  if ($('timer')) $('timer').textContent = '⏳ 思考剩餘 ' + state.question.remaining + ' 秒';
  save();
  if (state.question.remaining === 0) {
    C.answer(state, -1);
    tone(false);
    render();
  }
}, 250);

teamInputs();

// 初始化班級座號
if ($('class-name')) $('class-name').innerHTML = Array.from({ length: 10 }, (_, i) => `<option>${701 + i}</option>`).join('');
if ($('seat')) $('seat').innerHTML = Array.from({ length: 35 }, (_, i) => `<option>${String(i + 1).padStart(2, '0')}</option>`).join('');

try {
  saved = localStorage.getItem(KEY);
  if (saved) {
    const previous = C.restore(saved);
    if ($('resume')) {
      $('resume').hidden = false;
      $('resume').textContent = previous.phase === 'ended' ? '📂 查看上次成果' : '📂 繼續上次冒險進度';
    }
  }
} catch (e) {
  saved = null;
  if ($('storage-status')) $('storage-status').textContent = '沒有可用的續玩紀錄，可開始新冒險。';
}

async function refreshBank() {
  if (typeof location !== 'undefined' && location.protocol === 'file:') return;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch('questions.json', { signal: controller.signal, cache: 'no-cache' });
    if (!res.ok) throw Error('讀取失敗');
    const next = await res.json();
    if (!C.validateBank(next)) throw Error('題庫格式錯誤');
    bank = next;
    if ($('bank-status')) $('bank-status').textContent = '外部題庫已驗證：' + bank.length + ' 題。進行中的冒險保持原題庫。';
  } catch (e) {
    if ($('bank-status')) $('bank-status').textContent = '使用完整離線題庫：' + bank.length + ' 題，可正常開始。';
  } finally {
    clearTimeout(timeout);
  }
}
refreshBank();
