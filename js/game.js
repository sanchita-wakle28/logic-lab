// js/game.js
import {
  db, ref, set, get, update, remove, onValue, onDisconnect, off, ensureSignedIn
} from './firebase-config.js';

import {
  randomExpression, classify, parseExpression, evaluate, randomAssignment, formatEnv, getVariables
} from './logic-engine.js';

const $ = (id) => document.getElementById(id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function avatarColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 45%)`;
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = $(id);
  if (target) target.classList.add('active');
}

function setupSymbolButtons() {
  const input = $('customQuestionInput');
  if (!input) return;

  document.querySelectorAll('.btn-sym').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const sym = btn.dataset.sym;
      input.value = input.value.slice(0, start) + sym + input.value.slice(end);
      input.focus();
      input.selectionStart = input.selectionEnd = start + sym.length;
    };
  });
}

let uid = null;
let myName = '';
let roomCode = null;
let isHost = false;
let roomListenerRef = null;
let lastRenderedRound = -1;
let lastRenderedStatus = null;
let answeredThisRound = false;
let countdownRaf = null;
let hostTickTimer = null;
let hostWatchActive = false;
let revealAdvanceTimer = null;

const VAR_POOL = ['p', 'q', 'r', 's'];

function genEvaluateQuestion() {
  const numVars = 2 + Math.floor(Math.random() * 2);
  const vars = shuffle(VAR_POOL).slice(0, numVars);
  let expr;
  for (let attempt = 0; attempt < 6; attempt++) {
    expr = randomExpression(vars, Math.random() < 0.5 ? 2 : 3);
    try { parseExpression(expr); break; } catch (e) { /* retry */ }
  }
  const ast = parseExpression(expr);
  const assignment = randomAssignment(vars);
  const correct = evaluate(ast, assignment);
  return {
    type: 'evaluate',
    prompt: `Given ${formatEnv(assignment)} — is the formula below True or False?`,
    formula: expr,
    correctAnswer: correct ? 'true' : 'false',
    choices: ['true', 'false'],
  };
}

function genClassifyQuestion() {
  const numVars = 2 + Math.floor(Math.random() * 2);
  const vars = shuffle(VAR_POOL).slice(0, numVars);
  const expr = randomExpression(vars, Math.random() < 0.5 ? 2 : 3);
  const verdict = classify(expr);
  return {
    type: 'classify',
    prompt: 'Classify this formula:',
    formula: expr,
    correctAnswer: verdict,
    choices: ['Tautology', 'Contradiction', 'Contingency'],
  };
}

const QUANT_TEMPLATES = [
  { build: () => { const m = 2 + Math.floor(Math.random() * 4); return { src: x => x % m === 0, label: `x is divisible by ${m}` }; } },
  { build: () => { const k = -6 + Math.floor(Math.random() * 13); return { src: x => x > k, label: `x > ${k}` }; } },
  { build: () => { const k = -6 + Math.floor(Math.random() * 13); return { src: x => x < k, label: `x < ${k}` }; } },
  { build: () => { const k = 4 + Math.floor(Math.random() * 40); return { src: x => x * x <= k, label: `x² ≤ ${k}` }; } },
  { build: () => { const k = -8 + Math.floor(Math.random() * 17); return { src: x => x !== k, label: `x ≠ ${k}` }; } },
];

function genQuantifierQuestion() {
  const size = 4 + Math.floor(Math.random() * 4);
  const spread = 8 + Math.floor(Math.random() * 8);
  const base = -Math.floor(spread / 2) + Math.floor(Math.random() * 5);
  const domainSet = new Set();
  let guard = 0;
  while (domainSet.size < size && guard < 200) {
    domainSet.add(base + Math.floor(Math.random() * spread) - Math.floor(spread / 2));
    guard++;
  }
  const domain = Array.from(domainSet).sort((a, b) => a - b);
  const tpl = pick(QUANT_TEMPLATES).build();
  const quantifier = Math.random() < 0.5 ? 'forall' : 'exists';
  const evalArr = domain.map(x => tpl.src(x));
  const correct = quantifier === 'forall' ? evalArr.every(Boolean) : evalArr.some(Boolean);
  return {
    type: 'quantifier',
    prompt: `Domain D = {${domain.join(', ')}}\n\nP(x): ${tpl.label}`,
    formula: quantifier === 'forall' ? `∀ x ∈ D, P(x)` : `∃ x ∈ D, P(x)`,
    correctAnswer: correct ? 'true' : 'false',
    choices: ['true', 'false'],
  };
}

function generateQuestion() {
  const generators = [genEvaluateQuestion, genClassifyQuestion, genQuantifierQuestion];
  return pick(generators)();
}

function buildCustomQuestion(formula) {
  try {
    const ast = parseExpression(formula);
    const vars = getVariables(ast);
    const assignment = randomAssignment(vars);
    const correct = evaluate(ast, assignment);
    return {
      type: 'evaluate',
      prompt: `Given ${formatEnv(assignment)} — is the formula below True or False?`,
      formula: formula,
      correctAnswer: correct ? 'true' : 'false',
      choices: ['true', 'false'],
    };
  } catch (err) {
    console.warn('Malformed custom formula:', formula, err);
    return generateQuestion();
  }
}

function getQuestionForRound(customQueue, roundIndex) {
  if (customQueue && Array.isArray(customQueue) && roundIndex < customQueue.length) {
    return buildCustomQuestion(customQueue[roundIndex]);
  }
  return generateQuestion();
}

(async function init() {
  try {
    uid = await ensureSignedIn();
  } catch (e) {
    toast('Could not connect — check your internet connection.');
    console.error(e);
  }
})();

$('createRoomBtn').addEventListener('click', async () => {
  if (!(await requireNameAndAuth())) return;
  const code = randRoomCode();
  const roomRef = ref(db, `rooms/${code}`);
  await set(roomRef, {
    createdAt: Date.now(),
    hostId: uid,
    status: 'lobby',
    round: 0,
    settings: { rounds: 8, seconds: 20 },
    players: {
      [uid]: { name: myName, score: 0, connected: true, joinedAt: Date.now() },
    },
  });
  onDisconnect(ref(db, `rooms/${code}/players/${uid}/connected`)).set(false);
  roomCode = code;
  isHost = true;
  enterRoom();
});

$('joinRoomBtn').addEventListener('click', async () => {
  if (!(await requireNameAndAuth())) return;
  const code = $('joinCodeInput').value.trim().toUpperCase();
  if (!code) { showHomeError('Enter a room code.'); return; }
  const snap = await get(ref(db, `rooms/${code}`));
  if (!snap.exists()) { showHomeError('No room with that code.'); return; }
  const room = snap.val();
  if (room.status !== 'lobby') { showHomeError('That game has already started.'); return; }
  const playerCount = room.players ? Object.keys(room.players).length : 0;
  if (playerCount >= 8) { showHomeError('That room is full (8 players max).'); return; }
  await update(ref(db, `rooms/${code}/players/${uid}`), {
    name: myName, score: 0, connected: true, joinedAt: Date.now(),
  });
  onDisconnect(ref(db, `rooms/${code}/players/${uid}/connected`)).set(false);
  roomCode = code;
  isHost = room.hostId === uid;
  enterRoom();
});

async function requireNameAndAuth() {
  myName = $('nameInput').value.trim();
  if (!myName) { showHomeError('Enter a display name first.'); return false; }
  if (!uid) {
    try { uid = await ensureSignedIn(); } catch (e) { showHomeError('Could not connect to the server.'); return false; }
  }
  return true;
}

function showHomeError(msg) {
  const el = $('homeError');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function enterRoom() {
  $('roomCodeDisplay').textContent = roomCode;
  roomListenerRef = ref(db, `rooms/${roomCode}`);
  onValue(roomListenerRef, (snap) => {
    const room = snap.val();
    if (!room) { toast('The room was closed.'); leaveRoom(); return; }
    isHost = room.hostId === uid;
    renderRoom(room);
  });
}

function leaveRoom() {
  if (roomListenerRef) off(roomListenerRef);
  if (roomCode && uid) remove(ref(db, `rooms/${roomCode}/players/${uid}`)).catch(() => {});
  roomCode = null; isHost = false; lastRenderedRound = -1; lastRenderedStatus = null;
  cancelAnimationFrame(countdownRaf);
  clearInterval(hostTickTimer);
  hostWatchActive = false;
  clearTimeout(revealAdvanceTimer);
  showScreen('screenHome');
}

$('leaveLobbyBtn').addEventListener('click', leaveRoom);

function renderRoom(room) {
  if (room.status === 'lobby') { showScreen('screenLobby'); renderLobby(room); }
  else if (room.status === 'playing' || room.status === 'reveal') { showScreen('screenPlaying'); renderPlaying(room); }
  else if (room.status === 'finished') { showScreen('screenResults'); renderResults(room); }
}

function renderLobby(room) {
  const players = room.players || {};
  const list = $('lobbyPlayerList');
  list.innerHTML = Object.entries(players).map(([id, p]) => `
    <div class="player-chip">
      <span class="avatar" style="background:${avatarColor(p.name || id)}">${(p.name || '?').slice(0, 1).toUpperCase()}</span>
      <span>${p.name}${p.connected === false ? ' <span class="muted">(offline)</span>' : ''}</span>
      ${id === room.hostId ? '<span class="host-tag">HOST</span>' : ''}
    </div>`).join('');
  const connectedCount = Object.values(players).filter(p => p.connected !== false).length;
  $('lobbyHint').textContent = `${connectedCount} connected`;
  $('hostControls').classList.toggle('hidden', !isHost);$('guestWaiting').classList.toggle('hidden', isHost);
  if (isHost) {
    $('startGameBtn').disabled = connectedCount < 2;
    $('hostNote').textContent = connectedCount < 2
      ? 'Need at least 2 players connected to start.'
      : `Ready — ${connectedCount} players will compete.`;
  }
  setupSymbolButtons();
}

$('startGameBtn').addEventListener('click', async () => {
  const seconds = Math.max(8, Math.min(60, parseInt($('secondsInput').value, 10) || 20));

  const customInputEl = $('customQuestionInput');
  const rawCustom = customInputEl ? customInputEl.value.trim() : '';

  // Parse lines or comma-separated formulas into array
  const customQueue = rawCustom
    ? rawCustom.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
    : [];

  let roundsInput = parseInt($('roundsInput').value, 10) || 8;
  const rounds = customQueue.length > 0 ? Math.max(roundsInput, customQueue.length) : roundsInput;

  const firstQuestion = getQuestionForRound(customQueue, 0);

  await update(ref(db, `rooms/${roomCode}`), {
    status: 'playing',
    round: 1,
    customQueue: customQueue,
    settings: { rounds, seconds },
    question: { ...firstQuestion, startedAt: Date.now(), seconds, processed: false },
    answers: null,
  });

  startHostRoundWatch(seconds);
});

function renderPlaying(room) {
  const q = room.question;
  if (!q) return;
  $('roundPill').textContent = `Round ${room.round} / ${room.settings.rounds}`;
  $('typePill').textContent = { evaluate: 'Evaluate', classify: 'Classify', quantifier: 'Quantifier' }[q.type] || q.type;
  if (room.round !== lastRenderedRound || room.status !== lastRenderedStatus) {
    lastRenderedRound = room.round;
    lastRenderedStatus = room.status;
    answeredThisRound = false;
    $('questionPrompt').textContent = q.prompt;
    $('questionFormula').textContent = q.formula;
    renderAnswerGrid(q);
    $('answeredNote').textContent = '';$('revealBanner').className = 'reveal-banner';
  }
  renderScoreboard(room, 'playScoreboard');
  runCountdown(q.startedAt, q.seconds);
  if (room.status === 'reveal') {
    renderReveal(room);
  }
  if (isHost) maybeHostAdvance(room);
}

function renderAnswerGrid(q) {
  const grid = $('answerGrid');
  grid.className = 'answer-grid' + (q.choices.length > 2 ? ' three' : '');
  grid.innerHTML = q.choices.map(choice => {
    const label = (choice === 'true') ? 'True' : (choice === 'false') ? 'False' : choice;
    const cls = choice === 'true' ? 'btn-true' : choice === 'false' ? 'btn-false' : 'btn-ghost';
    return `<button class="btn ${cls} answer-btn" data-choice="${choice}">${label}</button>`;
  }).join('');
  grid.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => submitAnswer(btn.dataset.choice, grid));
  });
}

async function submitAnswer(choice, grid) {
  if (answeredThisRound) return;
  answeredThisRound = true;
  grid.querySelectorAll('button').forEach(b => b.disabled = true);
  $('answeredNote').textContent = 'Answer locked in — waiting for round to end...';
  const room = (await get(ref(db, `rooms/${roomCode}`))).val();
  await set(ref(db, `rooms/${roomCode}/answers/${room.round}/${uid}`), {
    value: choice, answeredAt: Date.now(),
  });
}

function runCountdown(startedAt, seconds) {
  cancelAnimationFrame(countdownRaf);
  const fill = $('timerFill');
  function tick() {
    const elapsed = Date.now() - startedAt;
    const frac = Math.max(0, 1 - elapsed / (seconds * 1000));
    fill.style.width = `${frac * 100}%`;
    fill.style.background = frac < 0.25
      ? 'var(--false)'
      : 'linear-gradient(90deg, var(--true), var(--accent))';
    if (frac > 0) countdownRaf = requestAnimationFrame(tick);
  }
  tick();
}

function renderScoreboard(room, targetId) {
  const players = Object.entries(room.players || {}).map(([id, p]) => ({ id, ...p }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));
  const el = $(targetId);
  el.innerHTML = players.map((p, i) => `
    <div class="score-row ${p.id === uid ? 'me' : ''}">
      <span class="rank">${i + 1}</span>
      <span class="name">${p.name}</span>
      <span class="pts">${p.score || 0}</span>
    </div>`).join('');
}

function renderReveal(room) {
  const q = room.question;
  const myAnswer = room.answers && room.answers[room.round] && room.answers[room.round][uid];
  const banner = $('revealBanner');
  const correctLabel = q.type === 'classify' ? q.correctAnswer : (q.correctAnswer === 'true' ? 'True' : 'False');
  if (myAnswer) {
    const wasCorrect = myAnswer.value === q.correctAnswer;
    banner.className = 'reveal-banner show ' + (wasCorrect ? 'correct' : 'incorrect');
    banner.textContent = wasCorrect
      ? `Correct! The answer was ${correctLabel}.`
      : `Not quite — the correct answer was ${correctLabel}.`;
  } else {
    banner.className = 'reveal-banner show incorrect';
    banner.textContent = `Time's up — the correct answer was ${correctLabel}.`;
  }
}

function startHostRoundWatch(seconds) {
  clearInterval(hostTickTimer);
  hostWatchActive = true;
  hostTickTimer = setInterval(async () => {
    const snap = await get(ref(db, `rooms/${roomCode}`));
    const room = snap.val();
    if (!room || room.status !== 'playing') { clearInterval(hostTickTimer); hostWatchActive = false; return; }
    const elapsed = Date.now() - room.question.startedAt;
    if (elapsed >= room.question.seconds * 1000) {
      clearInterval(hostTickTimer);
      hostWatchActive = false;
      await closeRound(room);
    }
  }, 400);
}

async function closeRound(room) {
  const roundAnswers = (room.answers && room.answers[room.round]) || {};
  const players = room.players || {};
  const updates = {};
  Object.entries(roundAnswers).forEach(([pid, ans]) => {
    if (ans.value === room.question.correctAnswer) {
      const timeMs = Math.max(0, ans.answeredAt - room.question.startedAt);
      const frac = Math.max(0, 1 - timeMs / (room.question.seconds * 1000));
      const points = 100 + Math.round(frac * 50);
      const prevScore = (players[pid] && players[pid].score) || 0;
      updates[`players/${pid}/score`] = prevScore + points;
    }
  });
  updates['status'] = 'reveal';
  await update(ref(db, `rooms/${roomCode}`), updates);
  revealAdvanceTimer = setTimeout(async () => {
    const fresh = (await get(ref(db, `rooms/${roomCode}`))).val();
    if (!fresh) return;
    if (fresh.round >= fresh.settings.rounds) {
      await update(ref(db, `rooms/${roomCode}`), { status: 'finished' });
    } else {
      const nextQ = getQuestionForRound(fresh.customQueue, fresh.round);
      await update(ref(db, `rooms/${roomCode}`), {
        status: 'playing',
        round: fresh.round + 1,
        question: { ...nextQ, startedAt: Date.now(), seconds: fresh.settings.seconds, processed: false },
        [`answers/${fresh.round + 1}`]: null,
      });
      startHostRoundWatch(fresh.settings.seconds);
    }
  }, 4000);
}

function maybeHostAdvance(room) {
  if (room.status === 'playing' && !hostWatchActive) {
    startHostRoundWatch(room.question.seconds);
  }
}

function renderResults(room) {
  clearInterval(hostTickTimer);
  const players = Object.entries(room.players || {}).map(([id, p]) => ({ id, ...p }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));
  const medals = ['🥇', '🥈', '🥉'];
  $('resultsList').innerHTML = players.map((p, i) => `
    <div class="score-row ${p.id === uid ? 'me' : ''}">
      <span class="rank">${medals[i] ? `<span class="podium-emoji">${medals[i]}</span>` : i + 1}</span>
      <span class="name">${p.name}</span>
      <span class="pts">${p.score || 0} pts</span>
    </div>`).join('');
}