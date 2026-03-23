'use strict';
/**
 * interpreter.js
 * Parses and executes CMD command lines:
 * - &&, ||, & operators
 * - Pipes  (cmd1 | cmd2)
 * - Redirection (>, >>, <)
 * - IF / IF NOT / IF EXIST / IF ERRORLEVEL / IF "a"=="b"
 * - FOR %I IN (...) DO  |  FOR /L  |  FOR /F
 * - GOTO / labels / :EOF
 * - CALL (batch & inline)
 * - @ECHO OFF / @ECHO ON
 * - External process execution
 * - .bat / .cmd batch file runner
 */

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { spawnSync, execSync } = require('child_process');
const readline = require('readline');

const { linuxToWin, winToLinux, resolvePath } = require('./pathUtils');
const CMDEnvironment  = require('./environment');
const { CMDCommands } = require('./commands');

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset : '\x1b[0m',
  white : '\x1b[97m',
  gray  : '\x1b[90m',
  red   : '\x1b[91m',
  yellow: '\x1b[93m',
  cyan  : '\x1b[96m',
  green : '\x1b[92m',
};

class GotoError extends Error {
  constructor(label) { super(label); this.label = label; }
}

class CMDInterpreter {
  constructor(env) {
    this.env    = env || new CMDEnvironment();
    this.cmds   = new CMDCommands(this.env);
    this.echoOn = true;
  }

  // ── Prompt ─────────────────────────────────────────────────────────────────
  getPrompt() {
    return `${C.white}${linuxToWin(process.cwd())}>${C.reset}`;
  }

  // ── Top-level execute ──────────────────────────────────────────────────────
  execute(rawLine, stdinData) {
    const line = this.env.expand(rawLine.trim());
    if (!line) return 0;

    // Comments / REM
    if (line.startsWith('::') ||
        line.toUpperCase().startsWith('REM ') ||
        line.toUpperCase() === 'REM') return 0;

    // Split on &&, ||, & (outside quotes)
    const parts = this._splitLogic(line);
    let code    = 0;

    for (const { op, segment } of parts) {
      if (op === '&&' && code !== 0) continue;
      if (op === '||' && code === 0) continue;
      code = this._executeSegment(segment.trim(), stdinData);
      this.env.errorlevel = code;
    }
    return code;
  }

  // ── Split on && || & (not inside quotes) ──────────────────────────────────
  _splitLogic(line) {
    const parts  = [];
    let cur      = '', inQ = false, i = 0;

    while (i < line.length) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; cur += c; i++; continue; }

      if (!inQ) {
        if (line.slice(i, i+2) === '&&') {
          parts.push({ op: '&&', segment: cur }); cur = ''; i += 2; continue;
        }
        if (line.slice(i, i+2) === '||') {
          parts.push({ op: '||', segment: cur }); cur = ''; i += 2; continue;
        }
        if (c === '&' && line[i+1] !== '>') {
          parts.push({ op: '&', segment: cur }); cur = ''; i++; continue;
        }
      }
      cur += c; i++;
    }
    if (cur.trim()) parts.push({ op: '', segment: cur });
    return parts;
  }

  // ── Execute a segment (handles pipes + redirection) ────────────────────────
  _executeSegment(segment, stdinData) {
    // Check for pipe outside quotes
    const pipeIdx = this._findOutsideQuotes(segment, '|');
    if (pipeIdx !== -1) return this._executePipe(segment, stdinData);

    const { cmdStr, redir } = this._parseRedirection(segment);
    return this._executeSingle(cmdStr.trim(), redir, stdinData);
  }

  // ── Pipe chain ─────────────────────────────────────────────────────────────
  _executePipe(segment, stdinData) {
    const parts  = this._splitPipes(segment);
    let prevOut  = stdinData || '';
    let code     = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      const { cmdStr, redir } = this._parseRedirection(part);
      const isLast = i === parts.length - 1;

      // Capture stdout into buffer
      const savedWrite = process.stdout.write.bind(process.stdout);
      let captured = '';
      process.stdout.write = (data) => { captured += data; return true; };

      try {
        code = this._executeSingle(cmdStr.trim(), redir, prevOut);
      } finally {
        process.stdout.write = savedWrite;
      }

      if (isLast) {
        // Print final stage output to real stdout
        if (captured) process.stdout.write(captured);
      } else {
        prevOut = captured;
      }
    }
    return code;
  }

  _splitPipes(segment) {
    const parts  = [];
    let cur      = '', inQ = false;
    for (const c of segment) {
      if (c === '"') { inQ = !inQ; cur += c; }
      else if (c === '|' && !inQ) { parts.push(cur); cur = ''; }
      else cur += c;
    }
    parts.push(cur);
    return parts;
  }

  // ── Redirection parser ─────────────────────────────────────────────────────
  _parseRedirection(segment) {
    const redir = { stdout: null, stderr: null, stdin: null, append: false };
    // Tokenise: produce [{type:'word'|'redir', val, quoted}]
    const tokens = [];
    let cur = '', inQ = false, tokenWasQuoted = false, idx = 0;

    while (idx < segment.length) {
      const c = segment[idx];

      if (c === '"') {
        if (inQ) {
          // closing quote — push token, mark as quoted
          tokens.push({ type: 'word', val: cur, quoted: true });
          cur = ''; inQ = false; tokenWasQuoted = false;
        } else {
          // opening quote — flush any pending unquoted token first
          if (cur) { tokens.push({ type: 'word', val: cur, quoted: false }); cur = ''; }
          inQ = true;
        }
        idx++; continue;
      }

      if (!inQ) {
        // Check >>  before >
        if (segment.slice(idx, idx+2) === '>>') {
          if (cur) { tokens.push({ type: 'word', val: cur, quoted: false }); cur = ''; }
          tokens.push({ type: 'redir', op: '>>' });
          idx += 2; continue;
        }
        if (c === '>' && segment[idx+1] !== '>') {
          if (cur) { tokens.push({ type: 'word', val: cur, quoted: false }); cur = ''; }
          tokens.push({ type: 'redir', op: '>' });
          idx++; continue;
        }
        if (c === '<') {
          if (cur) { tokens.push({ type: 'word', val: cur, quoted: false }); cur = ''; }
          tokens.push({ type: 'redir', op: '<' });
          idx++; continue;
        }
        if (c === ' ') {
          if (cur) { tokens.push({ type: 'word', val: cur, quoted: false }); cur = ''; }
          idx++; continue;
        }
      }
      cur += c; idx++;
    }
    if (cur) tokens.push({ type: 'word', val: cur, quoted: inQ });

    // Second pass: resolve redir operators
    const cmdWords = [];
    let j = 0;
    while (j < tokens.length) {
      const tok = tokens[j];
      if (tok.type === 'redir') {
        // Check if preceding word was a single fd digit
        let fd = '';
        if (cmdWords.length > 0) {
          const prev = cmdWords[cmdWords.length - 1];
          if (/^[0-9]$/.test(prev.val) && !prev.quoted) { fd = cmdWords.pop().val; }
        }
        const next = tokens[j + 1];
        if (next && next.type === 'word') {
          const target = winToLinux(next.val);
          if (tok.op === '<')  { redir.stdin  = target; }
          else if (tok.op === '>>') {
            if (fd === '2') redir.stderr = target;
            else { redir.stdout = target; redir.append = true; }
          } else {
            if (fd === '2') redir.stderr = target;
            else { redir.stdout = target; redir.append = false; }
          }
          j += 2; continue;
        }
        j++; continue;
      }
      cmdWords.push(tok); j++;
    }

    // Rebuild cmd string, re-quoting tokens that were originally quoted
    const cmdStr = cmdWords.map(t => t.quoted ? '"' + t.val + '"' : t.val).join(' ');
    return { cmdStr: cmdStr.trim(), redir };
  }

  // ── Execute a single command with optional redirection ─────────────────────
  _executeSingle(cmdStr, redir, stdinData) {
    // Prepare stdin
    let stdinInput = stdinData || '';
    if (redir.stdin) {
      try { stdinInput = fs.readFileSync(redir.stdin, 'utf8'); }
      catch { this._print(`${C.red}The system cannot find the file specified.${C.reset}\n`, true); return 1; }
    }

    // Capture stdout if redirect
    let capturedOut = '';
    const oldWrite  = process.stdout.write.bind(process.stdout);
    if (redir.stdout) {
      process.stdout.write = (data) => { capturedOut += data; return true; };
    }

    const code = this._dispatch(cmdStr, stdinInput);

    if (redir.stdout) {
      process.stdout.write = oldWrite;
      try {
        const flag = redir.append ? 'a' : 'w';
        const p    = resolvePath(redir.stdout);
        // Only write if there's output to write (prevents empty file creation when IF skips)
        if (capturedOut || flag === 'w') {
          const dir = path.dirname(p);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          if (capturedOut) fs.writeFileSync(p, capturedOut, { flag });
        }
      } catch (e) {
        this._print(`${C.red}${e.message}${C.reset}\n`, true);
      }
    }

    if (redir.stderr) {
      // Already handled inside commands; we just note it
    }

    return code;
  }

  // ── Main command dispatcher ────────────────────────────────────────────────
  _dispatch(cmdStr, stdinData) {
    if (!cmdStr) return 0;

    // Handle @prefix (suppress echo)
    if (cmdStr.startsWith('@')) {
      return this._dispatch(cmdStr.slice(1).trim(), stdinData);
    }

    // Tokenise
    const tokens = this._tokenise(cmdStr);
    if (!tokens.length) return 0;

    const raw  = tokens[0];
    const cmd  = raw.toLowerCase().replace(/\.exe$/i, '').replace(/\.bat$/i, '').replace(/\.cmd$/i, '');
    const args = cmdStr.slice(raw.length).trimStart();

    // ── @ECHO ON/OFF ──────────────────────────────────────────────────────────
    if (cmd === 'echo' && args.trim().toUpperCase() === 'OFF') { this.echoOn = false; return 0; }
    if (cmd === 'echo' && args.trim().toUpperCase() === 'ON')  { this.echoOn = true;  return 0; }
    // echo. -> blank line (CMD quirk)
    if (raw.toLowerCase() === 'echo.' || raw.toLowerCase().startsWith('echo.')) {
      this._print(raw.slice(5) + '\n'); return 0;
    }

    // ── IF ────────────────────────────────────────────────────────────────────
    if (cmd === 'if') return this._handleIf(args, stdinData);

    // ── FOR ───────────────────────────────────────────────────────────────────
    if (cmd === 'for') return this._handleFor(args);

    // ── GOTO ──────────────────────────────────────────────────────────────────
    if (cmd === 'goto') throw new GotoError(args.trim().replace(/^:/, '').toUpperCase());

    // ── Parenthesised block ( cmd ) ─────────────────────────────────────────
    if (cmdStr.trimStart().startsWith('(')) {
      const inner = cmdStr.replace(/^\s*\(/, '').replace(/\)\s*$/, '').trim();
      if (inner) return this.execute(inner, stdinData);
      return 0;
    }

    // ── Labels ────────────────────────────────────────────────────────────────
    if (cmd.startsWith(':')) return 0;

    // ── CALL ──────────────────────────────────────────────────────────────────
    if (cmd === 'call') {
      const target = args.trim();
      if (/\.(bat|cmd)$/i.test(target)) return this.runBatch(winToLinux(target));
      return this.execute(target, stdinData);
    }

    // ── PAUSE ─────────────────────────────────────────────────────────────────
    if (cmd === 'pause') {
      process.stdout.write('Press any key to continue . . . ');
      try { execSync('read -r -s -n 1', { stdio: ['inherit','pipe','pipe'], shell: '/bin/bash' }); } catch {}
      process.stdout.write('\n');
      return 0;
    }

    // ── TITLE ─────────────────────────────────────────────────────────────────
    if (cmd === 'title') { process.stdout.write(`\x1b]0;${args}\x07`); return 0; }

    // ── COLOR ─────────────────────────────────────────────────────────────────
    if (cmd === 'color') return 0;

    // ── PUSHD / POPD ──────────────────────────────────────────────────────────
    if (cmd === 'pushd') {
      this._dirStack = this._dirStack || [];
      this._dirStack.push(process.cwd());
      return this.cmds.cd(args).code;
    }
    if (cmd === 'popd') {
      this._dirStack = this._dirStack || [];
      if (this._dirStack.length) process.chdir(this._dirStack.pop());
      return 0;
    }

    // ── EXIT ──────────────────────────────────────────────────────────────────
    if (cmd === 'exit') {
      const code = parseInt(args.trim(), 10);
      process.exit(isNaN(code) ? 0 : code);
    }

    // ── Built-in commands ─────────────────────────────────────────────────────
    const builtins = {
      dir: ()         => this.cmds.dir(args),
      cd: ()          => this.cmds.cd(args),
      chdir: ()       => this.cmds.cd(args),
      cls: ()         => this.cmds.cls(),
      echo: ()        => this.cmds.echo(args),
      set: ()         => this._handleSet(args),
      copy: ()        => this.cmds.copy(args),
      xcopy: ()       => this.cmds.xcopy(args),
      move: ()        => this.cmds.move(args),
      del: ()         => this.cmds.del(args),
      erase: ()       => this.cmds.del(args),
      mkdir: ()       => this.cmds.mkdir(args),
      md: ()          => this.cmds.mkdir(args),
      rmdir: ()       => this.cmds.rmdir(args),
      rd: ()          => this.cmds.rmdir(args),
      type: ()        => this.cmds.type(args),
      ren: ()         => this.cmds.ren(args),
      rename: ()      => this.cmds.ren(args),
      find: ()        => this.cmds.find(args, stdinData),
      findstr: ()     => this.cmds.findstr(args),
      sort: ()        => this.cmds.sort(args, stdinData),
      more: ()        => this.cmds.more(args),
      attrib: ()      => this.cmds.attrib(args),
      fc: ()          => this.cmds.fc(args),
      tree: ()        => this.cmds.tree(args),
      tasklist: ()    => this.cmds.tasklist(args),
      taskkill: ()    => this.cmds.taskkill(args),
      ipconfig: ()    => this.cmds.ipconfig(args),
      ping: ()        => this.cmds.ping(args),
      tracert: ()     => this.cmds.tracert(args),
      traceroute: ()  => this.cmds.tracert(args),
      netstat: ()     => this.cmds.netstat(args),
      systeminfo: ()  => this.cmds.systeminfo(),
      ver: ()         => this.cmds.ver(),
      date: ()        => this.cmds.date(args),
      time: ()        => this.cmds.time(),
      whoami: ()      => this.cmds.whoami(args),
      hostname: ()    => this.cmds.hostname(),
      where: ()       => this.cmds.where(args),
      path: ()        => this.cmds.path(args),
      help: ()        => this.cmds.help(args),
      '?': ()         => this.cmds.help(args),
      // ── Extended commands ──────────────────────────────────────────────────
      chcp: ()        => this.cmds.chcp(args),
      chkdsk: ()      => this.cmds.chkdsk(args),
      vol: ()         => this.cmds.vol(args),
      label: ()       => this.cmds.label(args),
      assoc: ()       => this.cmds.assoc(args),
      ftype: ()       => this.cmds.ftype(args),
      color: ()       => this.cmds.color(args),
      prompt: ()      => this.cmds.prompt(args),
      mklink: ()      => this.cmds.mklink(args),
      icacls: ()      => this.cmds.icacls(args),
      cacls: ()       => this.cmds.icacls(args),
      takeown: ()     => this.cmds.takeown(args),
      sc: ()          => this.cmds.sc(args),
      net: ()         => this.cmds.net(args),
      netsh: ()       => this.cmds.netsh(args),
      runas: ()       => this.cmds.runas(args),
      shutdown: ()    => this.cmds.shutdown(args),
      start: ()       => this.cmds.start(args),
      timeout: ()     => this.cmds.timeout(args),
      setx: ()        => this.cmds.setx(args),
      setlocal: ()    => this.cmds.setlocal(args),
      endlocal: ()    => this.cmds.endlocal(args),
      robocopy: ()    => this.cmds.robocopy(args),
      reg: ()         => this.cmds.reg(args),
      schtasks: ()    => this.cmds.schtasks(args),
      wmic: ()        => this.cmds.wmic(args),
      driverquery: () => this.cmds.driverquery(args),
      openfiles: ()   => this.cmds.openfiles(args),
      cipher: ()      => this.cmds.cipher(args),
      sfc: ()         => this.cmds.sfc(args),
      gpresult: ()    => this.cmds.gpresult(args),
      doskey: ()      => this.cmds.doskey(args),
      mode: ()        => this.cmds.mode(args),
      diskpart: ()    => this.cmds.diskpart(args),
      comp: ()        => this.cmds.comp(args),
      replace: ()     => this.cmds.replace(args),
      clip: ()        => this.cmds.clip(args, stdinData),
      expand: ()      => this.cmds.expand(args),
      subst: ()       => this.cmds.subst(args),
      print: ()       => this.cmds.print(args),
      msg: ()         => this.cmds.msg(args),
      break: ()       => this.cmds.break(args),
      bcdedit: ()     => this.cmds.bcdedit(args),
      compact: ()     => this.cmds.compact(args),
      convert: ()     => this.cmds.convert(args),
      nltest: ()      => this.cmds.nltest(args),
    };

    if (builtins[cmd]) {
      try {
        const result = builtins[cmd]();
        if (result.out) this._print(result.out.endsWith('\n') ? result.out : result.out + '\n');
        if (result.err) this._print(`${C.red}${result.err}${C.reset}\n`, true);
        return result.code;
      } catch (e) {
        this._print(`${C.red}${e.message}${C.reset}\n`, true);
        return 1;
      }
    }

    // ── External process ──────────────────────────────────────────────────────
    return this._runExternal(raw, tokens.slice(1), stdinData);
  }

  // ── IF handler ─────────────────────────────────────────────────────────────
  _handleIf(args, stdinData) {
    let a      = args.trim();
    let negate = false;

    if (a.toUpperCase().startsWith('NOT ')) { negate = true; a = a.slice(4).trim(); }

    let condition = false, rest = '';

    // IF EXIST path command
    const existM = a.match(/^EXIST\s+("?[^"]+?"?|[^\s]+)\s+(.*)/i);
    if (existM) {
      const p   = winToLinux(existM[1].replace(/^["']|["']$/g, ''));
      rest      = existM[2];
      condition = fs.existsSync(resolvePath(p));
    }

    // IF ERRORLEVEL n command
    else if (/^ERRORLEVEL\s+\d+/i.test(a)) {
      const m   = a.match(/^ERRORLEVEL\s+(\d+)\s+(.*)/i);
      rest      = m[2];
      condition = this.env.errorlevel >= parseInt(m[1], 10);
    }

    // IF "a"=="b"  or  IF a==b
    else {
      const m = a.match(/^"?([^"=]*)"?\s*==\s*"?([^"=]*)"?\s+(.*)/);
      if (m) {
        const lhs = this.env.expand(m[1]).trim().toUpperCase();
        const rhs = this.env.expand(m[2]).trim().toUpperCase();
        rest      = m[3];
        condition = lhs === rhs;
      }
    }

    if (negate) condition = !condition;

    if (condition) {
      // Strip wrapping parens if present
      const thenCmd = rest.replace(/^\s*\(([^)]*)\)/, '$1').trim();
      const elseMatch = thenCmd.match(/^(.+?)\s+ELSE\s+(.+)$/i);
      if (elseMatch) return this.execute(elseMatch[1].trim(), stdinData);
      return this.execute(thenCmd, stdinData);
    }

    // ELSE clause (on same line: IF cond cmd ELSE cmd)
    const elseM = rest.match(/^[^\n]*?\)\s*ELSE\s+(.*)|^.*?\bELSE\b\s+(.*)/i);
    if (elseM) return this.execute((elseM[1] || elseM[2]).replace(/^\s*\(([^)]*)\)/, '$1').trim(), stdinData);
    return 0;
  }

  // ── FOR handler ────────────────────────────────────────────────────────────
  _handleFor(args) {
    // FOR [/L|/F|/R|/D] %%var IN (set) DO command
    const m = args.match(/^(\/[LFRDf]\s+)?%%?(\w)\s+IN\s*\(([^)]*)\)\s+DO\s+(.*)/i);
    if (!m) {
      this._print(`${C.red}The syntax of the command is incorrect.${C.reset}\n`, true);
      return 1;
    }

    const flag    = (m[1] || '').trim().toUpperCase();
    const varname = m[2].toUpperCase();
    const inSet   = m[3].trim();
    const doCmd   = m[4].trim();
    let   code    = 0;

    const expand = (val) => doCmd
      .replace(new RegExp(`%%${varname}`, 'gi'), val)
      .replace(new RegExp(`%${varname}`, 'gi'), val);

    if (flag.startsWith('/L')) {
      // Numeric range: (start,step,end)
      const nums = inSet.split(',').map(s => parseInt(s.trim(), 10));
      if (nums.length !== 3) return 1;
      const [start, step, end] = nums;
      if (step === 0) return 1;
      for (let v = start; step > 0 ? v <= end : v >= end; v += step) {
        code = this.execute(expand(String(v)));
      }
    } else if (flag.startsWith('/F')) {
      // File or command
      const target = inSet.replace(/^["']|["']$/g, '');
      const resolved = resolvePath(winToLinux(target));
      let lines = [];
      if (fs.existsSync(resolved)) {
        lines = fs.readFileSync(resolved, 'utf8').split('\n');
      } else {
        try {
          const r = spawnSync(target, { shell: true, encoding: 'utf8' });
          lines = (r.stdout || '').split('\n');
        } catch {}
      }
      for (const ln of lines) {
        const val = ln.trim();
        if (val) code = this.execute(expand(val));
      }
    } else {
      // Token set
      const tokens = this._tokenise(inSet);
      for (const tok of tokens) {
        code = this.execute(expand(tok));
      }
    }
    return code;
  }

  // ── SET with /A arithmetic ────────────────────────────────────────────────
  _handleSet(args) {
    const a = args.trim();
    // SET /A expression
    if (a.toUpperCase().startsWith('/A ')) {
      const expr = a.slice(3).trim();
      const m = expr.match(/^(w+)s*=s*(.+)$/);
      if (m) {
        try {
          const val = String(Math.floor(Function('"use strict"; return (' + m[2] + ')')()));
          this.env.set(m[1], val);
          this._print(val + '\n');
          return 0;
        } catch { return 1; }
      }
    }
    const result = this.cmds.set(args);
    if (result.out) this._print(result.out.endsWith('\n') ? result.out : result.out + '\n');
    if (result.err) this._print(`${C.red}${result.err}${C.reset}\n`, true);
    return result.code;
  }

  // ── External process runner ────────────────────────────────────────────────
  _runExternal(name, argsList, stdinData) {
    const { execFileSync, execSync } = require('child_process');

    // Check for .bat / .cmd file in cwd or PATH
    for (const ext of ['.bat', '.cmd', '.sh']) {
      const candidate = resolvePath(name + ext);
      if (fs.existsSync(candidate)) {
        if (ext === '.bat' || ext === '.cmd') return this.runBatch(candidate);
        // .sh: run with bash
      }
    }

    // Try as real binary
    try {
      const result = spawnSync(name, argsList, {
        stdio: ['pipe', 'pipe', 'pipe'],
        input: stdinData || '',
        encoding: 'utf8',
      });
      if (result.error && result.error.code === 'ENOENT') {
        this._print(`'${name}' is not recognized as an internal or external command,\noperable program or batch file.\n`, true);
        return 9009;
      }
      if (result.stdout) this._print(result.stdout);
      if (result.stderr) this._print(`${C.red}${result.stderr}${C.reset}`, true);
      return result.status || 0;
    } catch (e) {
      this._print(`'${name}' is not recognized as an internal or external command,\noperable program or batch file.\n`, true);
      return 9009;
    }
  }

  // ── Batch file runner ──────────────────────────────────────────────────────
  runBatch(filePath) {
    const resolved = resolvePath(filePath);
    if (!fs.existsSync(resolved)) {
      this._print(`${C.red}The system cannot find the file specified: ${filePath}${C.reset}\n`, true);
      return 1;
    }

    const rawText = fs.readFileSync(resolved, 'utf8').replace(/\r\n/g, '\n');
    // Join ( ) multi-line blocks into single logical lines
    const joined = rawText.replace(/\(([^)]+)\)/gs, (_, inner) =>
      '(' + inner.replace(/\n\s*/g, ' ').trim() + ')'
    );
    const lines = joined.split('\n').map(l => l.trimEnd());

    // Build label index
    const labels = {};
    lines.forEach((ln, i) => {
      const stripped = ln.trim();
      if (stripped.startsWith(':') && !stripped.startsWith('::')) {
        const label = stripped.slice(1).toUpperCase().split(/\s+/)[0];
        labels[label] = i;
      }
    });

    const savedEcho = this.echoOn;
    let   code      = 0;
    let   i         = 0;

    while (i < lines.length) {
      const ln = lines[i].trim();

      // Print line if echo on
      if (this.echoOn && ln && !ln.startsWith('@') && !ln.toUpperCase().startsWith('REM') && !ln.startsWith('::')) {
        this._print(`${this.getPrompt()}${ln}\n`);
      }

      try {
        code = this.execute(ln);
      } catch (e) {
        if (e instanceof GotoError) {
          const target = e.label;
          if (target === 'EOF') break;
          if (labels[target] !== undefined) {
            i = labels[target] + 1;
            continue;
          } else {
            this._print(`${C.red}Label not found: ${target}${C.reset}\n`, true);
            break;
          }
        }
        throw e;
      }
      i++;
    }

    this.echoOn = savedEcho;
    return code;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _print(text, isError = false) {
    if (isError) process.stderr.write(text);
    else         process.stdout.write(text);
  }

  _tokenise(str) {
    const tokens = [];
    let cur = '', inQ = false;
    for (const c of str) {
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ' ' && !inQ) { if (cur) { tokens.push(cur); cur = ''; } }
      else cur += c;
    }
    if (cur) tokens.push(cur);
    return tokens;
  }

  _findOutsideQuotes(str, char) {
    let inQ = false;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '"') { inQ = !inQ; continue; }
      if (str[i] === char && !inQ) return i;
    }
    return -1;
  }
}

module.exports = { CMDInterpreter, GotoError, C };
