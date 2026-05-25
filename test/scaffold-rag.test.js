import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { scaffoldHarness } from '../dist/core/scaffold.js';
import { buildIndex } from '../dist/core/rag.js';

const detected = { stack: 'node', packageManager: 'npm', commands: {} };

test('retrofit dry-run does not create files or directories', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-dry-'));
  const changes = await scaffoldHarness(dir, detected, { agents: ['codex', 'claude'], rag: 'local-jsonl', dryRun: true });
  assert.ok(changes.length > 0);
  assert.equal(await fs.pathExists(path.join(dir, '.ai')), false);
  assert.equal(await fs.pathExists(path.join(dir, '.claude')), false);
  assert.equal(await fs.pathExists(path.join(dir, 'docs')), false);
});

test('merge appends managed block and does not overwrite unmanaged content', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-merge-'));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '# Custom\n\nKeep this.\n');
  await scaffoldHarness(dir, detected, { agents: ['codex', 'claude'], rag: 'local-jsonl', merge: true });
  const next = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.match(next, /Keep this\./);
  assert.match(next, /ai-harness:start/);
});

test('claude settings and hooks are generated with expected schema and executability', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-hook-'));
  await scaffoldHarness(dir, detected, { agents: ['codex', 'claude'], rag: 'local-jsonl' , force: true});
  const settings = JSON.parse(await fs.readFile(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.ok(Array.isArray(settings.hooks.PreToolUse));
  assert.ok(Array.isArray(settings.hooks.PostToolUse));
  const pre = await fs.readFile(path.join(dir, '.claude/hooks/block-dangerous-bash.sh'), 'utf8');
  assert.match(pre, /tool_input\.command/);
  const mode = (await fs.stat(path.join(dir, '.claude/hooks/block-dangerous-bash.sh'))).mode & 0o777;
  assert.equal(mode, 0o755);
});

test('rag applies include/exclude and skips secrets', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-rag-'));
  await fs.ensureDir(path.join(dir, 'src'));
  await fs.ensureDir(path.join(dir, 'node_modules/pkg'));
  await fs.writeFile(path.join(dir, 'src/app.ts'), 'export const ok = 1;\n'.repeat(4));
  await fs.writeFile(path.join(dir, '.env'), 'SECRET=1\n');
  await fs.writeFile(path.join(dir, 'node_modules/pkg/index.js'), 'leak\n');
  await fs.writeFile(path.join(dir, 'ai-harness.config.yaml'), YAML.stringify({ rag: { include: ['.'], exclude: ['node_modules'] } }));
  await buildIndex(dir);
  const rows = (await fs.readFile(path.join(dir, '.ai/rag/index.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map((r) => JSON.parse(r));
  assert.ok(rows.some((r) => r.path === 'src/app.ts'));
  assert.equal(rows.some((r) => r.path === '.env'), false);
  assert.equal(rows.some((r) => r.path.startsWith('node_modules/')), false);
});
