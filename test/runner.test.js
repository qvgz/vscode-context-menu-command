'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile, chmod } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { runCommand } = require('../src/runner');

async function fixture(t) {
  const folder = await mkdtemp(path.join(tmpdir(), '命令 测试-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  return folder;
}

test('passes literal arguments and folder, sets cwd and captures both streams', async t => {
  const folder = await fixture(t);
  let stdout = '', stderr = '';
  const literal = '中文 space; $(echo unsafe) "quoted"';
  await runCommand({ command: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd()}));console.error("diagnostic")', '--', literal],
    folder, onOutput: (stream, data) => { if (stream === 'stdout') stdout += data; else stderr += data; }
  });
  const result = JSON.parse(stdout);
  assert.deepEqual(result.args, [literal, folder]);
  // macOS resolves /var to /private/var in process.cwd().
  const { realpath } = require('node:fs/promises');
  assert.equal(result.cwd, await realpath(folder));
  assert.match(stderr, /diagnostic/);
});

test('reports missing executable and nonzero exit', async t => {
  const folder = await fixture(t);
  await assert.rejects(runCommand({ command: path.join(folder, 'missing'), args: [], folder }), { code: 'ENOENT' });
  await assert.rejects(runCommand({ command: process.execPath, args: ['-e', 'process.exit(7)'], folder }), { message: 'EXIT_FAILED', exitCode: 7 });
});

test('rejects invalid configuration, files and nonexecutable programs', async t => {
  const folder = await fixture(t);
  const file = path.join(folder, 'not executable');
  await writeFile(file, 'test');
  await chmod(file, 0o600);
  await assert.rejects(runCommand({ command: '', args: [], folder }), /INVALID_COMMAND/);
  await assert.rejects(runCommand({ command: 'code', args: 'bad', folder }), /INVALID_ARGS/);
  await assert.rejects(runCommand({ command: 'code', args: [null], folder }), /INVALID_ARGS/);
  await assert.rejects(runCommand({ command: 'code', args: [], folder: file }), /INVALID_FOLDER/);
  await assert.rejects(runCommand({ command: file, args: [], folder }), { code: 'EACCES' });
});

test('manifest menus and localization are complete', () => {
  const manifest = require('../package.json');
  const en = require('../package.nls.json');
  const zh = require('../package.nls.zh-cn.json');
  const placeholders = JSON.stringify(manifest).matchAll(/%([^%]+)%/g);
  for (const [, key] of placeholders) {
    assert.ok(en[key], `English: ${key}`);
    assert.ok(zh[key], `Chinese: ${key}`);
  }
  for (const menu of manifest.contributes.menus['explorer/context']) {
    assert.match(menu.when, /explorerResourceIsFolder/);
    assert.match(menu.when, /resourceScheme == file/);
    assert.match(menu.when, /!remoteName/);
  }
});
