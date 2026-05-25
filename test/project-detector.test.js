import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { detectProject } from '../dist/core/project-detector.js';

test('detects python project', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aih-'));
  await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname="x"\n');
  const result = await detectProject(dir);
  assert.equal(result.stack, 'python');
});
