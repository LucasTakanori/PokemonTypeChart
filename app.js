import {
  TYPE_CHART,
  TYPE_IDS,
  TYPES,
  coverageCategory,
  coveragePairsExcluding,
  defensiveCoverage,
  effectiveness,
  offensiveCoverage,
  scoreCoverageAnswers,
  typeById,
} from './chart-data.js?v=20260813-coverage-quiz';

const STORAGE_KEY = 'typewise-progress-v1';
const LEGACY_BACKUP_KEY = 'typewise-progress-v1-legacy-sessions';
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

const COVERAGE_ANSWER_VALUES = [2, 0.5, 0, 1];

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
  theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  axis: 'attack-rows',
  selected: 1,
  mobileRows: {
    attack: 'normal',
    defense: 'normal',
  },
  chart: defaultSession(),
  coverage: {
    question: null,
    mode: 'practice',
    selected: { offense: 2, defense: 2 },
    answers: { offense: {}, defense: {} },
    checked: false,
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
  coveragePanel: document.querySelector('#coverage-panel'),
  quickPanel: document.querySelector('#quick-panel'),
  viewTabs: [...document.querySelectorAll('.view-tab')],
  viewLinks: [...document.querySelectorAll('[data-view-target]')],
  themeToggle: document.querySelector('#theme-toggle'),
  themeToggleLabel: document.querySelector('#theme-toggle-label'),
  feedbackToggle: document.querySelector('#feedback-toggle'),
  feedbackTitle: document.querySelector('#feedback-title'),
  modeDescription: document.querySelector('#mode-description'),
  axisToggle: document.querySelector('#axis-toggle'),
  axisStatus: document.querySelector('#axis-status'),
  axisDescription: document.querySelector('#axis-description'),
  scrollNote: document.querySelector('#scroll-note'),
  palette: [...document.querySelectorAll('.answer-choice')],
  typeChart: document.querySelector('#type-chart'),
  mobileRowType: document.querySelector('#mobile-row-type'),
  mobileAxisLabel: document.querySelector('#mobile-axis-label'),
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
  rowsStatLabel: document.querySelector('#rows-stat-label'),
  progressPercent: document.querySelector('#progress-percent'),
  progressFill: document.querySelector('#progress-fill'),
  prompt: document.querySelector('#matchup-prompt'),
  results: document.querySelector('#results-panel'),
  coverageMatchup: document.querySelector('#coverage-matchup'),
  coverageQuestionTitle: document.querySelector('#coverage-question-title'),
  coverageFeedbackToggle: document.querySelector('#coverage-feedback-toggle'),
  coverageFeedbackTitle: document.querySelector('#coverage-feedback-title'),
  coverageModeDescription: document.querySelector('#coverage-mode-description'),
  coverageShuffle: document.querySelector('#coverage-shuffle'),
  coverageReset: document.querySelector('#coverage-reset'),
  coverageCheck: document.querySelector('#coverage-check'),
  coverageResults: document.querySelector('#coverage-results'),
  coverageSummary: document.querySelector('#coverage-summary'),
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
  return state.chart;
}

function rowsAreAttackers() {
  return state.axis === 'attack-rows';
}

function matchupForVisibleCell(row, column) {
  return rowsAreAttackers()
    ? { attack: row, defense: column }
    : { attack: column, defense: row };
}

function visibleCoordinates(attack, defense) {
  return rowsAreAttackers()
    ? { row: attack, column: defense }
    : { row: defense, column: attack };
}

function currentMobileRow() {
  return state.mobileRows[rowsAreAttackers() ? 'attack' : 'defense'];
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

function migrateLegacySessions(rawSessions, preferredMode) {
  const primary = sanitizeSession(rawSessions?.[preferredMode]);
  const secondaryMode = preferredMode === 'practice' ? 'test' : 'practice';
  const secondary = sanitizeSession(rawSessions?.[secondaryMode]);
  return {
    answers: { ...secondary.answers, ...primary.answers },
    checked: false,
    reveal: false,
    review: false,
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

function sanitizeCoverageAnswerMap(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== 'object') return {};
  return Object.fromEntries(
    Object.entries(rawAnswers)
      .filter(([type, value]) => isType(type) && [0, 0.5, 2].includes(Number(value)))
      .map(([type, value]) => [type, Number(value)]),
  );
}

function sanitizeCoverage(rawCoverage) {
  const rawTypes = Array.isArray(rawCoverage?.question?.types)
    ? rawCoverage.question.types
    : [rawCoverage?.primary, rawCoverage?.secondary];
  const types = rawTypes.length === 2
    && rawTypes.every(isType)
    && rawTypes[0] !== rawTypes[1]
    ? [...rawTypes]
    : null;
  const selectedValue = (direction) => COVERAGE_ANSWER_VALUES.includes(
    Number(rawCoverage?.selected?.[direction]),
  ) ? Number(rawCoverage.selected[direction]) : 2;

  return {
    question: types ? { types } : null,
    mode: ['practice', 'test'].includes(rawCoverage?.mode)
      ? rawCoverage.mode
      : 'practice',
    selected: {
      offense: selectedValue('offense'),
      defense: selectedValue('defense'),
    },
    answers: {
      offense: sanitizeCoverageAnswerMap(rawCoverage?.answers?.offense),
      defense: sanitizeCoverageAnswerMap(rawCoverage?.answers?.defense),
    },
    checked: Boolean(rawCoverage?.checked),
  };
}

function loadState() {
  const fallback = defaultState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== 'object') return fallback;

    const mode = ['practice', 'test'].includes(raw.mode) ? raw.mode : fallback.mode;
    if (!raw.chart && raw.sessions && !localStorage.getItem(LEGACY_BACKUP_KEY)) {
      localStorage.setItem(LEGACY_BACKUP_KEY, JSON.stringify(raw.sessions));
    }
    return {
      view: ['chart', 'coverage', 'quick'].includes(raw.view) ? raw.view : fallback.view,
      mode,
      theme: ['light', 'dark'].includes(raw.theme) ? raw.theme : fallback.theme,
      axis: ['attack-rows', 'defense-rows'].includes(raw.axis) ? raw.axis : fallback.axis,
      selected: VALID_VALUES.includes(Number(raw.selected)) ? Number(raw.selected) : fallback.selected,
      mobileRows: {
        attack: isType(raw.mobileRows?.attack)
          ? raw.mobileRows.attack
          : (isType(raw.mobileAttack) ? raw.mobileAttack : fallback.mobileRows.attack),
        defense: isType(raw.mobileRows?.defense) ? raw.mobileRows.defense : fallback.mobileRows.defense,
      },
      chart: raw.chart ? sanitizeSession(raw.chart) : migrateLegacySessions(raw.sessions, mode),
      coverage: sanitizeCoverage(raw.coverage),
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
  const activeCell = elements.typeChart.querySelector('.chart-cell[tabindex="0"]');
  const activeAttack = activeCell?.dataset.attack ?? TYPE_IDS[0];
  const activeDefense = activeCell?.dataset.defense ?? TYPE_IDS[0];
  const rowRole = rowsAreAttackers() ? 'attack' : 'defense';
  const columnRole = rowsAreAttackers() ? 'defense' : 'attack';
  const headers = TYPES.map((type) => `
    <th class="type-col-head" scope="col" data-${columnRole}-header="${type.id}"
      style="${typeStyle(type)}" title="${columnRole === 'attack' ? 'Attacking' : 'Defending'} ${type.name} type">
      <span class="type-col-inner">${typeIconMarkup(type)}
        <span class="sr-only">${columnRole === 'attack' ? 'Attacking' : 'Defending'} ${type.name}</span>
      </span>
    </th>
  `).join('');

  const rows = TYPES.map((rowType) => {
    const cells = TYPES.map((columnType) => {
      const { attack, defense } = matchupForVisibleCell(rowType.id, columnType.id);
      const attackType = typeById(attack);
      const defenseType = typeById(defense);
      return `
        <td data-axis-attack="${attack}" data-axis-defense="${defense}">
          <button class="chart-cell matchup-input" type="button"
            tabindex="${attack === activeAttack && defense === activeDefense ? '0' : '-1'}"
            data-attack="${attack}" data-defense="${defense}"
            aria-label="${attackType.name} attacking ${defenseType.name}, unanswered"
          ><span class="cell-value" aria-hidden="true"></span></button>
        </td>
      `;
    }).join('');
    return `
      <tr data-row="${rowType.id}">
        <th class="type-row-head" scope="row" data-${rowRole}-header="${rowType.id}" style="${typeStyle(rowType)}">
          <span class="row-type-label">${typeIconMarkup(rowType)}<span>${rowType.name}</span></span>
        </th>
        ${cells}
      </tr>
    `;
  }).join('');

  elements.typeChart.innerHTML = `
    <caption class="sr-only">Interactive Pokémon effectiveness chart. Rows are ${rowRole === 'attack' ? 'attacking' : 'defending'} types and columns are ${columnRole === 'attack' ? 'attacking' : 'defending'} types.</caption>
    <thead><tr>
      <th class="corner-cell" scope="col"><span class="corner-directions">
        <span>${columnRole.toUpperCase()} <b aria-hidden="true">→</b></span>
        <span>${rowRole.toUpperCase()} <b aria-hidden="true">↓</b></span>
      </span></th>
      ${headers}
    </tr></thead>
    <tbody>${rows}</tbody>
  `;
}

function renderMobileSelector() {
  elements.mobileRowType.innerHTML = TYPES.map(
    (type) => `<option value="${type.id}">${type.name}</option>`,
  ).join('');
  elements.mobileRowType.value = currentMobileRow();
  renderMobileRow();
}

function renderMobileRow() {
  const rowType = typeById(currentMobileRow());
  const rowLabel = rowsAreAttackers() ? 'Attacking' : 'Defending';
  elements.mobileRowType.value = rowType.id;
  elements.mobileAxisLabel.textContent = `${rowLabel} type`;
  elements.pickerIcon.src = rowType.icon;
  elements.mobileRowLabel.textContent = `${rowType.name} ${rowLabel.toLowerCase()} row`;

  elements.mobileGrid.innerHTML = TYPES.map((columnType) => {
    const { attack, defense } = matchupForVisibleCell(rowType.id, columnType.id);
    const attackType = typeById(attack);
    const defenseType = typeById(defense);
    return `
      <button class="defender-cell matchup-input" type="button"
        data-attack="${attack}" data-defense="${defense}" style="${typeStyle(columnType)}"
        aria-label="${attackType.name} attacking ${defenseType.name}, unanswered">
        ${typeIconMarkup(columnType)}
        <span class="defender-name">${columnType.name}</span>
        <span class="defender-answer" aria-hidden="true">·</span>
      </button>
    `;
  }).join('');
}

function selectedCoverageTypes() {
  return state.coverage.question?.types ?? [];
}

function formatCoverageMultiplier(value) {
  if (Number(value) === 0.25) return '×¼';
  if (Number(value) === 4) return '×4';
  return formatMultiplier(value);
}

function chooseCoverageQuestion() {
  const pool = coveragePairsExcluding(state.coverage.question?.types);
  const types = pool[randomIndex(pool.length)];

  state.coverage.question = { types };
  state.coverage.answers = { offense: {}, defense: {} };
  state.coverage.checked = false;
  saveState();
}

function coverageProfiles() {
  const selectedTypes = selectedCoverageTypes();
  const offenseExact = offensiveCoverage(selectedTypes);
  const defenseExact = defensiveCoverage(selectedTypes);
  return {
    offense: offenseExact,
    defense: Object.fromEntries(
      TYPE_IDS.map((type) => [type, coverageCategory(defenseExact[type])]),
    ),
    exact: { offense: offenseExact, defense: defenseExact },
  };
}

function coverageStats(profiles = coverageProfiles()) {
  const offense = scoreCoverageAnswers(
    profiles.exact.offense,
    state.coverage.answers.offense,
  );
  const defense = scoreCoverageAnswers(
    profiles.exact.defense,
    state.coverage.answers.defense,
  );
  return {
    offense,
    defense,
    correct: offense.correct + defense.correct,
    incorrect: offense.incorrect + defense.incorrect,
  };
}

function coveragePaletteMarkup(direction) {
  const selected = state.coverage.selected[direction];
  const labels = direction === 'offense'
    ? { 2: 'Super', 0.5: 'Resisted', 0: 'No effect', 1: 'Clear' }
    : { 2: 'Weak', 0.5: 'Resists', 0: 'Immune', 1: 'Clear' };
  return `
    <div class="coverage-answer-palette" role="radiogroup" aria-label="${direction === 'offense' ? 'Offensive' : 'Defensive'} multiplier">
      ${COVERAGE_ANSWER_VALUES.map((value) => `
        <button type="button" role="radio" aria-checked="${selected === value}"
          tabindex="${selected === value ? '0' : '-1'}"
          class="${selected === value ? 'is-active' : ''}"
          data-coverage-palette="${direction}" data-coverage-value="${value}">
          <strong>${formatMultiplier(value)}</strong><span>${labels[value]}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function coverageTileMarkup(direction, type, profiles) {
  const answers = state.coverage.answers[direction];
  const answered = hasAnswer(answers, type.id);
  const answer = answered ? Number(answers[type.id]) : 1;
  const correctValue = profiles[direction][type.id];
  const exactValue = profiles.exact[direction][type.id];
  const evaluated = state.coverage.checked || (state.coverage.mode === 'practice' && answered);
  const correct = evaluated && answer === correctValue;
  const incorrect = evaluated && answer !== correctValue;
  const exactDetail = direction === 'defense' && exactValue !== correctValue
    ? ` Exact multiplier ${formatCoverageMultiplier(exactValue)}.`
    : '';
  let status = answered ? `your answer ${formatMultiplier(answer)}` : 'default ×1';
  if (evaluated) {
    status += correct
      ? `, correct.${exactDetail}`
      : `, incorrect; correct category ${formatMultiplier(correctValue)}.${exactDetail}`;
  }
  const correction = evaluated
    ? correct
      ? `<span class="coverage-tile-feedback is-correct" aria-hidden="true">✓${exactDetail ? ` exact ${formatCoverageMultiplier(exactValue)}` : ''}</span>`
      : `<span class="coverage-tile-feedback is-wrong" aria-hidden="true">→ ${formatMultiplier(correctValue)}${exactDetail ? ` · exact ${formatCoverageMultiplier(exactValue)}` : ''}</span>`
    : '';
  const roleDescription = direction === 'offense'
    ? 'defending target'
    : 'incoming attack against this typing';

  return `
    <button class="coverage-quiz-type${answered ? ' is-answered' : ' is-default'}${correct ? ' is-correct' : ''}${incorrect ? ' is-incorrect' : ''}"
      type="button" style="${typeStyle(type)}" data-coverage-direction="${direction}"
      data-coverage-type="${type.id}" aria-pressed="${answered}"
      aria-label="${type.name}, ${roleDescription}, ${status}">
      ${typeIconMarkup(type)}
      <span class="coverage-quiz-type-name">${type.name}</span>
      <strong class="coverage-quiz-value">${formatMultiplier(answer)}</strong>
      ${correction}
    </button>
  `;
}

function coverageBoardMarkup(direction, profiles) {
  const offense = direction === 'offense';
  const answers = state.coverage.answers[direction];
  const marked = Object.keys(answers).length;
  return `
    <article class="coverage-card coverage-quiz-card" aria-labelledby="${direction}-coverage-title">
      <header class="coverage-card-heading">
        <span class="coverage-direction ${offense ? 'is-offense' : 'is-defense'}" aria-hidden="true">${offense ? '→' : '←'}</span>
        <div>
          <p class="section-kicker">${offense ? 'OFFENSIVE COVERAGE' : 'DEFENSIVE COVERAGE'}</p>
          <h3 id="${direction}-coverage-title">${offense ? 'Best attacking option' : 'Incoming damage'}</h3>
          <p>${offense
            ? 'For each defending type, use whichever of the two attack types works better.'
            : 'For each incoming attack type, judge its matchup against the combined typing.'}</p>
        </div>
      </header>
      ${coveragePaletteMarkup(direction)}
      <div class="coverage-board-count"><strong>${marked} marked</strong><span>${TYPE_IDS.length - marked} default ×1</span></div>
      <div class="coverage-quiz-grid" aria-label="${offense ? 'Offensive targets' : 'Defensive incoming attacks'}">
        ${TYPES.map((type) => coverageTileMarkup(direction, type, profiles)).join('')}
      </div>
    </article>
  `;
}

function renderCoverageSummary(stats) {
  elements.coverageSummary.hidden = !state.coverage.checked;
  if (!state.coverage.checked) {
    elements.coverageSummary.innerHTML = '';
    return;
  }
  const percent = Math.round((stats.correct / (TYPE_IDS.length * 2)) * 100);
  elements.coverageSummary.innerHTML = `
    <div class="result-badge" aria-hidden="true">${percent}%</div>
    <div class="results-copy">
      <h3>${stats.incorrect ? 'Coverage checked — review the marked corrections.' : 'Perfect coverage. Every type is correct.'}</h3>
      <p>${stats.correct} of ${TYPE_IDS.length * 2} correct · Offense ${stats.offense.correct}/${TYPE_IDS.length} · Defense ${stats.defense.correct}/${TYPE_IDS.length}. Unmarked types were scored as ×1.</p>
    </div>
    <button class="button button-accent" type="button" data-coverage-action="next">Next typing <span aria-hidden="true">→</span></button>
  `;
}

function renderCoverage() {
  if (!state.coverage.question) chooseCoverageQuestion();
  const selectedTypes = selectedCoverageTypes();
  const first = typeById(selectedTypes[0]);
  const second = typeById(selectedTypes[1]);
  const profiles = coverageProfiles();
  const stats = coverageStats(profiles);

  elements.coverageQuestionTitle.textContent = `${first.name} / ${second.name} coverage challenge`;
  elements.coverageMatchup.innerHTML = `
    ${quickTypeMarkup(first, 'TYPE 1')}
    <div class="versus-arrow coverage-plus-mark" aria-hidden="true"><span>+</span></div>
    ${quickTypeMarkup(second, 'TYPE 2')}
    <span class="sr-only">${first.name} and ${second.name} dual typing</span>
  `;

  elements.coverageResults.innerHTML = `
    ${coverageBoardMarkup('offense', profiles)}
    ${coverageBoardMarkup('defense', profiles)}
  `;
  elements.coverageCheck.innerHTML = state.coverage.checked
    ? '<span aria-hidden="true">✓</span> Recheck coverage'
    : '<span aria-hidden="true">✓</span> Check coverage';
  elements.coverageReset.disabled = !Object.keys(state.coverage.answers.offense).length
    && !Object.keys(state.coverage.answers.defense).length;
  renderCoverageSummary(stats);
}

function generateCoverageQuestion({ focus = true } = {}) {
  chooseCoverageQuestion();
  renderCoverage();
  announce(`New coverage challenge: ${selectedCoverageTypes().map((type) => typeById(type).name).join(' and ')}.`);
  if (focus) elements.coverageQuestionTitle.focus();
}

function setCoverageMultiplier(direction, value, { focus = true } = {}) {
  state.coverage.selected[direction] = Number(value);
  saveState();
  renderCoverage();
  announce(`${formatMultiplier(value)} selected for ${direction}.`);
  if (focus) {
    elements.coverageResults.querySelector(
      `[data-coverage-palette="${direction}"][data-coverage-value="${value}"]`,
    )?.focus();
  }
}

function toggleCoverageAnswer(direction, type) {
  const answers = state.coverage.answers[direction];
  const selected = state.coverage.selected[direction];
  const alreadySelected = hasAnswer(answers, type) && Number(answers[type]) === selected;
  if (selected === 1 || alreadySelected) delete answers[type];
  else answers[type] = selected;
  saveState();

  const profiles = coverageProfiles();
  const answer = hasAnswer(answers, type) ? Number(answers[type]) : 1;
  const correctValue = profiles[direction][type];
  const evaluated = state.coverage.checked || state.coverage.mode === 'practice';
  renderCoverage();
  elements.coverageResults.querySelector(
    `[data-coverage-direction="${direction}"][data-coverage-type="${type}"]`,
  )?.focus();

  const typeName = typeById(type).name;
  if (evaluated && hasAnswer(answers, type)) {
    announce(answer === correctValue
      ? `Correct. ${typeName} is ${formatMultiplier(correctValue)} for ${direction}.`
      : `Not quite. ${typeName} is ${formatMultiplier(correctValue)} for ${direction}.`);
  } else {
    announce(hasAnswer(answers, type)
      ? `${formatMultiplier(answer)} marked for ${typeName} in ${direction}.`
      : `${typeName} cleared to default ×1 in ${direction}.`);
  }
}

function checkCoverageAnswers() {
  state.coverage.checked = true;
  saveState();
  const stats = coverageStats();
  renderCoverage();
  announce(`Coverage scored. ${stats.correct} of ${TYPE_IDS.length * 2} answers are correct.`);
  elements.coverageSummary.focus({ preventScroll: true });
  elements.coverageSummary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetCoverageAnswers() {
  state.coverage.answers = { offense: {}, defense: {} };
  state.coverage.checked = false;
  saveState();
  renderCoverage();
  announce('Coverage marks reset. Every type is back to the default ×1.');
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
  const panels = {
    chart: elements.chartPanel,
    coverage: elements.coveragePanel,
    quick: elements.quickPanel,
  };
  Object.entries(panels).forEach(([panelView, panel]) => {
    panel.hidden = panelView !== view;
  });
  elements.viewTabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  if (view === 'chart') {
    elements.axisDescription.textContent = rowsAreAttackers()
      ? 'Attacking types run down the left. Defending types run across the top.'
      : 'Defending types run down the left. Attacking types run across the top.';
  } else if (view === 'coverage') {
    elements.axisDescription.textContent = 'Test offensive and defensive coverage for a random two-type Pokémon.';
  } else {
    elements.axisDescription.textContent = 'Build fast recall with one random attacking and defending matchup at a time.';
  }
  saveState();

  if (view === 'coverage') renderCoverage();
  if (view === 'quick') renderQuick();
  if (focusPanel) {
    const target = panels[view];
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}

function setTheme(theme, { shouldAnnounce = false, shouldSave = true } = {}) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  const isDark = state.theme === 'dark';
  document.documentElement.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0d141c' : '#f6f1e7');
  elements.themeToggle.setAttribute('aria-checked', String(isDark));
  elements.themeToggle.setAttribute('aria-label', 'Dark mode');
  elements.themeToggleLabel.textContent = 'Dark mode';
  if (shouldSave) saveState();
  if (shouldAnnounce) announce(`${isDark ? 'Dark' : 'Light'} mode on.`);
}

function setAxis(axis, { shouldAnnounce = true, shouldSave = true } = {}) {
  state.axis = axis === 'defense-rows' ? 'defense-rows' : 'attack-rows';
  const attackRows = rowsAreAttackers();
  elements.axisStatus.textContent = attackRows ? 'Attack ↓ · Defend →' : 'Defend ↓ · Attack →';
  elements.axisDescription.textContent = attackRows
    ? 'Attacking types run down the left. Defending types run across the top.'
    : 'Defending types run down the left. Attacking types run across the top.';
  elements.rowsStatLabel.textContent = `${attackRows ? 'ATTACK' : 'DEFENSE'} ROWS CONFIRMED`;
  elements.scrollNote.innerHTML = `<span>←</span> Scroll to see every ${attackRows ? 'defending' : 'attacking'} type <span>→</span>`;
  renderDesktopChart();
  renderMobileRow();
  resetPrompt();
  if (shouldSave) saveState();
  updateChartView();
  if (shouldAnnounce) {
    announce(`${attackRows ? 'Attacking' : 'Defending'} types are now rows; ${attackRows ? 'defending' : 'attacking'} types are columns.`);
  }
}

function setMode(mode, { shouldAnnounce = true, shouldSave = true } = {}) {
  const changed = state.mode !== mode;
  state.mode = mode;
  const instant = mode === 'practice';
  if (changed) {
    const session = currentSession();
    session.checked = false;
    session.reveal = false;
    session.review = false;
  }
  elements.feedbackToggle.classList.toggle('is-instant', instant);
  elements.feedbackToggle.setAttribute('aria-checked', String(instant));
  elements.feedbackToggle.setAttribute('aria-label', 'Instant feedback');
  elements.feedbackTitle.textContent = 'Instant feedback';
  elements.modeDescription.textContent = instant
    ? 'Correct each cell as you go.'
    : 'Hide results until you check the table.';
  elements.checkAnswers.hidden = mode !== 'test';
  if (shouldSave) saveState();
  updateChartView();
  if (shouldAnnounce) announce(`${instant ? 'Instant feedback' : 'Score when ready'} selected.`);
}

function setCoverageMode(mode, { shouldAnnounce = true, shouldSave = true } = {}) {
  const nextMode = mode === 'test' ? 'test' : 'practice';
  const changed = state.coverage.mode !== nextMode;
  state.coverage.mode = nextMode;
  if (changed) state.coverage.checked = false;
  const instant = nextMode === 'practice';
  elements.coverageFeedbackToggle.classList.toggle('is-instant', instant);
  elements.coverageFeedbackToggle.setAttribute('aria-checked', String(instant));
  elements.coverageFeedbackToggle.setAttribute('aria-label', 'Instant feedback');
  elements.coverageFeedbackTitle.textContent = 'Instant feedback';
  elements.coverageModeDescription.textContent = instant
    ? 'Correct each marked type as you go.'
    : 'Hide results until you check coverage.';
  if (shouldSave) saveState();
  if (state.view === 'coverage') renderCoverage();
  if (shouldAnnounce) announce(`${instant ? 'Instant feedback' : 'Score when ready'} selected for Coverage.`);
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
  const completeRows = TYPE_IDS.reduce((count, row) => {
    const complete = TYPE_IDS.every((column) => {
      const { attack, defense } = matchupForVisibleCell(row, column);
      return hasAnswer(answers, cellKey(attack, defense));
    });
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
  elements.accuracyStat.title = shouldShowAccuracy ? 'Accuracy across scored cells' : 'Check the table to score every cell, including ×1 defaults';
  elements.rowsStat.innerHTML = `${stats.completeRows} <small>/ ${TYPE_IDS.length}</small>`;
  elements.progressPercent.textContent = `${progress}%`;
  elements.progressFill.style.width = `${progress}%`;
  elements.checkAnswers.disabled = false;

  const rowAnswered = TYPE_IDS.filter((column) => {
    const { attack, defense } = matchupForVisibleCell(currentMobileRow(), column);
    return hasAnswer(session.answers, cellKey(attack, defense));
  }).length;
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
    ? '<span aria-hidden="true">✓</span> Recheck table'
    : '<span aria-hidden="true">✓</span> Check table';
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
      ? 'Perfect table. Every matchup mastered.'
      : 'Table checked — here is your result.'
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
  const visible = visibleCoordinates(attack, defense);
  let rowIndex = TYPE_IDS.indexOf(visible.row);
  let columnIndex = TYPE_IDS.indexOf(visible.column);

  if (linearAdvance) {
    columnIndex += 1;
    if (columnIndex >= TYPE_IDS.length) {
      columnIndex = 0;
      rowIndex = (rowIndex + 1) % TYPE_IDS.length;
    }
  } else {
    rowIndex = (rowIndex + rowDelta + TYPE_IDS.length) % TYPE_IDS.length;
    columnIndex = (columnIndex + columnDelta + TYPE_IDS.length) % TYPE_IDS.length;
  }

  const targetMatchup = matchupForVisibleCell(TYPE_IDS[rowIndex], TYPE_IDS[columnIndex]);
  const target = elements.typeChart.querySelector(
    `.chart-cell[data-attack="${targetMatchup.attack}"][data-defense="${targetMatchup.defense}"]`,
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
  announce(`Table scored. ${stats.correct} of ${TOTAL_MATCHUPS} matchups are correct. Unmarked cells were scored as ${formatMultiplier(1)}.`);
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
    ? 'This clears every marked answer in the chart. All cells return to the default ×1.'
    : 'This clears the Quick Quiz score, streak, and current question.';
  elements.confirmReset.textContent = isChart ? 'Reset chart' : 'Reset run';
  elements.dialog.showModal();
}

function performReset() {
  if (resetTarget === 'chart') {
    state.chart = defaultSession();
    saveState();
    updateChartView();
    resetPrompt();
    announce('Chart reset.');
  } else {
    state.quick = defaultState().quick;
    generateQuestion();
    renderQuick();
    announce('Quick Quiz run reset.');
  }
}

function bindEvents() {
  elements.viewLinks.forEach((link) => {
    link.addEventListener('click', () => setView(link.dataset.viewTarget));
  });

  elements.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = elements.viewTabs.indexOf(tab);
      let nextIndex = currentIndex;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = elements.viewTabs.length - 1;
      else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + elements.viewTabs.length) % elements.viewTabs.length;
      } else {
        nextIndex = (currentIndex + 1) % elements.viewTabs.length;
      }
      const nextTab = elements.viewTabs[nextIndex];
      nextTab.focus();
      setView(nextTab.dataset.view);
    });
  });

  elements.themeToggle.addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark', { shouldAnnounce: true });
  });

  elements.feedbackToggle.addEventListener('click', () => {
    setMode(state.mode === 'practice' ? 'test' : 'practice');
  });

  elements.axisToggle.addEventListener('click', () => {
    setAxis(rowsAreAttackers() ? 'defense-rows' : 'attack-rows');
  });

  elements.coverageFeedbackToggle.addEventListener('click', () => {
    setCoverageMode(state.coverage.mode === 'practice' ? 'test' : 'practice');
  });
  elements.coverageShuffle.addEventListener('click', () => generateCoverageQuestion());
  elements.coverageReset.addEventListener('click', resetCoverageAnswers);
  elements.coverageCheck.addEventListener('click', checkCoverageAnswers);

  elements.coverageResults.addEventListener('click', (event) => {
    const paletteButton = event.target.closest('[data-coverage-palette]');
    if (paletteButton) {
      setCoverageMultiplier(
        paletteButton.dataset.coveragePalette,
        Number(paletteButton.dataset.coverageValue),
      );
      return;
    }
    const typeButton = event.target.closest('[data-coverage-direction][data-coverage-type]');
    if (typeButton) {
      toggleCoverageAnswer(typeButton.dataset.coverageDirection, typeButton.dataset.coverageType);
    }
  });

  elements.coverageResults.addEventListener('keydown', (event) => {
    const paletteButton = event.target.closest('[data-coverage-palette]');
    if (!paletteButton || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const direction = paletteButton.dataset.coveragePalette;
    const buttons = [...elements.coverageResults.querySelectorAll(`[data-coverage-palette="${direction}"]`)];
    const currentIndex = buttons.indexOf(paletteButton);
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = buttons.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    else nextIndex = (currentIndex + 1) % buttons.length;
    setCoverageMultiplier(direction, Number(buttons[nextIndex].dataset.coverageValue));
  });

  elements.coverageSummary.addEventListener('click', (event) => {
    if (event.target.closest('[data-coverage-action="next"]')) generateCoverageQuestion();
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

  elements.mobileRowType.addEventListener('change', () => {
    const rowRole = rowsAreAttackers() ? 'attack' : 'defense';
    state.mobileRows[rowRole] = elements.mobileRowType.value;
    saveState();
    renderMobileRow();
    updateChartView();
    announce(`${typeById(currentMobileRow()).name} selected as the ${rowRole === 'attack' ? 'attacking' : 'defending'} type.`);
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
    if (event.target.matches('input, select, textarea, button')) return;
    const keyValues = { 0: 0, h: 0.5, H: 0.5, 1: 1, 2: 2 };
    if (state.view === 'quick' && state.quick.answer === null && Object.prototype.hasOwnProperty.call(keyValues, event.key)) {
      event.preventDefault();
      answerQuick(keyValues[event.key]);
    } else if (state.view === 'quick' && state.quick.answer !== null && event.key === 'Enter') {
      event.preventDefault();
      nextQuestion();
    } else if (state.view === 'coverage' && Object.prototype.hasOwnProperty.call(keyValues, event.key)) {
      event.preventDefault();
      const direction = document.activeElement.closest?.('[data-coverage-direction]')?.dataset.coverageDirection
        ?? 'offense';
      setCoverageMultiplier(direction, keyValues[event.key]);
    }
  });
}

function initialize() {
  const requestedView = new URLSearchParams(window.location.search).get('view');
  if (['chart', 'coverage', 'quick'].includes(requestedView)) state.view = requestedView;
  renderDesktopChart();
  renderMobileSelector();
  bindEvents();
  setTheme(state.theme, { shouldSave: false });
  setAxis(state.axis, { shouldAnnounce: false, shouldSave: false });
  selectMultiplier(state.selected, false);
  setMode(state.mode, { shouldAnnounce: false, shouldSave: false });
  setCoverageMode(state.coverage.mode, { shouldAnnounce: false, shouldSave: false });
  setView(state.view);
  renderQuick();
  updateChartView();
}

initialize();
