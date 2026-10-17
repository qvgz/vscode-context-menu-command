'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');

test('activation, visibility updates, latest configuration and local guards', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'extension-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const handlers = new Map(), contexts = new Map(), errors = [];
  let contextUpdates = 0;
  const settings = { 'openCode.enabled': true, 'openCode.command': process.execPath,
    'openCode.args': ['-e', 'process.exit(0)'] };
  let listener;
  class Uri {
    constructor(scheme, fsPath) { this.scheme = scheme; this.fsPath = fsPath; }
  }
  const disposable = { dispose() {} };
  const api = {
    Uri, env: { language: 'zh-cn' },
    workspace: {
      isTrusted: true,
      getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
      onDidChangeConfiguration: callback => { listener = callback; return disposable; }
    },
    commands: {
      executeCommand: async (name, key, value) => { contextUpdates++; contexts.set(key, value); },
      registerCommand: (name, handler) => { handlers.set(name, handler); return disposable; }
    },
    window: {
      createOutputChannel: () => ({ ...disposable, append() {}, appendLine() {}, show() {} }),
      showErrorMessage: async text => { errors.push(text); }
    }
  };
  const original = Module._load;
  let extension;
  try {
    Module._load = function(id, ...args) { return id === 'vscode' ? api : original.call(this, id, ...args); };
    extension = require('../src/extension');
  } finally { Module._load = original; }
  await extension.activate({ subscriptions: [] });
  assert.deepEqual([...handlers.keys()], ['contextMenuCommand.openCode']);
  assert.equal(contexts.get('contextMenuCommand.openCodeEnabled'), true);
  assert.equal(contexts.size, 1);
  const run = handlers.get('contextMenuCommand.openCode');
  await run(new Uri('file', folder));
  assert.equal(errors.length, 0);
  settings['openCode.args'] = ['-e', 'process.exit(9)'];
  const before = contextUpdates;
  listener({ affectsConfiguration: key => key.endsWith('.args') });
  assert.equal(contextUpdates, before);
  await run(new Uri('file', folder));
  assert.match(errors.pop(), /退出码：9/);
  settings['openCode.enabled'] = false;
  listener({ affectsConfiguration: () => true });
  assert.equal(contexts.get('contextMenuCommand.openCodeEnabled'), false);
  await run(new Uri('file', folder));
  assert.match(errors.pop(), /关闭/);
  settings['openCode.enabled'] = true;
  await run(new Uri('vscode-remote', folder));
  assert.match(errors.pop(), /本地/);
  api.env.remoteName = 'ssh-remote';
  await run(new Uri('file', folder));
  assert.match(errors.pop(), /本地/);
  api.env.remoteName = undefined;
  api.workspace.isTrusted = false;
  await run(new Uri('file', folder));
  assert.match(errors.pop(), /受信任/);
});
