'use strict';

const vscode = require('vscode');
const { runCommand } = require('./runner');
const namespace = 'contextMenuCommand';
const { contributes } = require('../package.json');
const actions = contributes.commands.map(({ command }) => ({
  command,
  key: command.slice(namespace.length + 1)
}));
const chinese = () => /^zh-cn(?:$|-)/i.test(vscode.env.language);
const message = (en, zh) => chinese() ? zh : en;

async function activate(context) {
  const output = vscode.window.createOutputChannel('Context Menu Commands');
  context.subscriptions.push(output);
  let runId = 0;
  const config = () => vscode.workspace.getConfiguration(namespace);
  const syncVisibility = (changed = actions) => {
    const settings = config();
    return Promise.all(changed.map(({ key }) =>
      vscode.commands.executeCommand('setContext', `${namespace}.${key}Enabled`,
        settings.get(`${key}.enabled`, false) === true)
    ));
  };
  const reportSyncError = error => output.appendLine(`Menu update: ${error.message}`);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    const changed = actions.filter(({ key }) => event.affectsConfiguration(`${namespace}.${key}.enabled`));
    if (changed.length) syncVisibility(changed).catch(reportSyncError);
  }));

  for (const { command: commandId, key: action } of actions) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, async uri => {
      const id = ++runId;
      try {
        if (!vscode.workspace.isTrusted || vscode.env.remoteName || !(uri instanceof vscode.Uri) || uri.scheme !== 'file') {
          throw new Error('LOCAL_ONLY');
        }
        const settings = config();
        if (!settings.get(`${action}.enabled`, false)) throw new Error('DISABLED');
        const command = settings.get(`${action}.command`);
        const args = settings.get(`${action}.args`);
        output.appendLine(`[${id}] ${action}: ${JSON.stringify({ command, folder: uri.fsPath })}`);
        await runCommand({ command, args, folder: uri.fsPath,
          onOutput: (stream, data) => output.append(`[${id} ${stream}] ${data}`)
        });
        output.appendLine(`\n[${id}] exit: 0`);
      } catch (error) {
        const messages = {
          LOCAL_ONLY: ['Select a local folder in a trusted, local window.', '请在受信任的本地窗口中选择本地文件夹。'],
          DISABLED: ['This action is disabled in Settings.', '此操作已在设置中关闭。'],
          INVALID_COMMAND: ['Configure an executable name or path in Settings.', '请在设置中配置可执行文件名称或路径。'],
          INVALID_ARGS: ['Command arguments must be an array of strings.', '命令参数必须为字符串数组。'],
          INVALID_FOLDER: ['The selected resource must be a folder.', '所选资源必须为文件夹。'],
          ENOENT: ['Command or folder not found. Check the executable path and VS Code PATH.', '命令或文件夹不存在，请检查可执行文件路径及 VS Code 的 PATH。'],
          ENOTDIR: ['The selected resource must be a folder.', '所选资源必须为文件夹。'],
          EACCES: ['Permission denied. Check executable and folder permissions.', '权限不足，请检查可执行文件及文件夹权限。'],
          EPERM: ['Operation not permitted. Check executable and folder permissions.', '操作不被允许，请检查可执行文件及文件夹权限。'],
          EXIT_FAILED: [`Command failed (exit: ${error.exitCode}, signal: ${error.signal || '-'}).`, `命令执行失败（退出码：${error.exitCode}，信号：${error.signal || '-'}）。`]
        };
        const pair = messages[error.code] || messages[error.message];
        const detail = pair ? message(...pair) : message(`Command failed: ${error.message}`, `命令执行失败：${error.message}`);
        output.appendLine(`\n[${id}] ${detail}`);
        const showLog = message('Show Log', '查看日志');
        if (await vscode.window.showErrorMessage(detail, showLog) === showLog) output.show(true);
      }
    }));
  }
  await syncVisibility();
}

module.exports = { activate };
