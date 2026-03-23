'use strict';
/**
 * WinCMD-Kali — Public API
 */

const CMDEnvironment     = require('./environment');
const { CMDCommands }    = require('./commands');
const { CMDInterpreter } = require('./interpreter');
const { startREPL }      = require('./repl');
const { linuxToWin, winToLinux, resolvePath } = require('./pathUtils');

module.exports = {
  CMDEnvironment,
  CMDCommands,
  CMDInterpreter,
  startREPL,
  pathUtils: { linuxToWin, winToLinux, resolvePath },
  VERSION: '1.0.0',
};
