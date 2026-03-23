#!/usr/bin/env node
'use strict';
/**
 * wincmd — CLI entry point
 *
 * Usage:
 *   wincmd                        Interactive CMD shell
 *   wincmd script.bat             Run a batch file
 *   wincmd /C "dir /b"           Run one command then exit
 *   wincmd /K "echo hello"       Run one command then stay in shell
 *   wincmd --no-banner            Skip the startup banner
 *   wincmd --version              Show version
 */

const fs   = require('fs');
const path = require('path');

const { CMDEnvironment }  = require('../src/index');
const { CMDInterpreter, C } = require('../src/interpreter');
const { startREPL }         = require('../src/repl');
const { winToLinux }        = require('../src/pathUtils');

const VERSION = '1.0.0';

function printHelp() {
  process.stdout.write(`
WinCMD-Kali v${VERSION} — Windows CMD Emulator for Kali Linux

USAGE:
  wincmd [options] [script.bat]

OPTIONS:
  /C <cmd>        Run command and exit  (e.g. wincmd /C "dir /b")
  /K <cmd>        Run command then stay in shell
  --no-banner     Skip the startup banner
  --version, /V   Show version number
  --help, /?      Show this help

EXAMPLES:
  wincmd                        # Interactive CMD shell
  wincmd myscript.bat           # Execute a batch file
  wincmd /C "ipconfig /all"     # Run single command
  wincmd /C "dir C:\\ /b"       # List root directory
  node bin/wincmd.js /C ver     # Show Windows version
`);
}

function main() {
  const argv = process.argv.slice(2);

  // ── Flags ──────────────────────────────────────────────────────────────────
  if (argv.includes('--help') || argv.includes('/?')) { printHelp(); process.exit(0); }
  if (argv.includes('--version') || argv.includes('/V')) {
    process.stdout.write(`WinCMD-Kali v${VERSION}\n`); process.exit(0);
  }

  const noBanner = argv.includes('--no-banner');
  const filtered = argv.filter(a => a !== '--no-banner');

  const env    = new CMDEnvironment();
  const interp = new CMDInterpreter(env);

  // ── /C "command" — run one command then exit ───────────────────────────────
  const cIdx = filtered.findIndex(a => a.toUpperCase() === '/C');
  if (cIdx !== -1) {
    const cmd = filtered.slice(cIdx + 1).join(' ');
    if (!cmd) { process.stderr.write('Missing command after /C\n'); process.exit(1); }
    const code = interp.execute(cmd);
    process.exit(code);
  }

  // ── /K "command" — run command then stay in shell ─────────────────────────
  const kIdx = filtered.findIndex(a => a.toUpperCase() === '/K');
  if (kIdx !== -1) {
    const cmd = filtered.slice(kIdx + 1).join(' ');
    if (cmd) interp.execute(cmd);
    startREPL({ noBanner: true, env, interp });
    return;
  }

  // ── script.bat ─────────────────────────────────────────────────────────────
  const scriptArg = filtered.find(a => /\.(bat|cmd)$/i.test(a) || (fs.existsSync(a) && fs.statSync(a).isFile()));
  if (scriptArg) {
    const scriptPath = path.resolve(winToLinux(scriptArg));
    if (!fs.existsSync(scriptPath)) {
      process.stderr.write(`${C.red}The system cannot find the file specified: ${scriptArg}${C.reset}\n`);
      process.exit(1);
    }
    const code = interp.runBatch(scriptPath);
    process.exit(code);
  }

  // ── Interactive REPL ───────────────────────────────────────────────────────
  startREPL({ noBanner });
}

main();
