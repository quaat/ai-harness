import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { taskCommand } from '../dist/commands/task.js';
import { readTask } from '../dist/core/task-store.js';
import { renderGhCreateCommand } from '../dist/core/pr.js';

async function gitRepo(opts = { withPackage: true }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-task-'));
  await execa('git', ['init'], { cwd: dir });
  await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  if (opts.withPackage) await fs.writeJson(path.join(dir, 'package.json'), { name:'x', scripts:{ typecheck:'echo ok', test:'echo ok', build:'echo ok' } });
  await fs.writeFile(path.join(dir, 'README.md'), 'hello');
  await execa('git', ['add','-A'], { cwd: dir }); await execa('git', ['commit','-m','init'], { cwd: dir });
  return dir;
}

async function runTask(args, cwd) {
  const old = process.cwd();
  process.chdir(cwd);
  try { await taskCommand().parseAsync(args, { from: 'user' }); }
  finally { process.chdir(old); }
}

test('invalid task id is rejected for non-create commands', async () => {
  const dir = await gitRepo();
  await assert.rejects(() => runTask(['status','../bad'], dir), /Invalid task ID/);
});

test('implementation commit records valid non-stale SHA', async () => {
  const dir = await gitRepo();
  await runTask(['create','foo','--prompt','x','--no-branch'], dir);
  await fs.writeFile(path.join(dir, 'notes.txt'), 'ok');
  await runTask(['commit','foo'], dir);
  const t = await readTask(dir, 'foo');
  assert.ok(t.commits.implementation);
  await execa('git', ['cat-file', '-e', t.commits.implementation], { cwd: dir });
  const log = (await execa('git', ['log', '--pretty=%s', '-n', '2'], { cwd: dir })).stdout;
  assert.match(log, /chore\(foo\): record implementation task metadata/);
  assert.match(log, /feat\(foo\): implement task/);
});

test('hardening commit records valid SHA', async () => {
  const dir = await gitRepo();
  await runTask(['create','hard','--prompt','x','--no-branch'], dir);
  await fs.writeFile(path.join(dir, 'a.txt'), '1');
  await runTask(['commit','hard'], dir);
  await fs.writeFile(path.join(dir, 'b.txt'), '2');
  await runTask(['commit','hard','--phase','hardening'], dir);
  const t = await readTask(dir, 'hard');
  assert.ok(t.commits.hardening);
  await execa('git', ['cat-file', '-e', t.commits.hardening], { cwd: dir });
});

test('commit refuses untracked secret-like files', async () => {
  const dir = await gitRepo();
  await runTask(['create','sec','--prompt','x','--no-branch'], dir);
  await fs.writeFile(path.join(dir, '.env'), 'SECRET=1');
  await assert.rejects(() => runTask(['commit','sec'], dir), /Refusing to commit possible secret files/);
});

test('commit allows normal untracked files', async () => {
  const dir = await gitRepo();
  await runTask(['create','ok','--prompt','x','--no-branch'], dir);
  await fs.writeFile(path.join(dir, 'feature.txt'), 'safe');
  await runTask(['commit','ok'], dir);
  const t = await readTask(dir, 'ok');
  assert.ok(t.commits.implementation);
});

test('commit rejects wrong branch and invalid phase', async () => {
  const dir = await gitRepo();
  await runTask(['create','wb','--prompt','x'], dir);
  await execa('git', ['checkout', 'master'], { cwd: dir });
  await fs.writeFile(path.join(dir, 'x.txt'), 'x');
  await assert.rejects(() => runTask(['commit','wb'], dir), /Current branch must be/);
  await execa('git', ['checkout', 'ai/wb'], { cwd: dir });
  await assert.rejects(() => runTask(['commit','wb','--phase','banana'], dir), /Invalid --phase value/);
});

test('task pr refuses because generated artifacts dirty worktree by default', async () => {
  const dir = await gitRepo();
  await runTask(['create','prx','--prompt','x'], dir);
  await fs.writeFile(path.join(dir, '.ai/tasks/prx/codex-review.md'), 'review');
  await fs.writeFile(path.join(dir, 'f.txt'), 'x');
  await runTask(['commit','prx','--no-checks'], dir);
  await assert.rejects(() => runTask(['pr','prx','--skip-review'], dir), /Generated PR artifacts changed the working tree/);
});

test('task pr fallback does not dirty worktree', async () => {
  const dir = await gitRepo();
  await runTask(['create','prclean','--prompt','x'], dir);
  await fs.writeFile(path.join(dir, '.ai/tasks/prclean/codex-review.md'), 'review');
  await fs.writeFile(path.join(dir, 'f.txt'), 'x');
  await runTask(['commit','prclean','--no-checks'], dir);
  await assert.rejects(() => runTask(['pr','prclean','--skip-review'], dir), /Generated PR artifacts changed the working tree/);
  await execa('git', ['add', '-A'], { cwd: dir });
  await execa('git', ['commit', '-m', 'chore: commit pr artifacts'], { cwd: dir });
  const logs = [];
  const old = console.log;
  console.log = (m) => logs.push(String(m));
  try { await runTask(['pr','prclean','--skip-review'], dir); }
  finally { console.log = old; }
  const st = (await execa('git', ['status', '--porcelain'], { cwd: dir })).stdout.trim();
  assert.equal(st, '');
  assert.match(logs.join('\n'), /gh not available\. Run:/);
});

test('gh fallback command is shell-quoted safely', async () => {
  const cmd = renderGhCreateCommand({ baseBranch: 'main', headBranch: 'ai/t', title: `hello "quote" and 'single'`, bodyFile: '.ai/tasks/t/pr.md', draft: true });
  assert.match(cmd, /'"'"'/);
  assert.match(cmd, /--draft/);
});

test('non-node repos mark checks skipped', async () => {
  const dir = await gitRepo({ withPackage: false });
  await runTask(['create','py','--prompt','x','--no-branch'], dir);
  await fs.writeFile(path.join(dir, 'a.py'), 'print(1)');
  await runTask(['commit','py'], dir);
  const t = await readTask(dir, 'py');
  assert.equal(t.checks.typecheck, 'skipped');
  const testsMd = await fs.readFile(path.join(dir, '.ai/tasks/py/tests.md'), 'utf8');
  assert.match(testsMd, /No project checks were configured\/applicable/);
});
