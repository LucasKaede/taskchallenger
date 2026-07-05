// ==========================================
// [設定] スプレッドシート連携とパス設定
// ==========================================
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSQmO9lQYhBm7xWmsGEWQ4RvBLeHQfnxbA3h_SmF_i-fPqScsll-bQMJGmT8klBaZUa3H0V-Df37EMQ/pub?output=csv";
const IMG_BASE_PATH = "images/"; 
const VOICE_BASE_PATH = "voices/"; 
const BGM_BASE_PATH = "bgm/"; 
const VOICE_EXT = ".m4a"; 

// --- 初期データ・状態管理 ---
let playerName = localStorage.getItem('oshi_player_name') || "";
let gold = localStorage.getItem('oshi_gold') ? parseInt(localStorage.getItem('oshi_gold')) : 0;
let completedDates = JSON.parse(localStorage.getItem('oshi_completed_dates') || "[]");

const todayDate = new Date(); 
const todayStr = todayDate.toDateString(); 
const currentDay = todayDate.getDay(); 
const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

let charDatabase = {}; 
const fallbackEmojis = ["😊","😐","😑","😍","🥺"]; 
const globalImageCache = []; 
const imgStatus = {}; 

let currentCharId = localStorage.getItem('oshi_char') || "";
let activeQuests = []; 
let activeOperations = [];

// ==========================================
// 音声・BGMのグローバルオブジェクト
// ==========================================
let currentAudio = null;
let isVoiceMuted = false;
let isBgmMuted = false;

// 【新規】BGMの番号管理（今後 02, 03 と増やすための変数）
let currentBgmTrack = "01"; 

// BGM設定（かなり小さめの音量 5% でループ設定）
let bgmAudio = new Audio(`${BGM_BASE_PATH}background_${currentBgmTrack}.mp3`);
bgmAudio.loop = true;
bgmAudio.volume = 0.05; 

// ミュート切り替え関数
function toggleVoiceMute() {
  isVoiceMuted = !isVoiceMuted;
  const btn = document.getElementById('btnVoiceMute');
  if (isVoiceMuted) {
    btn.classList.add('muted');
    btn.innerText = "🗣️ ボイス: OFF";
    if (currentAudio) currentAudio.pause(); 
  } else {
    btn.classList.remove('muted');
    btn.innerText = "🗣️ ボイス: ON";
  }
}

function toggleBgmMute() {
  isBgmMuted = !isBgmMuted;
  const btn = document.getElementById('btnBgmMute');
  if (isBgmMuted) {
    btn.classList.add('muted');
    btn.innerText = "🎵 BGM: OFF";
    bgmAudio.pause();
  } else {
    btn.classList.remove('muted');
    btn.innerText = "🎵 BGM: ON";
    // もし現在タスクが稼働中なら、すぐにBGMを再開する
    if (activeOperations.some(o => o.isRunning)) {
      bgmAudio.play().catch(e => { console.warn("BGM再生ブロック:", e); });
    }
  }
}


let questData = {
  video: { title: '動画制作', emoji: '🎬', days: [0,1,2,3,4,5,6], subtasks: ['編集ソフト起動', '素材を取り込む', 'タイムラインに配置'] },
  morning: { title: '朝の準備', emoji: '🌅', days: [0,1,2,3,4,5,6], subtasks: ['布団から出る', '水を飲む', '顔を洗う'] },
  cleanup: { title: 'お掃除', emoji: '🧹', days: [0,6], subtasks: ['ゴミ袋を広げる', '床のゴミを拾う'] }
};

// ==========================================
// 1. 起動・CSV読み込み・画像事前読み込み
// ==========================================
window.onload = async () => {
  await loadCharacterDataFromCSV();
  preloadAllImages();

  const loading = document.getElementById('loadingScreen');
  if(loading) loading.style.display = 'none';

  if (!playerName) { 
    document.getElementById('loginModal').style.display = 'flex'; 
  } else { 
    initApp(); 
  }
};

function preloadAllImages() {
  preloadCharacterImages(currentCharId);
  for (const id in charDatabase) {
    if (id !== currentCharId) preloadCharacterImages(id);
  }
}

function preloadCharacterImages(charId) {
  for (let i = 1; i <= 5; i++) {
    const url = `${IMG_BASE_PATH}${charId}_${i}.png`;
    if (imgStatus[url]) continue; 
    
    imgStatus[url] = 'loading';
    const img = new Image();
    img.onload = () => { imgStatus[url] = 'ok'; };
    img.onerror = () => { imgStatus[url] = 'error'; }; 
    img.src = url;
    globalImageCache.push(img);
  }
}

async function loadCharacterDataFromCSV() {
  try {
    const urlWithCacheBuster = SHEET_CSV_URL + "&t=" + new Date().getTime();
    const response = await fetch(urlWithCacheBuster);
    
    if (!response.ok) throw new Error("通信エラー");
    const text = await response.text();
    
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        throw new Error("CSVではなくHTMLが返却されました");
    }
    
    parseCSV(text);
    if (Object.keys(charDatabase).length === 0) throw new Error("データが空です");
    
  } catch (error) {
    console.warn("⚠ データの取得に失敗。予備データを使用します。", error);
    charDatabase = {
      "c_osananajimi": { name: "幼馴染系", dialogues: { greet_morning: "「おはよう、{name}！今日も一日頑張ろうね！」", greet_noon: "「やっほー、お昼ご飯ちゃんと食べた？」", greet_night: "「こんばんは。夜更かししすぎないようにね。」", switch: "「私の出番だね！任せて！」", wait_empty: "「今日は何するの？『予定を作成』で教えてね！」", wait_ready: "「準備OK？いつでもいけるよ！」", work_start: "「よーし、スタート！無理しないでね。」", work_cheer: "「その調子！」|「頑張れ頑張れ！」", subtask_clear: "「おっ、一つクリア！」|「いいペース！」", main_clear: "「お疲れ様！一つ大きな予定が終わったね！」", all_clear: "「わぁ…！今日の予定全部クリア！カレンダーにスタンプ押しといたよ💕」|「全部終わったね！{name}、今日もお疲れ様、ゆっくり休んでね！」", cancel: "「あれ、間違えちゃった？大丈夫、やり直そう！」" } }
    };
  }
  
  if(!charDatabase[currentCharId]) {
    currentCharId = Object.keys(charDatabase)[0];
    localStorage.setItem('oshi_char', currentCharId);
  }
}

function parseCSV(csvText) {
  const db = {};
  const rows = csvText.split('\n');
  
  for(let i = 1; i < rows.length; i++) {
    let row = rows[i].trim();
    if(!row) continue;
    
    let cols = [];
    let inQuotes = false;
    let currentStr = "";
    
    for(let j = 0; j < row.length; j++) {
      let char = row[j];
      if(char === '"') {
        inQuotes = !inQuotes;
      } else if(char === ',' && !inQuotes) {
        cols.push(currentStr);
        currentStr = "";
      } else {
        currentStr += char;
      }
    }
    cols.push(currentStr);
    
    if(cols.length < 2) continue;
    cols = cols.map(c => c.replace(/^"|"$/g, '').trim());
    
    const id = cols[0];
    db[id] = {
      name: cols[1],
      dialogues: {
        greet_morning: cols[2] || "", greet_noon: cols[3] || "", greet_night: cols[4] || "", switch: cols[5] || "",
        wait_empty: cols[6] || "", wait_ready: cols[7] || "", work_start: cols[8] || "",
        subtask_clear: [cols[9], cols[11]].filter(Boolean).join('|') || "", 
        work_cheer: cols[10] || "", main_clear: cols[12] || "", all_clear: cols[13] || "", cancel: cols[14] || ""
      }
    };
  }
  if(Object.keys(db).length > 0) charDatabase = db;
}

function doLogin() { 
  playerName = document.getElementById('playerNameInput').value.trim() || "ゲスト"; 
  localStorage.setItem('oshi_player_name', playerName); 
  document.getElementById('loginModal').style.display = 'none'; 
  initApp(); 
}

function initApp() {
  document.getElementById('playerNameDisplay').innerText = playerName;
  document.getElementById('boardHeader').innerText = `📅 今日の予定（${dayNames[currentDay]}曜日）`;
  updateGoldUI();
  
  if (localStorage.getItem('oshi_last_login') !== todayStr) {
    gold += 50; localStorage.setItem('oshi_last_login', todayStr); updateGoldUI();
    setTimeout(() => alert('✨ ログインボーナス 50G をプレゼント🎁'), 500);
  }
  
  renderAll(); renderCalendar(); initGreeting();
}

// ==========================================
// 2. 音声・セリフ・表情 統合制御
// ==========================================
let blinkTimeout1 = null;
let blinkTimeout2 = null;
let revertExpressionTimer = null;

// 音声再生（デバッグログ追加版）
function playVoice(charId, triggerName, variationIndex) {
  if (isVoiceMuted) return;

  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    const audioUrl = `${VOICE_BASE_PATH}${charId}_${triggerName}_${variationIndex}${VOICE_EXT}`;
    
    // 【開発者用確認】F12キーの開発者ツールで、どのファイルを読み込みに行っているか確認できます
    console.log("🔊 ボイス再生リクエスト:", audioUrl);

    currentAudio = new Audio(audioUrl);
    const playPromise = currentAudio.play();
    
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        console.warn(`🔊 再生失敗 (${audioUrl}) - ファイルが存在しないか、ブラウザにブロックされました:`, e);
      });
    }
  } catch (err) {
    console.error("音声システムエラー:", err);
  }
}

function setExpression(state) {
  clearTimeout(blinkTimeout1); 
  clearTimeout(blinkTimeout2); 
  clearTimeout(revertExpressionTimer);

  const container = document.getElementById('charSpriteContainer');
  let imgEl = document.getElementById('charImg');
  let emojiEl = document.getElementById('charEmoji');
  
  if (!imgEl) {
    container.innerHTML = `
      <img id="charImg" style="width:100%; height:100%; object-fit:contain; filter: drop-shadow(0 5px 10px rgba(255,105,180,0.3)); display:none;">
      <span id="charEmoji" style="display:none; font-size:1em;"></span>
    `;
    imgEl = document.getElementById('charImg');
    emojiEl = document.getElementById('charEmoji');
  }

  const imgUrl = `${IMG_BASE_PATH}${currentCharId}_${state}.png`;
  const emoji = fallbackEmojis[(state - 1) % fallbackEmojis.length];

  if (imgStatus[imgUrl] === 'error') {
    imgEl.style.display = 'none';
    emojiEl.style.display = 'inline';
    emojiEl.innerText = emoji;
  } else {
    imgEl.onerror = function() {
      imgStatus[imgUrl] = 'error'; 
      this.style.display = 'none';
      emojiEl.style.display = 'inline';
      emojiEl.innerText = emoji;
    };
    imgEl.onload = function() {
      imgStatus[imgUrl] = 'ok';
      this.style.display = 'inline';
      emojiEl.style.display = 'none';
    };
    if (!imgEl.src.endsWith(imgUrl)) {
      imgEl.src = imgUrl;
    } else {
      imgEl.style.display = 'inline';
      emojiEl.style.display = 'none';
    }
  }

  if (state === 2) {
    startBlinking();
  } else if (state !== 3) {
    revertExpressionTimer = setTimeout(() => {
      setExpression(2);
    }, 5000);
  }
}

function startBlinking() {
  const blinkInterval = Math.random() * 2500 + 2000; 
  blinkTimeout1 = setTimeout(() => {
    const imgEl = document.getElementById('charImg');
    const emojiEl = document.getElementById('charEmoji');
    const url3 = `${IMG_BASE_PATH}${currentCharId}_3.png`;
    
    if (imgStatus[url3] === 'error') {
      if(imgEl) imgEl.style.display = 'none';
      if(emojiEl) { emojiEl.style.display = 'inline'; emojiEl.innerText = fallbackEmojis[2]; }
    } else {
      if(imgEl) { imgEl.src = url3; imgEl.style.display = 'inline'; }
      if(emojiEl) emojiEl.style.display = 'none';
    }
    
    blinkTimeout2 = setTimeout(() => {
      const url2 = `${IMG_BASE_PATH}${currentCharId}_2.png`;
      if (imgStatus[url2] === 'error') {
        if(imgEl) imgEl.style.display = 'none';
        if(emojiEl) { emojiEl.style.display = 'inline'; emojiEl.innerText = fallbackEmojis[1]; }
      } else {
        if(imgEl) { imgEl.src = url2; imgEl.style.display = 'inline'; }
        if(emojiEl) emojiEl.style.display = 'none';
      }
      startBlinking(); 
    }, 150);
  }, blinkInterval);
}

let typeTimer;
function typeDialogue(textTemplate, expressionState = 2, triggerName = null) {
  if(!textTemplate) return;
  
  setExpression(expressionState);
  
  const parts = textTemplate.split('|');
  const rIdx = Math.floor(Math.random() * parts.length);
  const text = parts[rIdx].replace(/{name}/g, playerName); 
  
  // 文字アニメーションより前に音声再生トリガーを呼ぶ
  if (triggerName) {
    playVoice(currentCharId, triggerName, rIdx);
  }
  
  const el = document.getElementById('dialogueText');
  el.innerHTML = ''; let i = 0; clearInterval(typeTimer);
  typeTimer = setInterval(() => { 
    if(i < text.length) {
      el.innerHTML += text.charAt(i); 
      i++; 
    } else {
      clearInterval(typeTimer); 
    }
  }, 50);
}

function initGreeting() {
  const hour = todayDate.getHours(); const d = charDatabase[currentCharId].dialogues;
  let text = ""; let trigger = "";
  
  if (hour >= 5 && hour < 11) { text = d.greet_morning; trigger = "greet_morning"; }
  else if (hour >= 11 && hour < 18) { text = d.greet_noon; trigger = "greet_noon"; }
  else { text = d.greet_night; trigger = "greet_night"; }
  
  typeDialogue(text, 1, trigger);
}

// ==========================================
// 3. UIのタブ・モーダル制御
// ==========================================
function switchTab(tabId, navElement) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active'); navElement.classList.add('active');
}

function openCharModal() {
  const list = document.getElementById('charListArea'); list.innerHTML = '';
  for (const [id, data] of Object.entries(charDatabase)) {
    const item = document.createElement('div'); item.className = 'char-item'; item.onclick = () => selectCharacter(id);
    const imgUrl = `${IMG_BASE_PATH}${id}_1.png`;
    
    item.innerHTML = `
      <div class="char-item-icon" style="width: 50px; height: 50px; flex-shrink: 0; display:flex; justify-content:center; align-items:center; overflow:hidden;">
        <img src="${imgUrl}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" style="width:100%; height:100%; object-fit:contain;">
        <span style="display:none; font-size:1.5em;">${fallbackEmojis[0]}</span>
      </div>
      <div class="char-item-name">${data.name} ${id === currentCharId ? '✅' : ''}</div>
    `;
    list.appendChild(item);
  }
  document.getElementById('charModal').style.display = 'flex';
}

function selectCharacter(id) {
  currentCharId = id; localStorage.setItem('oshi_char', id);
  document.getElementById('charModal').style.display = 'none';
  typeDialogue(charDatabase[id].dialogues.switch, 1, "switch");
}

function updateGoldUI() { document.getElementById('goldDisplay').innerText = `💖 ${gold}G`; localStorage.setItem('oshi_gold', gold); }
function drawGacha() {
  if (gold >= 100) {
    gold -= 100; updateGoldUI();
    alert(`ガチャを引きました！(UIモック)`);
    typeDialogue("「わぁ、これ欲しかったんだ！ありがとう！」", 4, "switch"); 
  } else { alert('Gが足りないみたい…予定をこなして集めよう！'); }
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid'); grid.innerHTML = '';
  const y = todayDate.getFullYear(); const m = todayDate.getMonth();
  document.getElementById('calMonthDisplay').innerText = `${y}年 ${m+1}月`;
  dayNames.forEach(d => { const h = document.createElement('div'); h.className = 'cal-header'; h.innerText = d; grid.appendChild(h); });
  
  const firstDay = new Date(y, m, 1).getDay(); const daysInMonth = new Date(y, m+1, 0).getDate(); const todayDateNum = todayDate.getDate();
  for(let i=0; i<firstDay; i++) { grid.appendChild(document.createElement('div')); }
  for(let d=1; d<=daysInMonth; d++) {
    const cell = document.createElement('div'); cell.className = 'cal-day';
    if(d === todayDateNum) cell.classList.add('today'); cell.innerText = d;
    if(completedDates.includes(new Date(y, m, d).toDateString())) { cell.innerHTML += `<div class="cal-stamp">💮</div>`; }
    grid.appendChild(cell);
  }
}

// ==========================================
// 4. 予定ボードと作成
// ==========================================
function renderAll() { initBoard(); renderEditList(); if(document.getElementById('subtaskInputsArea').children.length === 0) { addSubtaskField(''); addSubtaskField(''); } }
function initBoard() { const board = document.getElementById('corkboard'); board.innerHTML = ''; for (const [id, data] of Object.entries(questData)) { if (!data.days.includes(currentDay)) continue; const paper = document.createElement('div'); paper.className = 'quest-paper'; paper.innerHTML = `<span class="quest-emoji">${data.emoji || ''}</span>${data.title}`; paper.dataset.id = id; if(activeQuests.includes(id)) paper.style.display = 'none'; paper.addEventListener('pointerdown', handlePointerDown); board.appendChild(paper); } }
function addSubtaskField(val = '') { const area = document.getElementById('subtaskInputsArea'); const row = document.createElement('div'); row.className = 'subtask-row'; row.innerHTML = `<button class="btn-icon" onclick="moveSubtask(this, -1)">▲</button><button class="btn-icon" onclick="moveSubtask(this, 1)">▼</button><input type="text" class="input-text subtask-input" value="${val}" placeholder="リスト内容"><button class="btn-icon del" onclick="this.parentElement.remove()">×</button>`; area.appendChild(row); }
function moveSubtask(btn, dir) { const row = btn.closest('.subtask-row'); const parent = row.parentElement; if (dir === -1 && row.previousElementSibling) parent.insertBefore(row, row.previousElementSibling); else if (dir === 1 && row.nextElementSibling) parent.insertBefore(row.nextElementSibling, row); }
function cancelEdit() { document.getElementById('editQuestId').value = ''; document.getElementById('questTitleInput').value = ''; document.getElementById('questEmojiInput').value = ''; document.querySelectorAll('#daySelectors input').forEach(cb => cb.checked = false); document.getElementById('subtaskInputsArea').innerHTML = ''; addSubtaskField(''); addSubtaskField(''); document.getElementById('formHeader').innerText = '📝 予定を新しく作る'; document.getElementById('cancelEditBtn').style.display = 'none'; }
function saveQuest() { const idInput = document.getElementById('editQuestId').value; const title = document.getElementById('questTitleInput').value.trim(); const emoji = document.getElementById('questEmojiInput').value.trim(); const dayCheckboxes = document.querySelectorAll('#daySelectors input:checked'); const days = Array.from(dayCheckboxes).map(cb => parseInt(cb.value)); const subInputs = document.querySelectorAll('.subtask-input'); const subtasks = []; subInputs.forEach(input => { if(input.value.trim() !== '') subtasks.push(input.value.trim()); }); if(!title || days.length === 0 || subtasks.length === 0) { alert('入力漏れがあります'); return; } const newId = idInput ? idInput : 'custom_' + Date.now(); questData[newId] = { title: title, emoji: emoji, days: days, subtasks: subtasks }; cancelEdit(); renderAll(); alert('保存しました！'); }
function renderEditList() { const listArea = document.getElementById('editListArea'); listArea.innerHTML = ''; for (const [id, data] of Object.entries(questData)) { const item = document.createElement('div'); item.className = 'edit-item'; item.innerHTML = `<span>${data.emoji || ''} ${data.title}</span><div class="edit-actions"><button onclick="loadQuestForEdit('${id}')">編集</button><button style="color:var(--cancel); border-color:#ccc;" onclick="deleteQuest('${id}')">削除</button></div>`; listArea.appendChild(item); } }
function loadQuestForEdit(id) { const data = questData[id]; document.getElementById('editQuestId').value = id; document.getElementById('questTitleInput').value = data.title; document.getElementById('questEmojiInput').value = data.emoji || ''; document.querySelectorAll('#daySelectors input').forEach(cb => { cb.checked = data.days.includes(parseInt(cb.value)); }); document.getElementById('formHeader').innerText = '✏️ 予定を編集する'; document.getElementById('cancelEditBtn').style.display = 'inline-block'; const area = document.getElementById('subtaskInputsArea'); area.innerHTML = ''; data.subtasks.forEach(task => { addSubtaskField(task); }); document.querySelector('.issue-area').scrollTop = 0; }
function deleteQuest(id) { if(confirm(`「${questData[id].title}」を消してもいい？`)) { delete questData[id]; if(activeQuests.includes(id)) removeFromInbox(id); renderAll(); } }

// ==========================================
// 5. ドラッグ＆ドロップ制御
// ==========================================
let pressTimer; let isDragging = false; let clone = null; let dragSourceId = null;
function handlePointerDown(e) { if(e.pointerType === 'mouse' && e.button !== 0) return; const el = e.currentTarget; dragSourceId = el.dataset.id; el.setPointerCapture(e.pointerId); pressTimer = setTimeout(() => { isDragging = true; document.getElementById('inboxDrawer').classList.add('open'); clone = el.cloneNode(true); clone.className = 'quest-paper dragging-clone'; clone.style.left = (e.clientX - el.offsetWidth/2) + 'px'; clone.style.top = (e.clientY - el.offsetHeight/2) + 'px'; clone.style.width = el.offsetWidth + 'px'; document.body.appendChild(clone); el.style.opacity = '0.3'; window.addEventListener('pointermove', handlePointerMove); }, 400); el.addEventListener('pointerup', handlePointerUp, {once: true}); el.addEventListener('pointercancel', handlePointerUp, {once: true}); }
function handlePointerMove(e) { if (!isDragging || !clone) return; clone.style.left = (e.clientX - clone.offsetWidth/2) + 'px'; clone.style.top = (e.clientY - clone.offsetHeight/2) + 'px'; }
function handlePointerUp(e) { const el = e.currentTarget; clearTimeout(pressTimer); try { el.releasePointerCapture(e.pointerId); } catch(err){} window.removeEventListener('pointermove', handlePointerMove); if (isDragging) { isDragging = false; const drawerRect = document.getElementById('inboxDrawer').getBoundingClientRect(); if (e.clientY > drawerRect.top - 20) { addToInbox(dragSourceId); el.style.display = 'none'; } else { el.style.opacity = '1'; if(activeQuests.length === 0) document.getElementById('inboxDrawer').classList.remove('open'); } if(clone) { clone.remove(); clone = null; } } else { el.style.opacity = '1'; openModal(dragSourceId); } }
function addToInbox(id) { if (activeQuests.includes(id)) return; activeQuests.push(id); renderInbox(); }
function removeFromInbox(id) { activeQuests = activeQuests.filter(qId => qId !== id); renderInbox(); const paper = document.querySelector(`.quest-paper[data-id="${id}"]`); if(paper) { paper.style.display = 'block'; paper.style.opacity = '1'; } if(activeQuests.length === 0) document.getElementById('inboxDrawer').classList.remove('open'); }
function moveItem(id, dir) { const idx = activeQuests.indexOf(id); if (idx < 0) return; if (dir === -1 && idx > 0) { [activeQuests[idx - 1], activeQuests[idx]] = [activeQuests[idx], activeQuests[idx - 1]]; } else if (dir === 1 && idx < activeQuests.length - 1) { [activeQuests[idx], activeQuests[idx + 1]] = [activeQuests[idx + 1], activeQuests[idx]]; } renderInbox(); }
function renderInbox() { const container = document.getElementById('inboxItems'); container.innerHTML = ''; activeQuests.forEach((id, idx) => { const chip = document.createElement('div'); chip.className = 'inbox-chip'; const data = questData[id]; chip.innerHTML = `<span class="move-btn" onclick="moveItem('${id}', -1)">◀</span> ${data.emoji || ''} ${data.title} <span class="move-btn" onclick="moveItem('${id}', 1)">▶</span> <span class="del-btn" onclick="removeFromInbox('${id}')">×</span>`; container.appendChild(chip); }); }
function openModal(id) { const data = questData[id]; document.getElementById('modalTitle').innerText = `${data.emoji || ''} ${data.title}`; const list = document.getElementById('modalList'); list.innerHTML = ''; data.subtasks.forEach(task => { const li = document.createElement('li'); li.innerText = task; list.appendChild(li); }); document.getElementById('questModal').style.display = 'flex'; }
function closeModal() { document.getElementById('questModal').style.display = 'none'; }

// ==========================================
// 6. デート（タスク実行）ロジック
// ==========================================
function formatTime(sec) { const m = Math.floor(sec / 60).toString().padStart(2, '0'); const s = (sec % 60).toString().padStart(2, '0'); return `${m}:${s}`; }
function startOperations() {
  if(activeQuests.length === 0) return;
  activeOperations = activeQuests.map(id => { const data = questData[id]; return { id: id, title: data.title, emoji: data.emoji || '', subtasks: data.subtasks.map(t => ({ name: t, completed: false })), isRunning: false, time: 0, isCompleted: false, intervalId: null }; });
  document.getElementById('inboxDrawer').classList.remove('open'); document.getElementById('emptyState').style.display = 'none'; document.getElementById('activeTaskView').style.display = 'block'; document.getElementById('progressTrack').style.display = 'flex';
  updateCharacterAnimation(); renderDungeonTasks(); renderProgressBar(); switchTab('tab-home', document.getElementById('nav-home'));
}

function renderDungeonTasks() {
  const listEl = document.getElementById('taskList'); listEl.innerHTML = '';
  const sortedOps = [...activeOperations].sort((a, b) => (a.isCompleted ? 1 : 0) - (b.isCompleted ? 1 : 0));
  sortedOps.forEach(op => {
    const card = document.createElement('div'); card.className = 'mq-card' + (op.isCompleted ? ' completed' : '');
    let btnHtml = '';
    if (op.isCompleted) { btnHtml = `<button class="btn-action btn-completed-quest">クリア✨</button>`; }
    else {
      if (op.isRunning) btnHtml = `<button class="btn-action btn-stop-quest" onclick="toggleTimer('${op.id}')">休憩 ⏸</button>`;
      else btnHtml = `<button class="btn-action btn-start-quest" onclick="toggleTimer('${op.id}')">スタート ▶</button>`;
    }
    let subtasksHtml = op.subtasks.map((st, idx) => `<li class="subtask-item ${st.completed ? 'completed' : ''}" onclick="toggleSubtask('${op.id}', ${idx})"><div class="subtask-title-wrap"><div class="subtask-title">${st.name}</div></div><div class="checkbox">${st.completed ? '💖' : '🤍'}</div></li>`).join('');
    card.innerHTML = `<div class="mq-header"><div class="mq-title">${op.emoji} ${op.title}</div><div class="mq-controls"><div class="mq-timer" id="timer-${op.id}">${formatTime(op.time)}</div>${btnHtml}</div></div><ul class="mq-subtasks">${subtasksHtml}</ul>`;
    listEl.appendChild(card);
  });
}

function toggleTimer(opId) {
  const op = activeOperations.find(o => o.id === opId); if (!op || op.isCompleted) return;
  if (op.isRunning) { op.isRunning = false; clearInterval(op.intervalId); }
  else { op.isRunning = true; op.intervalId = setInterval(() => { op.time++; const timerEl = document.getElementById(`timer-${op.id}`); if(timerEl) timerEl.innerText = formatTime(op.time); }, 1000); }
  
  if (op.isRunning) {
    typeDialogue(charDatabase[currentCharId].dialogues.work_start, 5, "work_start");
  } else {
    typeDialogue(charDatabase[currentCharId].dialogues.wait_ready, 2, "wait_ready");
  }
  
  updateCharacterAnimation(true); 
  renderDungeonTasks();
}

function toggleSubtask(opId, subIdx) {
  const op = activeOperations.find(o => o.id === opId); if (!op) return;
  op.subtasks[subIdx].completed = !op.subtasks[subIdx].completed;
  const dialogs = charDatabase[currentCharId].dialogues;

  let isMainJustCompleted = false;

  const allDone = op.subtasks.every(st => st.completed);
  if (allDone && !op.isCompleted) {
    op.isCompleted = true;
    if (op.isRunning) { op.isRunning = false; clearInterval(op.intervalId); }
    if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
    isMainJustCompleted = true;
  } else if (!allDone && op.isCompleted) {
    op.isCompleted = false;
  }

  const isAllCompletedNow = activeOperations.length > 0 && activeOperations.every(o => o.isCompleted);

  if (isAllCompletedNow) {
    updateCharacterAnimation(false); 
  } else if (isMainJustCompleted) {
    typeDialogue(dialogs.main_clear, 5, "main_clear"); 
    updateCharacterAnimation(true); 
  } else {
    if (op.subtasks[subIdx].completed) {
      if (navigator.vibrate) navigator.vibrate(30);
      typeDialogue(dialogs.subtask_clear, 1, "subtask_clear");
    } else {
      typeDialogue(dialogs.cancel, 2, "cancel");
    }
    updateCharacterAnimation(true);
  }

  renderProgressBar(); renderDungeonTasks();
}

function renderProgressBar() {
  const track = document.getElementById('progressTrack'); track.innerHTML = '';
  let isFirstNode = true; let prevNodeCompleted = false;
  activeOperations.forEach(op => {
    op.subtasks.forEach((st, idx) => {
      if (!isFirstNode) { const line = document.createElement('div'); line.className = 'prog-line' + (prevNodeCompleted ? ' completed' : ''); track.appendChild(line); }
      const isLastSubtask = (idx === op.subtasks.length - 1);
      const node = document.createElement('div'); node.className = `prog-node ${isLastSubtask ? 'big' : 'small'} ${st.completed ? 'completed' : ''}`;
      track.appendChild(node);
      prevNodeCompleted = st.completed; isFirstNode = false;
    });
  });
}

function updateCharacterAnimation(skipDialogue = false) {
  const isAnyRunning = activeOperations.some(o => o.isRunning);
  const isAllCompleted = activeOperations.length > 0 && activeOperations.every(o => o.isCompleted);
  const charArea = document.getElementById('charArea');
  const dialogs = charDatabase[currentCharId].dialogues;
  
  // BGMの自動再生・停止制御
  if (isAnyRunning && !isAllCompleted && !isBgmMuted) {
    bgmAudio.play().catch(e => { console.warn("BGM再生ブロック:", e); });
  } else {
    bgmAudio.pause(); 
  }

  if (isAllCompleted) {
    charArea.classList.remove('working');
    
    if (localStorage.getItem('oshi_last_clear') !== todayStr) {
      localStorage.setItem('oshi_last_clear', todayStr);
      gold += 50; updateGoldUI();
      completedDates.push(todayStr);
      localStorage.setItem('oshi_completed_dates', JSON.stringify(completedDates));
      renderCalendar(); 
      setTimeout(() => alert('🎉 全予定達成ボーナス 50G をゲットしたよ！'), 1000);
    }

    if (!skipDialogue) {
      typeDialogue(dialogs.all_clear, 5, "all_clear"); 
    }
  } else if (isAnyRunning) {
    charArea.classList.add('working');
    if(!skipDialogue) typeDialogue(dialogs.work_cheer, 4, "work_cheer"); 
  } else {
    charArea.classList.remove('working');
    if(!skipDialogue) typeDialogue(dialogs.wait_ready, 2, "wait_ready"); 
  }
}