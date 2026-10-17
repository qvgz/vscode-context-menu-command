'use strict';

const { spawn } = require('node:child_process');
const { stat } = require('node:fs/promises');
const path = require('node:path');

async function runCommand({ command, args, folder, onOutput = () => {} }) {
  if (typeof command !== 'string' || !command.trim() || command.includes('\0')) {
    throw new Error('INVALID_COMMAND');
  }
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) {
    throw new Error('INVALID_ARGS');
  }
  if (typeof folder !== 'string' || !path.isAbsolute(folder) || !(await stat(folder)).isDirectory()) {
    throw new Error('INVALID_FOLDER');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args, folder], {
      cwd: folder,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => onOutput('stdout', data));
    child.stderr.on('data', data => onOutput('stderr', data));
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve({ code, signal });
      else reject(Object.assign(new Error('EXIT_FAILED'), { exitCode: code, signal }));
    });
  });
}

module.exports = { runCommand };
