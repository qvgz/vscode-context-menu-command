# vscode-context-menu-command

适用于 VS Code 1.142.0 及以上版本（重点支持 macOS），通过资源管理器本地文件夹右键菜单执行配置的命令。目前提供“在 Code 中打开 / Open in Code”，可按需求扩展其他固定操作。支持简体中文和英文，其他语言回退英文，菜单默认关闭。

## 配置

```json
{
  "contextMenuCommand.openCode.enabled": true,
  "contextMenuCommand.openCode.command": "code",
  "contextMenuCommand.openCode.args": ["--new-window"]
}
```

`command` 为 PATH 中的可执行文件名称或完整路径，`args` 为字符串数组。所选文件夹绝对路径作为独立参数追加到末尾，并作为进程工作目录；支持中文和空格。修改设置即时生效，无须重启或重新打包。旧版设置的 `contextMenuScripts` 前缀须改为 `contextMenuCommand`。

命令通过 `child_process.spawn` 直接执行，不经过 Shell，不解析管道、变量或 `~`。从 macOS 图形界面启动 VS Code 时，PATH 可能与终端不同，找不到命令时请填写完整路径。

仅支持受信任的本地窗口与 `file` 文件夹，不支持文件、SSH、容器及虚拟资源。仅执行用户配置的可信命令；命令缺失、权限不足或退出失败时显示错误。标准输出、标准错误和退出状态记录于“输出 → Context Menu Commands”。

菜单及标题在 `package.json` 中静态注册，不能通过设置新增菜单或修改标题；设置变更通过 `setContext` 更新可见性。不修改已安装扩展清单、VS Code 安装目录或系统右键菜单。菜单与设置说明使用 `package.nls.json` 和 `package.nls.zh-cn.json` 本地化。

## 开发与验证

用 VS Code 打开项目，按 F5 启动扩展开发窗口，无须构建或安装依赖。Node.js 20+ 环境运行：

```bash
npm test
npm run check
```

手工验收：启用/关闭菜单确认即时更新；右键中文、空格目录确认新窗口打开目标目录；修改命令和参数确认下次点击生效；检查失败提示和日志、中英文显示，以及文件和远程窗口不显示菜单。

## 添加操作

运行时从 `package.json` 的 `contributes.commands` 读取操作清单，所有操作共用参数校验、命令执行和日志处理，无须修改 `src`：

1. 在 `contributes.commands` 添加 `contextMenuCommand.<id>`，标题使用 `%<id>%`，沿用现有 `enablement`。
2. 在 `contributes.menus["explorer/context"]` 添加对应入口，沿用现有条件，将可见性键改为 `contextMenuCommand.<id>Enabled`。
3. 在配置中添加 `contextMenuCommand.<id>.enabled`、`.command`、`.args`，沿用现有类型和作用域，设置命令及参数默认值，开关默认关闭。
4. 在两个 `package.nls*.json` 中添加 `<id>` 的菜单名称，然后运行测试并在扩展开发窗口验收。

新增固定菜单需更新扩展版本并重新打包；用户设置仅控制已有操作。

## 打包与安装

在 `package.json` 中设置 `publisher`（本地安装可用 `local-dev`），然后在项目根目录执行；容器需联网下载打包工具：

```bash
container run --rm \
  -v "$PWD:/workspace" \
  -w /workspace \
  node:latest \
  sh -c 'npm test &&
    npm run check &&
    npx --yes --package @vscode/vsce vsce package \
      --no-dependencies \
      --allow-missing-repository \
      --skip-license'
```

生成 `vscode-context-menu-command-0.1.0.vsix` 后，在 VS Code 扩展面板选择“从 VSIX 安装…”。打包命令仅生成安装包，不发布到 Marketplace。
