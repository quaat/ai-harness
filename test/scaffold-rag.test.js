import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { scaffoldHarness } from '../dist/core/scaffold.js';
import { buildIndex } from '../dist/core/rag.js';
import { searchCommand } from '../dist/commands/search.js';

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
  assert.ok(settings.hooks.PreToolUse.some((h) => h.matcher === 'Read|Glob|Grep'));
  const pre = await fs.readFile(path.join(dir, '.claude/hooks/block-dangerous-bash.sh'), 'utf8');
  assert.match(pre, /tool_input\.command/);
  const mode = (await fs.stat(path.join(dir, '.claude/hooks/block-dangerous-bash.sh'))).mode & 0o777;
  assert.equal(mode, 0o755);
  const nudgeMode = (await fs.stat(path.join(dir, '.claude/hooks/nudge-retrieve-context.sh'))).mode & 0o777;
  assert.equal(nudgeMode, 0o755);
});

test('generated docs and retrieve-context skill enforce retrieval-first guidance', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-docs-'));
  await scaffoldHarness(dir, detected, { agents: ['codex', 'claude'], rag: 'local-jsonl', force: true });
  const agents = await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /## Context minimization/);
  assert.match(agents, /ai-harness search/);
  assert.match(agents, /\.ai\/retrieval-notes\/<task-id>\.md/);
  const claude = await fs.readFile(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /@AGENTS\.md/);
  assert.match(claude, /retrieve-context\/SKILL\.md/);
  assert.match(claude, /Prefer `ai-harness search` over wide `Read`, `Glob`, or `Grep` operations/);
  const skill = await fs.readFile(path.join(dir, '.claude/skills/retrieve-context/SKILL.md'), 'utf8');
  assert.match(skill, /## Output format/);
  assert.match(skill, /- Query used/);
  assert.match(skill, /- Relevant chunks/);
  assert.match(skill, /- Files\/line ranges to inspect/);
  assert.match(skill, /- What not to read/);
  assert.match(skill, /- Open questions/);
});

test('dangerous bash hook denies destructive commands from stdin JSON', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-hook-run-'));
  await scaffoldHarness(dir, detected, { agents: ['codex', 'claude'], rag: 'local-jsonl', force: true });
  const hookPath = path.join(dir, '.claude/hooks/block-dangerous-bash.sh');
  const input = JSON.stringify({ tool_input: { command: 'rm -rf /tmp/demo' } });
  const result = spawnSync(hookPath, {
    input,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /Blocked potentially destructive command/);
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

test('search output is retrieval-focused and includes read-only guidance', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-search-'));
  await fs.ensureDir(path.join(dir, 'src'));
  await fs.ensureDir(path.join(dir, '.ai/rag'));
  await fs.writeFile(path.join(dir, 'src/app.ts'), 'export function calcTotal() { return 42; }\n');
  await fs.writeFile(path.join(dir, 'ai-harness.config.yaml'), YAML.stringify({ rag: { include: ['src'], exclude: [] } }));
  await buildIndex(dir);
  const logs = [];
  const orig = console.log;
  console.log = (msg) => logs.push(String(msg));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    await searchCommand('calcTotal', { topK: '1' });
  } finally {
    process.chdir(cwd);
    console.log = orig;
  }
  const out = logs.join('\n');
  assert.match(out, /#1 src\/app\.ts:\d+-\d+/);
  assert.match(out, /Heading:/);
  assert.match(out, /Snippet:/);
  assert.match(out, /Read only these paths\/line ranges unless more context is needed\./);
});
