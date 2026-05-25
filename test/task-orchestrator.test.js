import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { createTaskFiles, readTask } from '../dist/core/task-store.js';
import { taskManifestSchema } from '../dist/core/task-schema.js';
import { taskCommand } from '../dist/commands/task.js';

async function gitRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-task-'));
  await execa('git', ['init'], { cwd: dir });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  await fs.writeJson(path.join(dir, 'package.json'), { name:'x', scripts:{ typecheck:'echo ok', test:'echo ok', build:'echo ok' } });
  await fs.writeFile(path.join(dir, 'README.md'), 'hello');
  await execa('git', ['add','-A'], { cwd: dir }); await execa('git', ['commit','-m','init'], { cwd: dir });
  return dir;
}

test('task create/context/claude/codex/hardening flow', async () => {
  const dir = await gitRepo(); process.chdir(dir);
  const cmd = taskCommand();
  await cmd.parseAsync(['create','user-auth','--prompt','Add auth'], { from: 'user' });
  assert.equal(await fs.pathExists('.ai/tasks/user-auth/task.yaml'), true);
  const man = await readTask(dir, 'user-auth'); assert.equal(taskManifestSchema.safeParse(man).success, true);
  assert.match(await fs.readFile('.ai/tasks/user-auth/prompt.md','utf8'), /# Task: user-auth/);
  await fs.ensureDir('.ai/rag');
  await fs.writeFile('.ai/rag/index.jsonl', JSON.stringify({ id:'1', path:'src/x.ts', startLine:1, endLine:2, heading:'h', text:'auth login route', keywords:['auth'] })+'\n');
  await cmd.parseAsync(['context','user-auth','--query','auth login route'], { from:'user' });
  assert.match(await fs.readFile('.ai/tasks/user-auth/context.md','utf8'), /Relevant chunks/);
  await cmd.parseAsync(['claude','user-auth'], { from:'user' });
  assert.match(await fs.readFile('.ai/tasks/user-auth/claude-implement.md','utf8'), /Read ONLY/);
  await cmd.parseAsync(['codex-review','user-auth'], { from:'user' });
  assert.match(await fs.readFile('.ai/tasks/user-auth/codex-review-prompt.md','utf8'), /do not rewrite implementation/i);
  await fs.writeFile('.ai/tasks/user-auth/codex-review.md', '## Instructions for Claude\n- fix A\n\n## Required fixes\n- req\n\n## Test gaps\n- gap\n\n## Security review\n- sec\n\n## Suggested hardening\n- opt');
  await cmd.parseAsync(['hardening','user-auth'], { from:'user' });
  assert.match(await fs.readFile('.ai/tasks/user-auth/claude-fix-instructions.md','utf8'), /Required fixes/);
});
