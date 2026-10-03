import { generateDetailedTruthTable, classify } from './logic-engine.js';

// --- 1. Load Quiz Dataset from Local JSON ---
let QUIZ_BANK = [];
let quizOrder = [];
let quizIndex = 0;

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadPropositionsJSON() {
  const el = document.getElementById('quizItem');
  if (el) el.innerHTML = '<p class="muted">Loading proposition dataset...</p>';

  try {
    const response = await fetch('./data/propositions.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    QUIZ_BANK = await response.json();
    if (!QUIZ_BANK.length) throw new Error('JSON file is empty.');

    quizOrder = shuffledIndices(QUIZ_BANK.length);
    quizIndex = 0;
    renderQuizItem();
  } catch (err) {
    console.error('Failed to load propositions.json:', err);
    if (el) {
      el.innerHTML = `<p class="val-false">Unable to load <code>data/propositions.json</code>. Ensure you are running a local HTTP server.</p>`;
    }
  }
}

function renderQuizItem() {
  if (!QUIZ_BANK.length) return;

  // Re-shuffle when questions run out for endless practice
  if (quizIndex >= quizOrder.length) {
    quizOrder = shuffledIndices(QUIZ_BANK.length);
    quizIndex = 0;
  }

  const item = QUIZ_BANK[quizOrder[quizIndex]];
  const el = document.getElementById('quizItem');
  if (!el) return;

  el.innerHTML = `
    <p style="margin-bottom:12px; font-size:1.1rem; color: var(--text); font-weight: 500;">"${item.text}"</p>
    <div class="quiz-options" style="display:flex; gap:10px; margin-top:10px;">
      <button class="btn btn-true" data-ans="true">✓ Is a Proposition</button>
      <button class="btn btn-false" data-ans="false">✗ NOT a Proposition</button>
    </div>
    <div class="quiz-feedback" id="quizFeedback" style="margin-top:12px; min-height:1.5em;"></div>
  `;

  el.querySelectorAll('.quiz-options button').forEach(btn => {
    btn.addEventListener('click', () => {
      const guess = btn.dataset.ans === 'true';
      const correct = guess === item.isProp;
      const fb = document.getElementById('quizFeedback');
      fb.innerHTML = correct
        ? `<span class="val-true" style="font-weight:600;">✓ Correct!</span> ${item.why}`
        : `<span class="val-false" style="font-weight:600;">✗ Not quite.</span> ${item.why}`;
      el.querySelectorAll('.quiz-options button').forEach(b => b.disabled = true);
    });
  });
}

const quizNextBtn = document.getElementById('quizNext');
if (quizNextBtn) {
  quizNextBtn.addEventListener('click', () => {
    quizIndex++;
    renderQuizItem();
  });
}

// Initial fetch on page load
loadPropositionsJSON();

// --- 2. Live Detailed Truth-Table Builder ---
const exprInput = document.getElementById('exprInput');
const exprError = document.getElementById('exprError');
const verdictPill = document.getElementById('verdictPill');
const truthTable = document.getElementById('truthTable');

function renderTruthTable() {
  if (!exprInput || !truthTable) return;
  const expr = exprInput.value.trim();
  if (exprError) exprError.classList.add('hidden');

  if (!expr) {
    truthTable.innerHTML = '';
    if (verdictPill) verdictPill.textContent = '';
    return;
  }

  try {
    const { vars, intermediateExprs, rows } = generateDetailedTruthTable(expr);
    if (!vars.length) throw new Error('Add at least one variable (e.g. p, q).');

    let html = '<thead><tr>';
    vars.forEach(v => html += `<th>${v}</th>`);
    intermediateExprs.forEach(item => {
      if (item.str !== expr) {
        html += `<th style="color:var(--accent-bright);">${item.str}</th>`;
      }
    });
    html += `<th class="sym">${expr}</th></tr></thead><tbody>`;

    rows.forEach(r => {
      html += '<tr>';
      vars.forEach(v => {
        html += `<td class="${r.env[v] ? 'val-true' : 'val-false'}">${r.env[v] ? 'T' : 'F'}</td>`;
      });
      intermediateExprs.forEach(item => {
        if (item.str !== expr) {
          const val = r.subResults[item.str];
          html += `<td class="${val ? 'val-true' : 'val-false'}">${val ? 'T' : 'F'}</td>`;
        }
      });
      html += `<td class="result-col ${r.result ? 'val-true' : 'val-false'}">${r.result ? 'T' : 'F'}</td></tr>`;
    });

    html += '</tbody>';
    truthTable.innerHTML = html;

    const verdict = classify(expr);
    if (verdictPill) {
      verdictPill.textContent = verdict;
      verdictPill.style.color = verdict === 'Contradiction' ? 'var(--false)' : (verdict === 'Tautology' ? 'var(--true)' : 'var(--accent-bright)');
    }
  } catch (e) {
    truthTable.innerHTML = '';
    if (verdictPill) verdictPill.textContent = '';
    if (exprError) {
      exprError.textContent = e.message;
      exprError.classList.remove('hidden');
    }
  }
}

let debounceTimer;
if (exprInput) {
  exprInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderTruthTable, 150);
  });
}

document.querySelectorAll('.quick-syms button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!exprInput) return;
    const start = exprInput.selectionStart ?? exprInput.value.length;
    const end = exprInput.selectionEnd ?? exprInput.value.length;
    const sym = btn.dataset.sym;
    exprInput.value = exprInput.value.slice(0, start) + sym + exprInput.value.slice(end);
    exprInput.focus();
    exprInput.selectionStart = exprInput.selectionEnd = start + sym.length;
    renderTruthTable();
  });
});

renderTruthTable();

// --- 3. Predicates & Quantifiers ---
const domainInput = document.getElementById('domainInput');
const predicateInput = document.getElementById('predicateInput');
const predError = document.getElementById('predError');
const domainListEl = document.getElementById('domainList');
const forallEl = document.getElementById('forallResult');
const existsEl = document.getElementById('existsResult');

const MAX_DOMAIN_SIZE = 60;
const SAFE_PREDICATE_RE = /^[0-9x\s+\-*/%()<>=!&|.]+$/;

function parseDomain(text) {
  text = text.trim();
  if (!text) return [];
  if (text.includes('..')) {
    const [a, b] = text.split('..').map(s => parseInt(s.trim(), 10));
    if (Number.isNaN(a) || Number.isNaN(b)) throw new Error('Range must look like -5..5');
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (hi - lo + 1 > MAX_DOMAIN_SIZE) throw new Error(`Range too large — keep under ${MAX_DOMAIN_SIZE}.`);
    const out = [];
    for (let i = lo; i <= hi; i++) out.push(i);
    return out;
  }
  return text.split(',').map(s => {
    const n = Number(s.trim());
    if (Number.isNaN(n)) throw new Error(`"${s.trim()}" is not a number.`);
    return n;
  }).slice(0, MAX_DOMAIN_SIZE);
}

function evaluatePredicate(predSrc, x) {
  if (!SAFE_PREDICATE_RE.test(predSrc)) {
    throw new Error('Only numbers, x, spaces and basic operators allowed.');
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function('x', `"use strict"; return Boolean(${predSrc});`);
  return fn(x);
}

function renderQuantifiers() {
  if (!domainInput || !predicateInput || !domainListEl || !forallEl || !existsEl) return;
  if (predError) predError.classList.add('hidden');
  let domain, predSrc = predicateInput.value.trim();

  try {
    domain = parseDomain(domainInput.value);
  } catch (e) {
    domainListEl.innerHTML = '';
    if (predError) {
      predError.textContent = e.message;
      predError.classList.remove('hidden');
    }
    return;
  }

  if (!predSrc) { domainListEl.innerHTML = ''; return; }

  let results;
  try {
    results = domain.map(x => ({ x, val: evaluatePredicate(predSrc, x) }));
  } catch (e) {
    if (predError) {
      predError.textContent = e.message;
      predError.classList.remove('hidden');
    }
    return;
  }

  domainListEl.innerHTML = results.map(r =>
    `<span class="domain-chip">x=${r.x} <span class="${r.val ? 'val-true' : 'val-false'}">${r.val ? 'T' : 'F'}</span></span>`
  ).join('');

  const allTrue = results.every(r => r.val);
  const counterexample = results.find(r => !r.val);
  forallEl.innerHTML = `
    <h4>∀ x ∈ D, P(x) — ${allTrue ? '<span class="val-true">True</span>' : '<span class="val-false">False</span>'}</h4>
    <p style="margin:0; font-size:.9rem;">${allTrue
      ? 'Every element satisfies P(x).'
      : `Counterexample: P(${counterexample.x}) is false.`}</p>`;

  const anyTrue = results.some(r => r.val);
  const witness = results.find(r => r.val);
  existsEl.innerHTML = `
    <h4>∃ x ∈ D, P(x) — ${anyTrue ? '<span class="val-true">True</span>' : '<span class="val-false">False</span>'}</h4>
    <p style="margin:0; font-size:.9rem;">${anyTrue
      ? `Witness: P(${witness.x}) is true.`
      : 'No element satisfies P(x).'}</p>`;
}

[domainInput, predicateInput].forEach(el => {
  if (el) {
    el.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderQuantifiers, 150);
    });
  }
});

renderQuantifiers();