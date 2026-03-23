'use strict';
/**
 * repl.js
 * Interactive CMD shell with:
 * - Tab autocomplete (commands + filesystem)
 * - Command history (persistent ~/.wincmd_history)
 * - Ctrl+C = ^C (don't exit)
 * - Ctrl+D = exit
 * - Windows-style startup banner
 */

const readline = require('readline');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');

const { CMDInterpreter } = require('./interpreter');
const CMDEnvironment     = require('./environment');
const { C }              = require('./interpreter');

const VERSION      = '1.0.0';
const HISTORY_FILE = path.join(os.homedir(), '.wincmd_history');
const HISTORY_MAX  = 1000;

const BANNER = `
${C.white}Microsoft Windows [Version 10.0.19045.3996]
(c) Microsoft Corporation. All rights reserved.

${C.cyan}WinCMD-Kali v${VERSION}${C.white} — Windows CMD Emulator running on Kali Linux
Type ${C.yellow}help${C.white} to list all available commands.
Type ${C.yellow}exit${C.white} to quit.
${C.reset}`;

// ── All tab-completable command names ─────────────────────────────────────────
const CMD_LIST = [
  // Core commands
  'attrib','call','cd','chdir','cls','color','copy','date','del','dir',
  'echo','erase','exit','fc','find','findstr','for','help','hostname',
  'if','ipconfig','md','mkdir','more','move','netstat','path','pause',
  'ping','popd','pushd','rd','rem','ren','rename','rmdir','set','sort',
  'systeminfo','taskkill','tasklist','time','title','tracert','tree',
  'type','ver','whoami','where','xcopy',
  // Extended commands
  'assoc','bcdedit','break','cacls','chcp','chkdsk','cipher','clip',
  'compact','comp','convert','diskpart','doskey','driverquery',
  'endlocal','expand','ftype','gpresult','icacls','label','mklink',
  'mode','msg','net','netsh','nltest','openfiles','print','prompt',
  'reg','replace','robocopy','runas','sc','schtasks','setlocal',
  'setx','sfc','shutdown','start','subst','takeown','timeout','vol','wmic',
];

// ── Load history from file ────────────────────────────────────────────────────
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return fs.readFileSync(HISTORY_FILE, 'utf8')
        .split('\n').filter(Boolean).slice(-HISTORY_MAX);
    }
  } catch {}
  return [];
}

// ── Save history to file ──────────────────────────────────────────────────────
function saveHistory(rl) {
  try {
    const history = rl.history ? [...rl.history].reverse() : [];
    fs.writeFileSync(HISTORY_FILE, history.join('\n') + '\n');
  } catch {}
}

// ── Filesystem completer ──────────────────────────────────────────────────────
function completer(line) {
  const tokens  = line.split(' ');
  const last    = tokens[tokens.length - 1];
  const prefix  = tokens.slice(0, -1).join(' ');

  // Complete first token (command name)
  if (tokens.length === 1) {
    const hits = CMD_LIST.filter(c => c.startsWith(last.toLowerCase()));
    return [hits.length ? hits : CMD_LIST, last];
  }

  // Complete filesystem paths (last token)
  try {
    const dir      = path.dirname(last) || '.';
    const base     = path.basename(last);
    const absDir   = path.resolve(process.cwd(), dir);
    const entries  = fs.readdirSync(absDir);
    const hits     = entries
      .filter(e => e.toLowerCase().startsWith(base.toLowerCase()))
      .map(e => {
        const full = path.join(dir === '.' ? '' : dir, e);
        const stat = fs.statSync(path.join(absDir, e));
        return prefix ? prefix + ' ' + full + (stat.isDirectory() ? path.sep : '') : full + (stat.isDirectory() ? path.sep : '');
      });
    return [hits, line];
  } catch {
    return [[], line];
  }
}

// ── Start interactive REPL ────────────────────────────────────────────────────
function startREPL(options = {}) {
  const env    = new CMDEnvironment();
  const interp = new CMDInterpreter(env);

  if (!options.noBanner) process.stdout.write(BANNER);

  const rl = readline.createInterface({
    input:     process.stdin,
    output:    process.stdout,
    completer,
    terminal:  true,
    historySize: HISTORY_MAX,
  });

  // Restore history
  const history = loadHistory();
  if (rl.history) {
    for (const line of history.reverse()) {
      rl.history.push(line);
    }
  }

  // ── Ctrl+C: print ^C, don't exit ──────────────────────────────────────────
  rl.on('SIGINT', () => {
    process.stdout.write(`\n${C.white}^C${C.reset}\n`);
    rl.prompt();
  });

  // ── Ctrl+D / EOF: exit ────────────────────────────────────────────────────
  rl.on('close', () => {
    process.stdout.write('\n');
    saveHistory(rl);
    process.exit(0);
  });

  // ── Each line ─────────────────────────────────────────────────────────────
  const ask = () => {
    rl.question(interp.getPrompt() + ' ', (line) => {
      const trimmed = line.trim();
      if (!trimmed) { ask(); return; }

      try {
        interp.execute(trimmed);
      } catch (e) {
        if (e.code === 'process.exit') {
          saveHistory(rl);
          process.exit(e.exitCode || 0);
        }
        process.stderr.write(`${C.red}${e.message}${C.reset}\n`);
      }
      ask();
    });
  };

  ask();
  return rl;
}

module.exports = { startREPL };
