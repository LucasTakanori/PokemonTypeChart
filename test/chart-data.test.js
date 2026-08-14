import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TYPE_CHART,
  TYPE_IDS,
  coverageCategory,
  coveragePairsExcluding,
  defensiveCoverage,
  effectiveness,
  offensiveCoverage,
  scoreCoverageAnswers,
} from '../chart-data.js';

test('contains all 324 modern single-type matchups', () => {
  assert.equal(TYPE_IDS.length, 18);
  assert.equal(Object.values(TYPE_CHART).flatMap((row) => Object.values(row)).length, 324);
});

test('uses only the four valid damage multipliers', () => {
  const values = new Set(Object.values(TYPE_CHART).flatMap((row) => Object.values(row)));
  assert.deepEqual([...values].sort((a, b) => a - b), [0, 0.5, 1, 2]);
});

test('has the verified modern-chart distribution', () => {
  const counts = { 0: 0, 0.5: 0, 1: 0, 2: 0 };
  Object.values(TYPE_CHART).flatMap((row) => Object.values(row)).forEach((value) => counts[value]++);
  assert.deepEqual(counts, { 0: 8, 0.5: 61, 1: 204, 2: 51 });
});

test('contains exactly the eight immunities', () => {
  const immunities = [];
  for (const attack of TYPE_IDS) {
    for (const defense of TYPE_IDS) {
      if (effectiveness(attack, defense) === 0) immunities.push(`${attack}>${defense}`);
    }
  }

  assert.deepEqual(immunities.sort(), [
    'dragon>fairy',
    'electric>ground',
    'fighting>ghost',
    'ghost>normal',
    'ground>flying',
    'normal>ghost',
    'poison>steel',
    'psychic>dark',
  ]);
});

test('handles directional and modern-era edge cases', () => {
  assert.equal(effectiveness('normal', 'normal'), 1);
  assert.equal(effectiveness('fire', 'grass'), 2);
  assert.equal(effectiveness('grass', 'fire'), 0.5);
  assert.equal(effectiveness('ground', 'electric'), 2);
  assert.equal(effectiveness('electric', 'ground'), 0);
  assert.equal(effectiveness('fairy', 'dragon'), 2);
  assert.equal(effectiveness('dragon', 'fairy'), 0);
  assert.equal(effectiveness('ghost', 'steel'), 1);
  assert.equal(effectiveness('dark', 'steel'), 1);
  assert.equal(effectiveness('poison', 'bug'), 1);
});

test('uses the stronger selected attack for offensive coverage', () => {
  const coverage = offensiveCoverage(['fire', 'flying']);
  assert.equal(coverage.grass, 2);
  assert.equal(coverage.fighting, 2);
  assert.equal(coverage.steel, 2);
  assert.equal(coverage.rock, 0.5);
  assert.equal(coverage.water, 1);
});

test('multiplies both selected types for defensive coverage', () => {
  const coverage = defensiveCoverage(['fire', 'flying']);
  assert.equal(coverage.rock, 4);
  assert.equal(coverage.water, 2);
  assert.equal(coverage.electric, 2);
  assert.equal(coverage.fighting, 0.5);
  assert.equal(coverage.grass, 0.25);
  assert.equal(coverage.ground, 0);
});

test('duplicate selections behave like a single type', () => {
  assert.equal(offensiveCoverage(['fire', 'fire']).grass, 2);
  assert.equal(defensiveCoverage(['fire', 'fire']).water, 2);
});

test('coverage is order invariant and always returns all 18 types', () => {
  assert.deepEqual(offensiveCoverage(['electric', 'ground']), offensiveCoverage(['ground', 'electric']));
  assert.deepEqual(defensiveCoverage(['ground', 'flying']), defensiveCoverage(['flying', 'ground']));
  assert.equal(Object.keys(offensiveCoverage(['fire'])).length, 18);
  assert.equal(Object.keys(defensiveCoverage(['fire'])).length, 18);
});

test('coverage handles immunities, cancellation, and alternative moves', () => {
  const groundFlying = defensiveCoverage(['ground', 'flying']);
  assert.equal(groundFlying.electric, 0);
  assert.equal(groundFlying.ice, 4);
  assert.equal(groundFlying.rock, 1);
  assert.equal(offensiveCoverage(['normal', 'fighting']).ghost, 0);
  assert.equal(offensiveCoverage(['electric', 'fire']).ground, 1);
});

test('coverage quiz folds dual-type extremes into the requested answer categories', () => {
  assert.equal(coverageCategory(4), 2);
  assert.equal(coverageCategory(2), 2);
  assert.equal(coverageCategory(1), 1);
  assert.equal(coverageCategory(0.5), 0.5);
  assert.equal(coverageCategory(0.25), 0.5);
  assert.equal(coverageCategory(0), 0);
  assert.throws(() => coverageCategory(3), RangeError);
});

test('coverage quiz scores unmarked types as neutral', () => {
  const offense = offensiveCoverage(['fire', 'flying']);
  const defense = defensiveCoverage(['fire', 'flying']);
  const offenseAnswers = {
    grass: 2, ice: 2, fighting: 2, bug: 2, steel: 2, rock: 0.5,
  };
  const defenseAnswers = {
    rock: 2, water: 2, electric: 2,
    fire: 0.5, fighting: 0.5, grass: 0.5, bug: 0.5, steel: 0.5, fairy: 0.5,
    ground: 0,
  };

  assert.deepEqual(scoreCoverageAnswers(offense, offenseAnswers), {
    correct: 18, incorrect: 0, total: 18,
  });
  assert.deepEqual(scoreCoverageAnswers(defense, defenseAnswers), {
    correct: 18, incorrect: 0, total: 18,
  });
  assert.equal(scoreCoverageAnswers(offense).correct, 12);
  assert.equal(scoreCoverageAnswers(defense).correct, 8);
});

test('coverage quiz offers every distinct unordered pair except the previous challenge', () => {
  const allPairs = coveragePairsExcluding();
  assert.equal(allPairs.length, 153);
  assert.equal(new Set(allPairs.map((pair) => [...pair].sort().join('|'))).size, 153);
  assert.ok(allPairs.every(([first, second]) => first !== second));

  const withoutPrevious = coveragePairsExcluding(['flying', 'fire']);
  assert.equal(withoutPrevious.length, 152);
  assert.ok(!withoutPrevious.some((pair) => [...pair].sort().join('|') === 'fire|flying'));
});
