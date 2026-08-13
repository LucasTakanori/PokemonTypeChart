import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { TYPES } from '../chart-data.js';

test('ships one safe local SVG icon for every type', async () => {
  assert.equal(TYPES.length, 18);

  for (const type of TYPES) {
    assert.equal(type.icon, `/assets/type-icons/${type.id}.svg`);
    const path = new URL(`../assets/type-icons/${type.id}.svg`, import.meta.url);
    await access(path);
    const svg = await readFile(path, 'utf8');
    assert.match(svg, /<svg\b/);
    assert.doesNotMatch(svg, /<script\b|\bhref\s*=|\bon\w+\s*=/i);
  }
});
