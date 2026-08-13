import { TYPE_CHART, TYPE_IDS, TYPES, effectiveness, typeById } from './chart-data.js';

const STORAGE_KEY = 'typewise-progress-v1';
const TOTAL_MATCHUPS = TYPE_IDS.length * TYPE_IDS.length;
const VALID_VALUES = [0, 0.5, 1, 2];
const VALUE_LABELS = new Map([
  [0, '×0'],
  [0.5, '×½'],
  [1, '×1'],
  [2, '×2'],
]);

const VALUE_PHRASES = new Map([
  [0, 'has no effect on'],
  [0.5, 'is not very effective against'],
  [1, 'deals neutral damage to'],
  [2, 'is super effective against'],
]);

const QUIZ_POOL = Object.fromEntries(
  VALID_VALUES.map((value) => [
    value,
    TYPE_IDS.flatMap((attack) =>
      TYPE_IDS.filter((defense) => effectiveness(attack, defense) === value).map((defense) => ({
        attack,
        defense,
      })),
    ),
  ]),
);

const defaultSession = () => ({
  answers: {},
  checked: false,
  reveal: false,
  review: false,
});

const defaultState = () => ({
  view: 'chart',
  mode: 'practice',
  selected: 1,
  mobileAttack: 'normal',
  sessions: {
    practice: defaultSession(),
    test: defaultSession(),
  },
  quick: {
    question: null,
    answer: null,
    correct: 0,
    total: 0,
    streak: 0,
    best: 0,
  },
});

const elements = {
  chartPanel: document.querySelector('#chart-panel'),
  quickPanel: document.querySelector('#quick-panel'),
  viewTabs: [...document.querySelectorAll('.view-tab')],
  modeButtons: [...document.querySelectorAll('[data-mode]')],
  modeDescription: document.querySelector('#mode-description'),
  palette: [...document.querySelectorAll('.answer-choice')],
  typeChart: document.querySelector('#type-chart'),
  mobileAttacker: document.querySelector('#mobile-attacker'),
  mobileGrid: document.querySelector('#mobile-defender-grid'),
  pickerIcon: document.querySelector('#picker-icon'),
  mobileRowLabel: document.querySelector('#mobile-row-label'),
  mobileRowCount: document.querySelector('#mobile-row-count'),
  checkAnswers: document.querySelector('#check-answers'),
  revealChart: document.querySelector('#reveal-chart'),
  resetChart: document.querySelector('#reset-chart'),
  answeredStat: document.querySelector('#answered-stat'),
  accuracyStat: document.querySelector('#accuracy-stat'),
  rowsStat: document.querySelector('#rows-stat'),
  progressPercent: document.querySelector('#progress-percent'),
  progressFill: document.querySelector('#progress-fill'),
  prompt: document.querySelector('#matchup-prompt'),
  results: document.querySelector('#results-panel'),
  quickMatchup: document.querySelector('#quick-matchup'),
  quickOptions: document.querySelector('#quick-options'),
  quickFeedback: document.querySelector('#quick-feedback'),
  skipQuestion: document.querySelector('#skip-question'),
  resetQuick: document.querySelector('#reset-quick'),
  quickCorrect: document.querySelector('#quick-correct'),
  quickTotal: document.querySelector('#quick-total'),
  quickStreak: document.querySelector('#quick-streak'),
  quickBest: document.querySelector('#quick-best'),
  quickScorePercent: document.querySelector('#quick-score-percent'),
  scoreRing: document.querySelector('#score-ring'),
  dialog: document.querySelector('#confirm-dialog'),
  dialogTitle: document.querySelector('#dialog-title'),
  dialogCopy: document.querySelector('#dialog-copy'),
  confirmReset: document.querySelector('#confirm-reset'),
  liveRegion: document.querySelector('#live-region'),
  saveStatus: document.querySelector('#save-status'),
};

let state = loadState();
let resetTarget = 'chart';
let saveStatusTimer;

function cellKey(attack, defense) {
  return `${attack}|${defense}`;
}

function formatMultiplier(value) {
  return VALUE_LABELS.get(Number(value)) ?? '';
}

function hasAnswer(answers, key) {
  return Object.prototype.hasOwnProperty.call(answers, key);
}

function currentSession() {
  return state.sessions[state.mode];
}

function isType(id) {
  return TYPE_IDS.includes(id);
}

function sanitizeAnswers(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== 'object') return {};
  return Object.fromEntries(
    Object.entries(rawAnswers).filter(([key, value]) => {
      const [attack, defense, extra] = key.split('|');
      return !extra && isType(attack) && isType(defense) && VALID_VALUES.includes(Number(value));
    }).map(([key, value]) => [key, Number(value)]),
  );
}

function sanitizeSession(rawSession) {
  return {
    answers: sanitizeAnswers(rawSession?.answers),
    checked: Boolean(rawSession?.checked),
    reveal: Boolean(rawSession?.reveal),
    review: Boolean(rawSession?.review),
  };
}

function sanitizeQuick(rawQuick) {
  const question = rawQuick?.question;
  const validQuestion = question && isType(question.attack) && isType(question.defense)
    ? { attack: question.attack, defense: question.defense }
    : null;
  const rawAnswer = rawQuick?.answer;
  return {
    question: validQuestion,
    answer: rawAnswer === null || rawAnswer === undefined || !VALID_VALUES.includes(Number(rawAnswer))
      ? null
      : Number(rawAnswer),
    correct: Math.max(0, Number.parseInt(rawQuick?.correct, 10) || 0),
    total: Math.max(0, Number.parseInt(rawQuick?.total, 10) || 0),
    streak: Math.max(0, Number.parseInt(rawQuick?.streak, 10) || 0),
    best: Math.max(0, Number.parseInt(rawQuick?.best, 10) || 0),
  };
}

function loadState() {
  const fallback = defaultState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== 'object') return fallback;

    return {
      view: ['chart', 'quick'].includes(raw.view) ? raw.view : fallback.view,
      mode: ['practice', 'test'].includes(raw.mode) ? raw.mode : fallback.mode,
      selected: VALID_VALUES.includes(Number(raw.selected)) ? Number(raw.selected) : fallback.selected,
      mobileAttack: isType(raw.mobileAttack) ? raw.mobileAttack : fallback.mobileAttack,
      sessions: {
        practice: sanitizeSession(raw.sessions?.practice),
        test: sanitizeSession(raw.sessions?.test),
      },
      quick: sanitizeQuick(raw.quick),
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    elements.saveStatus.textContent = 'Saving…';
    window.clearTimeout(saveStatusTimer);
    saveStatusTimer = window.setTimeout(() => {
      elements.saveStatus.textContent = 'Saved locally';
    }, 450);
  } catch {
    elements.saveStatus.textContent = 'Could not save';
  }
}

function announce(message) {
  elements.liveRegion.textContent = '';
  window.setTimeout(() => {
    elements.liveRegion.textContent = message;
  }, 30);
}

function typeStyle(type) {
  return `--type-color:${type.color};--type-ink:${type.ink}`;
}

function typeIconMarkup(type, className = 'type-icon') {
  return `<img class="${className}" src="${type.icon}" alt="" aria-hidden="true" />`;
}

function renderDesktopChart() {
  const headers = TYPES.map((type) => `
    <th
      class="type-col-head"
      scope="col"
      data-defense-header="${type.id}"
      style="${typeStyle(type)}"
      title="Defending ${type.name} type"
    >
      <span class="type-col-inner">
        ${typeIconMarkup(type)}
        <span class="sr-only">Defending ${type.name}</span>
      </span>
    </th>
  `).join('');

  const rows = TYPES.map((attackType, attackIndex) => {
    const cells = TYPES.map((defenseType, defenseIndex) => `
      <td data-axis-attack="${attackType.id}" data-axis-defense="${defenseType.id}">
        <button
          class="chart-cell matchup-input"
          type="button"
          tabindex="${attackIndex === 0 && defenseIndex === 0 ? '0' : '-1'}"
          data-attack="${attackType.id}"
          data-defense="${defenseType.id}"
          aria-label="${attackType.name} attacking ${defenseType.name}, unanswered"
        ><span class="cell-value" aria-hidden="true"></span></button>
      </td>
    `).join('');

    return `
      <tr data-row="${attackType.id}">
        <th class="type-row-head" scope="row" data-attack-header="${attackType.id}" style="${typeStyle(attackType)}">
          <span class="row-type-label">
            ${typeIconMarkup(attackType)}
            <span>${attackType.name}</span>
          </span>
        </th>
        ${cells}
      </tr>
    `;
  }).join('');

  elements.typeChart.innerHTML = `
    <thead>
      <tr>
        <th class="corner-cell" scope="col">
          <span class="corner-directions">
            <span>DEFEND <b aria-hidden="true">→</b></span>
            <span>ATTACK <b aria-hidden="true">↓</b></span>
          </span>
        </th>
        ${headers}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderMobileSelector() {
  elements.mobileAttacker.innerHTML = TYPES.map(
    (type) => `<option value="${type.id}">${type.name}</option>`,
  ).join('');
  elements.mobileAttacker.value = state.mobileAttack;
  renderMobileRow();
}

function renderMobileRow() {
  const attackType = typeById(state.mobileAttack);
  elements.pickerIcon.src = attackType.icon;
  elements.mobileRowLabel.textContent = `${attackType.name} row`;

  elements.mobileGrid.innerHTML = TYPES.map((defenseType) => `
    <button
      class="defender-cell matchup-input"
      type="button"
      data-attack="${attackType.id}"
      data-defense="${defenseType.id}"
      style="${typeStyle(defenseType)}"
      aria-label="${attackType.name} attacking ${defenseType.name}, unanswered"
    >
      ${typeIconMarkup(defenseType)}
      <span class="defender-name">${defenseType.name}</span>
      <span class="defender-answer" aria-hidden="true">·</span>
    </button>
  `).join('');
}

function selectMultiplier(value, shouldAnnounce = true) {
  state.selected = Number(value);
  elements.palette.forEach((button) => {
    const active = Number(button.dataset.value) === state.selected;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  saveState();
  if (shouldAnnounce) announce(`${formatMultiplier(state.selected)} selected.`);
}

function setView(view, { focusPanel = false } = {}) {
  state.view = view;
  const isChart = view === 'chart';
  elements.chartPanel.hidden = !isChart;
  elements.quickPanel.hidden = isChart;
  elements.viewTabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  saveState();

  if (!isChart) renderQuick();
  if (focusPanel) {
    const target = isChart ? elements.chartPanel : elements.quickPanel;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}

function setMode(mode) {
  state.mode = mode;
  elements.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  elements.modeDescription.textContent = mode === 'practice'
    ? 'See feedback as you answer.'
    : 'Feedback stays hidden until you check.';
  elements.checkAnswers.hidden = mode !== 'test';
  saveState();
  updateChartView();
  announce(`${mode === 'practice' ? 'Practice' : 'Test'} mode selected.`);
}

function recordAnswer(attack, defense, value = state.selected, { advance = false } = {}) {
  const session = currentSession();
  const key = cellKey(attack, defense);
  session.answers[key] = Number(value);
  session.reveal = false;

  const correctValue = effectiveness(attack, defense);
  const isCorrect = Number(value) === correctValue;
  const attackName = typeById(attack).name;
  const defenseName = typeById(defense).name;

  saveState();
  updateChartView();

  if (state.mode === 'practice' || session.checked) {
    announce(
      isCorrect
        ? `Correct. ${attackName} attacking ${defenseName} is ${formatMultiplier(correctValue)}.`
        : `Not quite. You chose ${formatMultiplier(value)}. ${attackName} attacking ${defenseName} is ${formatMultiplier(correctValue)}.`,
    );
  } else {
    announce(`${formatMultiplier(value)} recorded for ${attackName} attacking ${defenseName}.`);
  }

  updatePrompt(attack, defense, { answered: true });
  if (advance) focusAdjacentCell(attack, defense, 0, 1, true);
}

function toggleAnswer(attack, defense) {
  const session = currentSession();
  const key = cellKey(attack, defense);
  if (hasAnswer(session.answers, key) && Number(session.answers[key]) === state.selected) {
    clearAnswer(attack, defense);
    return;
  }
  recordAnswer(attack, defense);
}

function clearAnswer(attack, defense) {
  const session = currentSession();
  const key = cellKey(attack, defense);
  if (!hasAnswer(session.answers, key)) return;
  delete session.answers[key];
  session.review = false;
  saveState();
  updateChartView();
  announce(`Answer cleared. ${typeById(attack).name} attacking ${typeById(defense).name} now uses the default ${formatMultiplier(1)}.`);
}

function getChartStats() {
  const session = currentSession();
  const answers = session.answers;
  const entries = Object.entries(answers);
  const includeDefaults = state.mode === 'test' && session.checked;
  const scoredEntries = includeDefaults
    ? TYPE_IDS.flatMap((attack) => TYPE_IDS.map((defense) => {
      const key = cellKey(attack, defense);
      return [key, hasAnswer(answers, key) ? answers[key] : 1];
    }))
    : entries;
  const correct = scoredEntries.reduce((count, [key, answer]) => {
    const [attack, defense] = key.split('|');
    return count + (effectiveness(attack, defense) === Number(answer) ? 1 : 0);
  }, 0);
  const completeRows = TYPE_IDS.reduce((count, attack) => {
    const complete = TYPE_IDS.every((defense) => hasAnswer(answers, cellKey(attack, defense)));
    return count + Number(complete);
  }, 0);

  return {
    marked: entries.length,
    scored: scoredEntries.length,
    correct,
    incorrect: scoredEntries.length - correct,
    completeRows,
    accuracy: scoredEntries.length ? Math.round((correct / scoredEntries.length) * 100) : 0,
  };
}

function applyCellState(button) {
  const { attack, defense } = button.dataset;
  const session = currentSession();
  const key = cellKey(attack, defense);
  const answered = hasAnswer(session.answers, key);
  const answer = answered ? Number(session.answers[key]) : 1;
  const correctValue = effectiveness(attack, defense);
  const evaluated = state.mode === 'practice' ? answered : session.checked;
  const correct = evaluated && answer === correctValue;
  const incorrect = evaluated && answer !== correctValue;
  const revealed = !answered && session.reveal;
  const defaulted = !answered && !revealed;
  const displayValue = revealed ? correctValue : answer;
  const dimmed = session.review && !incorrect;

  button.classList.toggle('is-answered', answered);
  button.classList.toggle('is-default', defaulted);
  button.classList.toggle('is-correct', correct);
  button.classList.toggle('is-incorrect', incorrect);
  button.classList.toggle('is-revealed', revealed);
  button.classList.toggle('is-review-dim', dimmed);

  const valueTarget = button.querySelector('.cell-value, .defender-answer');
  if (valueTarget) valueTarget.textContent = formatMultiplier(displayValue);

  const attackName = typeById(attack).name;
  const defenseName = typeById(defense).name;
  let status = `default ${formatMultiplier(1)}, not marked`;
  if (answered) {
    status = `your answer ${formatMultiplier(answer)}`;
    if (evaluated) status += correct ? ', correct' : `, incorrect; correct answer ${formatMultiplier(correctValue)}`;
  } else if (revealed) {
    status = `answer revealed as ${formatMultiplier(correctValue)}`;
  } else if (evaluated) {
    status = `default ${formatMultiplier(1)}`;
    status += correct ? ', correct' : `, incorrect; correct answer ${formatMultiplier(correctValue)}`;
  }
  button.setAttribute('aria-label', `${attackName} attacking ${defenseName}, ${status}`);
  button.title = `${attackName} → ${defenseName}: ${status}`;
}

function updateChartCells() {
  document.querySelectorAll('.matchup-input').forEach(applyCellState);
}

function updateStats() {
  const stats = getChartStats();
  const session = currentSession();
  const shouldShowAccuracy = state.mode === 'practice' || session.checked;
  const progress = Math.round((stats.marked / TOTAL_MATCHUPS) * 100);

  elements.answeredStat.innerHTML = `${stats.marked} <small>/ ${TOTAL_MATCHUPS}</small>`;
  elements.accuracyStat.textContent = shouldShowAccuracy && stats.scored ? `${stats.accuracy}%` : '—';
  elements.accuracyStat.title = shouldShowAccuracy ? 'Accuracy across scored cells' : 'Check your test to score every cell, including ×1 defaults';
  elements.rowsStat.innerHTML = `${stats.completeRows} <small>/ ${TYPE_IDS.length}</small>`;
  elements.progressPercent.textContent = `${progress}%`;
  elements.progressFill.style.width = `${progress}%`;
  elements.checkAnswers.disabled = false;

  const rowAnswered = TYPE_IDS.filter((defense) =>
    hasAnswer(session.answers, cellKey(state.mobileAttack, defense)),
  ).length;
  elements.mobileRowCount.textContent = `${rowAnswered} / ${TYPE_IDS.length}`;
}

function updateChartControls() {
  const session = currentSession();
  elements.revealChart.hidden = state.mode === 'test' && !session.checked;
  elements.revealChart.innerHTML = session.reveal
    ? '<span class="eye-icon" aria-hidden="true"></span> Hide answers'
    : '<span class="eye-icon" aria-hidden="true"></span> Reveal chart';
  elements.revealChart.setAttribute('aria-pressed', String(session.reveal));
  elements.checkAnswers.innerHTML = session.checked
    ? '<span aria-hidden="true">✓</span> Recheck answers'
    : '<span aria-hidden="true">✓</span> Check answers';
}

function renderResults() {
  const stats = getChartStats();
  const session = currentSession();
  const show = (state.mode === 'test' && session.checked) || stats.marked === TOTAL_MATCHUPS;
  elements.results.hidden = !show;
  if (!show) return;

  const testSubmitted = state.mode === 'test' && session.checked;
  const explicitlyComplete = stats.marked === TOTAL_MATCHUPS;
  const title = testSubmitted
    ? stats.correct === TOTAL_MATCHUPS
      ? 'Perfect test. Every matchup mastered.'
      : 'Test complete — here is your result.'
    : explicitlyComplete
      ? stats.correct === TOTAL_MATCHUPS
        ? 'Perfect chart. Every matchup mastered.'
        : 'Chart complete — here is your result.'
      : 'Your answers have been scored.';
  const defaultCount = TOTAL_MATCHUPS - stats.marked;
  const defaultNote = defaultCount
    ? ` ${defaultCount} unmarked ${defaultCount === 1 ? 'cell used' : 'cells used'} the default ×1.`
    : '';
  const detail = stats.incorrect === 0
    ? `You have ${stats.correct} correct answer${stats.correct === 1 ? '' : 's'} and no mistakes.${defaultNote}`
    : `${stats.correct} of ${stats.scored} matchups are correct. ${stats.incorrect} ${stats.incorrect === 1 ? 'matchup needs' : 'matchups need'} another look.${defaultNote}`;

  elements.results.innerHTML = `
    <div class="results-content">
      <div class="result-badge" aria-hidden="true">${stats.scored ? `${stats.accuracy}%` : '—'}</div>
      <div class="results-copy">
        <h3>${title}</h3>
        <p>${detail}</p>
      </div>
      <div class="result-actions">
        <button class="button button-quiet" type="button" data-result-action="review" ${stats.incorrect ? '' : 'disabled'}>
          ${session.review ? 'Show all cells' : `Review ${stats.incorrect} mistake${stats.incorrect === 1 ? '' : 's'}`}
        </button>
        <button class="button button-accent" type="button" data-result-action="retry" ${stats.incorrect ? '' : 'disabled'}>
          Try missed again
        </button>
      </div>
    </div>
  `;
}

function updateChartView() {
  updateChartCells();
  updateStats();
  updateChartControls();
  renderResults();
}

function updatePrompt(attack, defense, options = {}) {
  const attackType = typeById(attack);
  const defenseType = typeById(defense);
  const key = cellKey(attack, defense);
  const session = currentSession();
  const answered = hasAnswer(session.answers, key);
  const placed = options.answered || answered
    ? `Your answer: ${formatMultiplier(session.answers[key])} · choose it again to unmark`
    : `Default ${formatMultiplier(1)} · Place ${formatMultiplier(state.selected)}`;

  elements.prompt.innerHTML = `
    <span class="prompt-symbol" aria-hidden="true">→</span>
    <p><strong>${attackType.name} attacks ${defenseType.name}</strong><span>${placed}</span></p>
    <span class="keyboard-hint">Arrow keys move · 0 / H / 1 / 2 answer · Delete clears</span>
  `;
}

function resetPrompt() {
  elements.prompt.innerHTML = `
    <span class="prompt-symbol" aria-hidden="true">↙</span>
    <p><strong>Choose a multiplier</strong><span>Unmarked cells use the default ${formatMultiplier(1)}.</span></p>
    <span class="keyboard-hint">Arrow keys move · 0 / H / 1 / 2 answer · Delete clears</span>
  `;
}

function highlightAxes(attack, defense) {
  document.querySelectorAll('.is-axis').forEach((node) => node.classList.remove('is-axis'));
  if (!attack || !defense) return;
  document.querySelector(`[data-attack-header="${attack}"]`)?.classList.add('is-axis');
  document.querySelector(`[data-defense-header="${defense}"]`)?.classList.add('is-axis');
  document.querySelectorAll(`[data-axis-attack="${attack}"], [data-axis-defense="${defense}"]`)
    .forEach((node) => node.classList.add('is-axis'));
}

function focusAdjacentCell(attack, defense, rowDelta, columnDelta, linearAdvance = false) {
  let attackIndex = TYPE_IDS.indexOf(attack);
  let defenseIndex = TYPE_IDS.indexOf(defense);

  if (linearAdvance) {
    defenseIndex += 1;
    if (defenseIndex >= TYPE_IDS.length) {
      defenseIndex = 0;
      attackIndex = (attackIndex + 1) % TYPE_IDS.length;
    }
  } else {
    attackIndex = (attackIndex + rowDelta + TYPE_IDS.length) % TYPE_IDS.length;
    defenseIndex = (defenseIndex + columnDelta + TYPE_IDS.length) % TYPE_IDS.length;
  }

  const target = elements.typeChart.querySelector(
    `.chart-cell[data-attack="${TYPE_IDS[attackIndex]}"][data-defense="${TYPE_IDS[defenseIndex]}"]`,
  );
  setActiveDesktopCell(target);
  target?.focus();
}

function setActiveDesktopCell(target) {
  if (!target?.classList.contains('chart-cell')) return;
  elements.typeChart.querySelectorAll('.chart-cell[tabindex="0"]')
    .forEach((cell) => { cell.tabIndex = -1; });
  target.tabIndex = 0;
}

function checkAnswers() {
  const session = currentSession();
  session.checked = true;
  session.reveal = false;
  session.review = false;
  saveState();
  updateChartView();
  const stats = getChartStats();
  announce(`Test scored. ${stats.correct} of ${TOTAL_MATCHUPS} matchups are correct. Unmarked cells were scored as ${formatMultiplier(1)}.`);
  elements.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function toggleReveal() {
  const session = currentSession();
  session.reveal = !session.reveal;
  session.review = false;
  saveState();
  updateChartView();
  announce(session.reveal ? 'Correct answers revealed.' : 'Correct answers hidden.');
}

function handleResultAction(action) {
  const session = currentSession();
  if (action === 'review') {
    session.review = !session.review;
    session.reveal = false;
    saveState();
    updateChartView();
    announce(session.review ? 'Mistakes highlighted; other cells dimmed.' : 'All cells shown.');
    return;
  }

  if (action === 'retry') {
    for (const [key, answer] of Object.entries(session.answers)) {
      const [attack, defense] = key.split('|');
      if (Number(answer) !== effectiveness(attack, defense)) delete session.answers[key];
    }
    session.checked = true;
    session.reveal = false;
    session.review = true;
    saveState();
    updateChartView();
    announce('Mistaken matchups are highlighted. Correct them to try again.');
    elements.typeChart.querySelector('.chart-cell.is-incorrect')?.focus();
  }
}

function randomIndex(length) {
  if (globalThis.crypto?.getRandomValues) {
    const max = Math.floor(0x100000000 / length) * length;
    const buffer = new Uint32Array(1);
    do globalThis.crypto.getRandomValues(buffer); while (buffer[0] >= max);
    return buffer[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function generateQuestion() {
  const previousKey = state.quick.question
    ? cellKey(state.quick.question.attack, state.quick.question.defense)
    : null;
  let question;
  do {
    const targetValue = VALID_VALUES[randomIndex(VALID_VALUES.length)];
    const pool = QUIZ_POOL[targetValue];
    question = pool[randomIndex(pool.length)];
  } while (cellKey(question.attack, question.defense) === previousKey);

  state.quick.question = question;
  state.quick.answer = null;
  saveState();
}

function quickTypeMarkup(type, role) {
  return `
    <div class="quick-type" style="${typeStyle(type)}">
      <small>${role}</small>
      ${typeIconMarkup(type, 'quick-type-badge')}
      <strong>${type.name}</strong>
    </div>
  `;
}

function renderQuick() {
  if (!state.quick.question) generateQuestion();
  const { attack, defense } = state.quick.question;
  const attackType = typeById(attack);
  const defenseType = typeById(defense);
  const correctValue = effectiveness(attack, defense);
  const answered = state.quick.answer !== null;

  elements.quickMatchup.innerHTML = `
    ${quickTypeMarkup(attackType, 'ATTACK')}
    <div class="versus-arrow" aria-hidden="true"><span>VS</span></div>
    ${quickTypeMarkup(defenseType, 'DEFEND')}
    <span class="sr-only">${attackType.name} attacking ${defenseType.name}</span>
  `;

  elements.quickOptions.querySelectorAll('[data-quick-value]').forEach((button) => {
    const value = Number(button.dataset.quickValue);
    button.disabled = answered;
    button.classList.toggle('is-correct-choice', answered && value === correctValue);
    button.classList.toggle('is-wrong-choice', answered && value === state.quick.answer && value !== correctValue);
  });

  if (answered) {
    const correct = state.quick.answer === correctValue;
    elements.quickFeedback.hidden = false;
    elements.quickFeedback.classList.toggle('is-wrong', !correct);
    elements.quickFeedback.innerHTML = `
      <span class="feedback-mark" aria-hidden="true">${correct ? '✓' : '×'}</span>
      <p>
        <strong>${correct ? 'Correct!' : `The answer is ${formatMultiplier(correctValue)}.`}</strong>
        ${attackType.name} ${VALUE_PHRASES.get(correctValue)} ${defenseType.name}.
      </p>
      <button class="button button-accent" type="button" id="next-question">Next matchup <span aria-hidden="true">→</span></button>
    `;
  } else {
    elements.quickFeedback.hidden = true;
    elements.quickFeedback.innerHTML = '';
  }

  updateQuickScore();
}

function answerQuick(value) {
  if (state.quick.answer !== null) return;
  const { attack, defense } = state.quick.question;
  const correctValue = effectiveness(attack, defense);
  const correct = Number(value) === correctValue;

  state.quick.answer = Number(value);
  state.quick.total += 1;
  if (correct) {
    state.quick.correct += 1;
    state.quick.streak += 1;
    state.quick.best = Math.max(state.quick.best, state.quick.streak);
  } else {
    state.quick.streak = 0;
  }
  saveState();
  renderQuick();
  announce(
    correct
      ? `Correct. ${typeById(attack).name} attacking ${typeById(defense).name} is ${formatMultiplier(correctValue)}.`
      : `Not quite. The correct answer is ${formatMultiplier(correctValue)}.`,
  );
  document.querySelector('#next-question')?.focus();
}

function updateQuickScore() {
  const { correct, total, streak, best } = state.quick;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  elements.quickCorrect.textContent = correct;
  elements.quickTotal.textContent = total;
  elements.quickStreak.textContent = streak;
  elements.quickBest.textContent = best;
  elements.quickScorePercent.textContent = total ? `${percent}%` : '—';
  elements.scoreRing.style.setProperty('--score-angle', `${percent * 3.6}deg`);
}

function nextQuestion({ focus = true } = {}) {
  generateQuestion();
  renderQuick();
  if (focus) elements.quickOptions.querySelector('button')?.focus();
}

function openResetDialog(target) {
  resetTarget = target;
  const isChart = target === 'chart';
  elements.dialogTitle.textContent = isChart ? 'Reset your chart?' : 'Reset this quiz run?';
  elements.dialogCopy.textContent = isChart
    ? `This clears every marked answer in your ${state.mode} chart. All cells return to the default ×1; your other mode is kept.`
    : 'This clears the Quick Quiz score, streak, and current question.';
  elements.confirmReset.textContent = isChart ? 'Reset chart' : 'Reset run';
  elements.dialog.showModal();
}

function performReset() {
  if (resetTarget === 'chart') {
    state.sessions[state.mode] = defaultSession();
    saveState();
    updateChartView();
    resetPrompt();
    announce(`${state.mode === 'practice' ? 'Practice' : 'Test'} chart reset.`);
  } else {
    state.quick = defaultState().quick;
    generateQuestion();
    renderQuick();
    announce('Quick Quiz run reset.');
  }
}

function bindEvents() {
  elements.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.view, { focusPanel: true }));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = tab.dataset.view === 'chart' ? 'quick' : 'chart';
      const nextTab = elements.viewTabs.find((candidate) => candidate.dataset.view === next);
      nextTab.focus();
      setView(next);
    });
  });

  elements.modeButtons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  elements.palette.forEach((button) => {
    button.addEventListener('click', () => selectMultiplier(Number(button.dataset.value)));
    button.addEventListener('keydown', (event) => {
      const keys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const currentIndex = elements.palette.indexOf(button);
      let nextIndex = currentIndex;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = elements.palette.length - 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + elements.palette.length) % elements.palette.length;
      } else {
        nextIndex = (currentIndex + 1) % elements.palette.length;
      }
      const nextButton = elements.palette[nextIndex];
      selectMultiplier(Number(nextButton.dataset.value));
      nextButton.focus();
    });
  });

  elements.typeChart.addEventListener('click', (event) => {
    const button = event.target.closest('.chart-cell');
    if (!button) return;
    setActiveDesktopCell(button);
    toggleAnswer(button.dataset.attack, button.dataset.defense);
  });

  elements.typeChart.addEventListener('pointerover', (event) => {
    const button = event.target.closest('.chart-cell');
    if (!button) return;
    highlightAxes(button.dataset.attack, button.dataset.defense);
    updatePrompt(button.dataset.attack, button.dataset.defense);
  });

  elements.typeChart.addEventListener('pointerleave', () => {
    highlightAxes();
    resetPrompt();
  });

  elements.typeChart.addEventListener('focusin', (event) => {
    const button = event.target.closest('.chart-cell');
    if (!button) return;
    setActiveDesktopCell(button);
    highlightAxes(button.dataset.attack, button.dataset.defense);
    updatePrompt(button.dataset.attack, button.dataset.defense);
  });

  elements.typeChart.addEventListener('focusout', (event) => {
    if (elements.typeChart.contains(event.relatedTarget)) return;
    highlightAxes();
    resetPrompt();
  });

  elements.typeChart.addEventListener('keydown', (event) => {
    const button = event.target.closest('.chart-cell');
    if (!button) return;
    const { attack, defense } = button.dataset;
    const keyValues = { 0: 0, h: 0.5, H: 0.5, 1: 1, 2: 2 };

    if (Object.prototype.hasOwnProperty.call(keyValues, event.key)) {
      event.preventDefault();
      selectMultiplier(keyValues[event.key], false);
      recordAnswer(attack, defense, keyValues[event.key], { advance: true });
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      clearAnswer(attack, defense);
      return;
    }

    const directions = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (directions[event.key]) {
      event.preventDefault();
      focusAdjacentCell(attack, defense, ...directions[event.key]);
    }
  });

  elements.mobileAttacker.addEventListener('change', () => {
    state.mobileAttack = elements.mobileAttacker.value;
    saveState();
    renderMobileRow();
    updateChartView();
    announce(`${typeById(state.mobileAttack).name} selected as the attacking type.`);
  });

  elements.mobileGrid.addEventListener('click', (event) => {
    const button = event.target.closest('.defender-cell');
    if (!button) return;
    toggleAnswer(button.dataset.attack, button.dataset.defense);
  });

  elements.mobileGrid.addEventListener('focusin', (event) => {
    const button = event.target.closest('.defender-cell');
    if (button) updatePrompt(button.dataset.attack, button.dataset.defense);
  });

  elements.checkAnswers.addEventListener('click', checkAnswers);
  elements.revealChart.addEventListener('click', toggleReveal);
  elements.resetChart.addEventListener('click', () => openResetDialog('chart'));

  elements.results.addEventListener('click', (event) => {
    const button = event.target.closest('[data-result-action]');
    if (button && !button.disabled) handleResultAction(button.dataset.resultAction);
  });

  elements.quickOptions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-quick-value]');
    if (button) answerQuick(Number(button.dataset.quickValue));
  });

  elements.quickFeedback.addEventListener('click', (event) => {
    if (event.target.closest('#next-question')) nextQuestion();
  });
  elements.skipQuestion.addEventListener('click', () => nextQuestion());
  elements.resetQuick.addEventListener('click', () => openResetDialog('quick'));

  elements.dialog.addEventListener('click', (event) => {
    if (event.target === elements.dialog) elements.dialog.close('cancel');
  });
  elements.dialog.addEventListener('close', () => {
    if (elements.dialog.returnValue === 'confirm') performReset();
  });

  document.addEventListener('keydown', (event) => {
    if (state.view !== 'quick' || event.target.matches('input, select, textarea, button')) return;
    const keyValues = { 0: 0, h: 0.5, H: 0.5, 1: 1, 2: 2 };
    if (state.quick.answer === null && Object.prototype.hasOwnProperty.call(keyValues, event.key)) {
      event.preventDefault();
      answerQuick(keyValues[event.key]);
    } else if (state.quick.answer !== null && event.key === 'Enter') {
      event.preventDefault();
      nextQuestion();
    }
  });
}

function initialize() {
  renderDesktopChart();
  renderMobileSelector();
  bindEvents();
  selectMultiplier(state.selected, false);
  setMode(state.mode);
  setView(state.view);
  renderQuick();
  updateChartView();
}

initialize();
