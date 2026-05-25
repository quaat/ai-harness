import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { doctorCommand } from '../dist/commands/doctor.js';

test('README contains required guide sections', async () => {
  const readme = await fs.readFile('README.md', 'utf8');
  for (const heading of [
    '## Fresh project walkthrough',
    '## Existing repo retrofit walkthrough',
    '## Full Claude + Codex workflow',
    '## Task artifact layout',
    '## Troubleshooting',
    '## Security model and limitations'
  ]) {
    assert.match(readme, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

async function setupHarnessDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-doctor-'));
  await fs.ensureDir(path.join(dir, '.claude/skills/implement-plan'));
  await fs.ensureDir(path.join(dir, '.claude/skills/retrieve-context'));
  await fs.ensureDir(path.join(dir, '.claude/skills/verify-change'));
  await fs.ensureDir(path.join(dir, '.claude/skills/prepare-codex-review'));
  await fs.ensureDir(path.join(dir, '.claude/hooks'));
  await fs.ensureDir(path.join(dir, '.ai/rag'));
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '# x');
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), '@AGENTS.md');
  await fs.writeFile(path.join(dir, 'ai-harness.config.yaml'), 'rag:\n  include: [src]');
  await fs.writeFile(path.join(dir, '.claude/settings.json'), '{}');
  for (const skill of ['implement-plan','retrieve-context','verify-change','prepare-codex-review']) {
    await fs.writeFile(path.join(dir, `.claude/skills/${skill}/SKILL.md`), '# skill');
  }
  await fs.writeFile(path.join(dir, '.claude/hooks/block-dangerous-bash.sh'), '#!/usr/bin/env bash');
  await fs.writeFile(path.join(dir, '.claude/hooks/after-edit-check.sh'), '#!/usr/bin/env bash');
  await fs.writeFile(path.join(dir, '.ai/rag/index.jsonl'), '{}\n');
  await fs.writeFile(path.join(dir, '.ai/rag/manifest.json'), '{}');
  return dir;
}

test('doctor supports human-readable default and json mode', async () => {
  const dir = await setupHarnessDir();
  const cwd = process.cwd();
  process.chdir(dir);
  const old = console.log;
  const logs = [];
  console.log = (m) => logs.push(String(m));
  try { await doctorCommand(); } finally { console.log = old; process.chdir(cwd); }
  const human = logs.join('\n');
  assert.match(human, /ai-harness doctor/);
  assert.match(human, /Required files:/);
  assert.match(human, /Result:/);

  process.chdir(dir);
  const jsonLogs = [];
  console.log = (m) => jsonLogs.push(String(m));
  try { await doctorCommand({ json: true }); } finally { console.log = old; process.chdir(cwd); }
  assert.doesNotThrow(() => JSON.parse(jsonLogs.join('\n')));
});
