import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../src/version.js';

test('APP_VERSION segue o formato 2.X.Y', () => {
  assert.match(APP_VERSION, /^2\.\d+\.\d+$/);
});

test('package.json tem a mesma versão do app', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.version, APP_VERSION);
});
