export const TYPES = [
  { id: 'normal', name: 'Normal', short: 'NOR', color: '#8b9299', ink: '#ffffff' },
  { id: 'fire', name: 'Fire', short: 'FIR', color: '#ed593b', ink: '#ffffff' },
  { id: 'water', name: 'Water', short: 'WAT', color: '#3f7fd4', ink: '#ffffff' },
  { id: 'electric', name: 'Electric', short: 'ELE', color: '#e8b526', ink: '#1e2736' },
  { id: 'grass', name: 'Grass', short: 'GRA', color: '#5a9e4b', ink: '#ffffff' },
  { id: 'ice', name: 'Ice', short: 'ICE', color: '#55b9bf', ink: '#173237' },
  { id: 'fighting', name: 'Fighting', short: 'FIG', color: '#c94b56', ink: '#ffffff' },
  { id: 'poison', name: 'Poison', short: 'POI', color: '#9956b8', ink: '#ffffff' },
  { id: 'ground', name: 'Ground', short: 'GRO', color: '#cc8f46', ink: '#ffffff' },
  { id: 'flying', name: 'Flying', short: 'FLY', color: '#758ed5', ink: '#ffffff' },
  { id: 'psychic', name: 'Psychic', short: 'PSY', color: '#df5b88', ink: '#ffffff' },
  { id: 'bug', name: 'Bug', short: 'BUG', color: '#849d2c', ink: '#ffffff' },
  { id: 'rock', name: 'Rock', short: 'ROC', color: '#a78f4c', ink: '#ffffff' },
  { id: 'ghost', name: 'Ghost', short: 'GHO', color: '#655b91', ink: '#ffffff' },
  { id: 'dragon', name: 'Dragon', short: 'DRA', color: '#5864bd', ink: '#ffffff' },
  { id: 'dark', name: 'Dark', short: 'DAR', color: '#50494a', ink: '#ffffff' },
  { id: 'steel', name: 'Steel', short: 'STE', color: '#588697', ink: '#ffffff' },
  { id: 'fairy', name: 'Fairy', short: 'FAI', color: '#d576a3', ink: '#ffffff' },
].map((type) => ({
  ...type,
  icon: `/assets/type-icons/${type.id}.svg`,
}));

export const TYPE_IDS = TYPES.map((type) => type.id);

const COVERAGE_PAIRS = TYPE_IDS.flatMap((first, index) =>
  TYPE_IDS.slice(index + 1).map((second) => [first, second]));

export function coveragePairsExcluding(previousTypes = []) {
  const previousKey = Array.isArray(previousTypes)
    && previousTypes.length === 2
    && previousTypes.every((type) => TYPE_IDS.includes(type))
    && previousTypes[0] !== previousTypes[1]
    ? [...previousTypes].sort().join('|')
    : null;
  return COVERAGE_PAIRS
    .filter((types) => [...types].sort().join('|') !== previousKey)
    .map((types) => [...types]);
}

// Modern core-series chart (Generation VI onward). Omitted matchups are neutral.
export const MATCHUPS = {
  normal: { half: ['rock', 'steel'], zero: ['ghost'] },
  fire: { double: ['grass', 'ice', 'bug', 'steel'], half: ['fire', 'water', 'rock', 'dragon'] },
  water: { double: ['fire', 'ground', 'rock'], half: ['water', 'grass', 'dragon'] },
  electric: { double: ['water', 'flying'], half: ['electric', 'grass', 'dragon'], zero: ['ground'] },
  grass: { double: ['water', 'ground', 'rock'], half: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'] },
  ice: { double: ['grass', 'ground', 'flying', 'dragon'], half: ['fire', 'water', 'ice', 'steel'] },
  fighting: { double: ['normal', 'ice', 'rock', 'dark', 'steel'], half: ['poison', 'flying', 'psychic', 'bug', 'fairy'], zero: ['ghost'] },
  poison: { double: ['grass', 'fairy'], half: ['poison', 'ground', 'rock', 'ghost'], zero: ['steel'] },
  ground: { double: ['fire', 'electric', 'poison', 'rock', 'steel'], half: ['grass', 'bug'], zero: ['flying'] },
  flying: { double: ['grass', 'fighting', 'bug'], half: ['electric', 'rock', 'steel'] },
  psychic: { double: ['fighting', 'poison'], half: ['psychic', 'steel'], zero: ['dark'] },
  bug: { double: ['grass', 'psychic', 'dark'], half: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'] },
  rock: { double: ['fire', 'ice', 'flying', 'bug'], half: ['fighting', 'ground', 'steel'] },
  ghost: { double: ['psychic', 'ghost'], half: ['dark'], zero: ['normal'] },
  dragon: { double: ['dragon'], half: ['steel'], zero: ['fairy'] },
  dark: { double: ['psychic', 'ghost'], half: ['fighting', 'dark', 'fairy'] },
  steel: { double: ['ice', 'rock', 'fairy'], half: ['fire', 'water', 'electric', 'steel'] },
  fairy: { double: ['fighting', 'dragon', 'dark'], half: ['fire', 'poison', 'steel'] },
};

export function effectiveness(attack, defense) {
  if (!TYPE_IDS.includes(attack) || !TYPE_IDS.includes(defense)) {
    throw new RangeError(`Unknown Pokémon type: ${attack} → ${defense}`);
  }

  const row = MATCHUPS[attack];
  if (row.zero?.includes(defense)) return 0;
  if (row.half?.includes(defense)) return 0.5;
  if (row.double?.includes(defense)) return 2;
  return 1;
}

function uniqueKnownTypes(typeIds) {
  const unique = [...new Set(typeIds)];
  if (!unique.length || unique.some((type) => !TYPE_IDS.includes(type))) {
    throw new RangeError(`Unknown or empty Pokémon type selection: ${typeIds.join(', ')}`);
  }
  return unique;
}

export function offensiveCoverage(typeIds) {
  const attackingTypes = uniqueKnownTypes(typeIds);
  return Object.fromEntries(
    TYPE_IDS.map((defense) => [
      defense,
      Math.max(...attackingTypes.map((attack) => effectiveness(attack, defense))),
    ]),
  );
}

export function defensiveCoverage(typeIds) {
  const defendingTypes = uniqueKnownTypes(typeIds);
  return Object.fromEntries(
    TYPE_IDS.map((attack) => [
      attack,
      defendingTypes.reduce(
        (multiplier, defense) => multiplier * effectiveness(attack, defense),
        1,
      ),
    ]),
  );
}

export function coverageCategory(multiplier) {
  const value = Number(multiplier);
  if (![0, 0.25, 0.5, 1, 2, 4].includes(value)) {
    throw new RangeError(`Unknown coverage multiplier: ${multiplier}`);
  }
  if (value === 0) return 0;
  if (value < 1) return 0.5;
  if (value > 1) return 2;
  return 1;
}

export function scoreCoverageAnswers(profile, answers = {}) {
  if (!profile || typeof profile !== 'object' || !answers || typeof answers !== 'object') {
    throw new TypeError('Coverage profile and answers must be objects.');
  }
  if (Object.keys(answers).some((type) => !TYPE_IDS.includes(type))) {
    throw new RangeError('Coverage answers contain an unknown Pokémon type.');
  }

  const correct = TYPE_IDS.reduce((count, type) => {
    const expected = coverageCategory(profile[type]);
    const answer = Object.prototype.hasOwnProperty.call(answers, type)
      ? Number(answers[type])
      : 1;
    if (![0, 0.5, 1, 2].includes(answer)) {
      throw new RangeError(`Unknown coverage answer: ${answers[type]}`);
    }
    return count + Number(answer === expected);
  }, 0);
  return { correct, incorrect: TYPE_IDS.length - correct, total: TYPE_IDS.length };
}

export const TYPE_CHART = Object.fromEntries(
  TYPE_IDS.map((attack) => [
    attack,
    Object.fromEntries(TYPE_IDS.map((defense) => [defense, effectiveness(attack, defense)])),
  ]),
);

export function typeById(id) {
  return TYPES.find((type) => type.id === id);
}
