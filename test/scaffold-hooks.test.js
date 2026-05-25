import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('scaffold defines safe jq-based hook JSON output', () => {
  const source = fs.readFileSync('src/core/scaffold.ts', 'utf8');
  assert.match(source, /jq -n --arg reason/);
  assert.match(source, /permissionDecisionReason/);
  assert.match(source, /additionalContext/);
});
