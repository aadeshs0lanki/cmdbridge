'use strict';
/**
 * commands.js
 * All Windows CMD built-in command implementations
 */

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execSync, spawnSync } = require('child_process');
const { linuxToWin, winToLinux, resolvePath } = require('./pathUtils');

// ── Result helper ─────────────────────────────────────────────────────────────
class Result {
  constructor(out = '', err = '', code = 0) {
    this.out  = out;
    this.err  = err;
    this.code = code;
  }
  static ok(out = '')       { return new Result(out, '', 0); }
  static fail(err, code=1)  { return new Result('', err, code); }
}

// ── Argument tokeniser (respects double-quotes) ───────────────────────────────
function tokenise(args) {
  const tokens = [];
  let cur = '', inQ = false;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '"') {
      if (inQ) { tokens.push(cur); cur = ''; inQ = false; }
      else { if (cur) { tokens.push(cur); cur = ''; } inQ = true; }
      continue;
    }
    if (c === ' ' && !inQ) {
      if (cur) { tokens.push(cur); cur = ''; }
    } else { cur += c; }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

// ── Format file size like CMD (comma-grouped) ─────────────────────────────────
function fmtSize(n) {
  return n.toLocaleString('en-US');
}

// ── Format date like CMD ──────────────────────────────────────────────────────
function fmtDate(d) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mm   = String(d.getMonth()+1).padStart(2,'0');
  const dd   = String(d.getDate()).padStart(2,'0');
  const yyyy = d.getFullYear();
  let hh     = d.getHours(); const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  const mi   = String(d.getMinutes()).padStart(2,'0');
  return `${mm}/${dd}/${yyyy}  ${String(hh).padStart(2,'0')}:${mi} ${ampm}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
class CMDCommands {
  constructor(env) {
    this.env = env;
  }

  // ── DIR ────────────────────────────────────────────────────────────────────
  dir(args) {
    const tokens   = tokenise(args);
    let target     = '.';
    let showHidden = false, bare = false, wide = false;

    for (const t of tokens) {
      const u = t.toUpperCase();
      if (u === '/A' || u === '/AH' || u.startsWith('/A:')) showHidden = true;
      else if (u === '/B') bare = true;
      else if (u === '/W') wide = true;
      else target = winToLinux(t);
    }

    const absPath = resolvePath(target);
    if (!fs.existsSync(absPath)) {
      return Result.fail(`File Not Found`);
    }

    let entries;
    try {
      entries = fs.readdirSync(absPath).map(name => {
        const full = path.join(absPath, name);
        let stat;
        try { stat = fs.statSync(full); } catch { stat = null; }
        return { name, full, stat };
      });
    } catch (e) {
      return Result.fail(`Access is denied.`);
    }

    // Sort: dirs first, then files, all alphabetically
    entries.sort((a, b) => {
      const ad = a.stat && a.stat.isDirectory();
      const bd = b.stat && b.stat.isDirectory();
      if (ad !== bd) return ad ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    if (bare) {
      const lines = entries
        .filter(e => showHidden || !e.name.startsWith('.'))
        .map(e => e.name);
      return Result.ok(lines.join('\n'));
    }

    const winPath = linuxToWin(absPath);
    const lines   = [
      ` Volume in drive C has no label.`,
      ` Volume Serial Number is DEAD-BEEF`,
      ``,
      ` Directory of ${winPath}`,
      ``,
    ];

    let totalFiles = 0, totalSize = 0, totalDirs = 0;
    for (const e of entries) {
      if (!showHidden && e.name.startsWith('.')) continue;
      if (!e.stat) continue;
      const dt = fmtDate(new Date(e.stat.mtimeMs));
      if (e.stat.isDirectory()) {
        totalDirs++;
        lines.push(`${dt}    <DIR>          ${e.name}`);
      } else {
        const sz = e.stat.size;
        totalFiles++;
        totalSize += sz;
        lines.push(`${dt} ${fmtSize(sz).padStart(16)} ${e.name}`);
      }
    }

    let free = 0;
    try {
      const dfOut = execSync(`df -B1 "${absPath}" 2>/dev/null | tail -1`, { encoding: 'utf8' });
      const parts = dfOut.trim().split(/\s+/);
      if (parts[3]) free = parseInt(parts[3], 10);
    } catch {}

    lines.push(`${' '.repeat(15)}${String(totalFiles).padStart(16)} File(s) ${fmtSize(totalSize).padStart(16)} bytes`);
    lines.push(`${' '.repeat(15)}${String(totalDirs).padStart(16)} Dir(s) ${fmtSize(free).padStart(17)} bytes free`);
    return Result.ok(lines.join('\n'));
  }

  // ── CD / CHDIR ─────────────────────────────────────────────────────────────
  cd(args) {
    const a = args.trim().replace(/^["']|["']$/g, '');
    if (!a || a === '\\') {
      return Result.ok(linuxToWin(process.cwd()));
    }
    const target = a === '..' ? path.dirname(process.cwd()) : resolvePath(a);
    try {
      if (!fs.existsSync(target)) return Result.fail(`The system cannot find the path specified.`);
      if (!fs.statSync(target).isDirectory()) return Result.fail(`The directory name is invalid.`);
      process.chdir(target);
      return Result.ok('');
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  // ── CLS ────────────────────────────────────────────────────────────────────
  cls() {
    process.stdout.write('\x1Bc');
    return Result.ok('');
  }

  // ── ECHO ───────────────────────────────────────────────────────────────────
  echo(args) {
    const a = args.trimStart();
    if (!a) return Result.ok('ECHO is on.');
    const u = a.toUpperCase().trim();
    if (u === 'ON' || u === 'OFF') return Result.ok('');
    return Result.ok(this.env.expand(a));
  }

  // ── SET ────────────────────────────────────────────────────────────────────
  set(args) {
    const a = args.trim();
    if (!a) return Result.ok(this.env.list());
    if (a.includes('=')) {
      const [rawKey, ...rest] = a.split('=');
      const key = rawKey.trim();
      const val = rest.join('=').trim();
      if (val) this.env.set(key, val);
      else     this.env.delete(key);
      return Result.ok('');
    }
    const result = this.env.list(a);
    if (!result) return Result.fail(`Environment variable ${a} not defined`, 1);
    return Result.ok(result);
  }

  // ── COPY ───────────────────────────────────────────────────────────────────
  copy(args) {
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    if (tokens.length < 2) return Result.fail(`The syntax of the command is incorrect.`);
    const src = resolvePath(tokens[0]);
    let   dst = resolvePath(tokens[1]);
    try {
      if (fs.existsSync(dst) && fs.statSync(dst).isDirectory()) {
        dst = path.join(dst, path.basename(src));
      }
      fs.copyFileSync(src, dst);
      return Result.ok(`        1 file(s) copied.`);
    } catch (e) {
      return Result.fail(e.code === 'ENOENT' ? `The system cannot find the file specified.` : e.message);
    }
  }

  // ── XCOPY ──────────────────────────────────────────────────────────────────
  xcopy(args) {
    const tokens   = tokenise(args);
    const flags    = tokens.filter(t => t.startsWith('/'));
    const paths    = tokens.filter(t => !t.startsWith('/'));
    if (paths.length < 2) return Result.fail(`The syntax of the command is incorrect.`);
    const src = resolvePath(paths[0]);
    const dst = resolvePath(paths[1]);
    const recurse = flags.some(f => /\/[SE]/i.test(f));

    function copyRecursive(s, d) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      for (const entry of fs.readdirSync(s)) {
        const sp = path.join(s, entry), dp = path.join(d, entry);
        if (fs.statSync(sp).isDirectory()) {
          if (recurse) copyRecursive(sp, dp);
        } else {
          fs.copyFileSync(sp, dp);
        }
      }
    }

    try {
      if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
        copyRecursive(src, dst);
      } else {
        const d = path.dirname(dst);
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        fs.copyFileSync(src, dst);
      }
      return Result.ok(`1 File(s) copied`);
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  // ── MOVE ───────────────────────────────────────────────────────────────────
  move(args) {
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    if (tokens.length < 2) return Result.fail(`The syntax of the command is incorrect.`);
    const src = resolvePath(tokens[0]);
    let   dst = resolvePath(tokens[1]);
    try {
      if (fs.existsSync(dst) && fs.statSync(dst).isDirectory()) {
        dst = path.join(dst, path.basename(src));
      }
      fs.renameSync(src, dst);
      return Result.ok(`        1 file(s) moved.`);
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  // ── DEL / ERASE ────────────────────────────────────────────────────────────
  del(args) {
    const tokens  = tokenise(args);
    const targets = tokens.filter(t => !t.startsWith('/'));
    const quiet   = tokens.some(t => t.toUpperCase() === '/Q');
    const errors  = [];

    for (const t of targets) {
      const resolved = resolvePath(t);
      if (t.includes('*') || t.includes('?')) {
        // Glob via shell
        try {
          const dir  = path.dirname(resolved);
          const glob = path.basename(resolved);
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (this._glob(f, glob)) {
                const fp = path.join(dir, f);
                if (fs.statSync(fp).isFile()) fs.unlinkSync(fp);
              }
            }
          }
        } catch (e) { errors.push(e.message); }
      } else {
        try {
          if (!fs.existsSync(resolved)) { errors.push(`Could Not Find ${t}`); continue; }
          if (!fs.statSync(resolved).isFile()) { errors.push(`Access is denied.`); continue; }
          fs.unlinkSync(resolved);
        } catch (e) { errors.push(e.message); }
      }
    }
    return errors.length ? Result.fail(errors.join('\n')) : Result.ok('');
  }

  // ── MKDIR / MD ─────────────────────────────────────────────────────────────
  mkdir(args) {
    const tokens  = tokenise(args).filter(t => !t.startsWith('/'));
    for (const t of tokens) {
      const target = resolvePath(t);
      try {
        if (fs.existsSync(target)) {
          return Result.fail(`A subdirectory or file ${t} already exists.`);
        }
        fs.mkdirSync(target, { recursive: true });
      } catch (e) {
        return Result.fail(e.message);
      }
    }
    return Result.ok('');
  }

  // ── RMDIR / RD ─────────────────────────────────────────────────────────────
  rmdir(args) {
    const tokens  = tokenise(args);
    const flags   = tokens.filter(t => t.startsWith('/'));
    const targets = tokens.filter(t => !t.startsWith('/'));
    const recurse = flags.some(f => f.toUpperCase() === '/S');
    const quiet   = flags.some(f => f.toUpperCase() === '/Q');

    for (const t of targets) {
      const target = resolvePath(t);
      try {
        if (!fs.existsSync(target)) return Result.fail(`The system cannot find the path specified.`);
        if (recurse) {
          fs.rmSync(target, { recursive: true, force: true });
        } else {
          const contents = fs.readdirSync(target);
          if (contents.length) return Result.fail(`The directory is not empty.`);
          fs.rmdirSync(target);
        }
      } catch (e) {
        return Result.fail(e.message);
      }
    }
    return Result.ok('');
  }

  // ── TYPE ───────────────────────────────────────────────────────────────────
  type(args) {
    const tokens = tokenise(args);
    const out    = [];
    for (const t of tokens) {
      const p = resolvePath(t);
      try {
        if (!fs.existsSync(p)) return Result.fail(`The system cannot find the file specified.`);
        out.push(fs.readFileSync(p, 'utf8'));
      } catch (e) {
        return Result.fail(e.message);
      }
    }
    return Result.ok(out.join(''));
  }

  // ── REN / RENAME ───────────────────────────────────────────────────────────
  ren(args) {
    const tokens = tokenise(args);
    if (tokens.length < 2) return Result.fail(`The syntax of the command is incorrect.`);
    const src = resolvePath(tokens[0]);
    const dst = path.join(path.dirname(src), tokens[1]);
    try {
      fs.renameSync(src, dst);
      return Result.ok('');
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  // ── FIND ───────────────────────────────────────────────────────────────────
  find(args, stdinData) {
    // Parse: [flags] "pattern" [files...]
    // Handle both quoted and unquoted patterns
    let flags = [], pattern = '', fileList = [];
    const argsStr = args.trim();

    // Extract flags first (e.g. /I /V /C)
    let remaining = argsStr;
    const flagMatch = remaining.match(/^((?:\/\w+\s*)*)/);
    if (flagMatch) {
      flags = flagMatch[1].trim().split(/\s+/).filter(Boolean);
      remaining = remaining.slice(flagMatch[1].length).trim();
    }

    // Extract quoted pattern
    if (remaining.startsWith('"')) {
      const closeQ = remaining.indexOf('"', 1);
      if (closeQ !== -1) {
        pattern  = remaining.slice(1, closeQ);
        remaining = remaining.slice(closeQ + 1).trim();
      } else {
        pattern = remaining.slice(1);
        remaining = '';
      }
    } else {
      // Unquoted: first token is pattern
      const sp = remaining.indexOf(' ');
      if (sp !== -1) { pattern = remaining.slice(0, sp); remaining = remaining.slice(sp+1).trim(); }
      else { pattern = remaining; remaining = ''; }
    }

    if (!pattern && !flags.length) return Result.fail(`FIND: Parameter format not correct`);
    fileList = remaining ? tokenise(remaining).filter(t => !t.startsWith('/')).map(f => resolvePath(f)) : [];

    const caseI     = flags.some(f => f.toUpperCase() === '/I');
    const countOnly = flags.some(f => f.toUpperCase() === '/C');
    const negate    = flags.some(f => f.toUpperCase() === '/V');

    const match = (line) => {
      const a = caseI ? line.toLowerCase() : line;
      const b = caseI ? pattern.toLowerCase() : pattern;
      return a.includes(b);
    };

    const out = [];
    const process_lines = (fp, lines) => {
      if (fp) out.push(`\n---------- ${fp.toUpperCase()} ----------`);
      const hits = lines.filter(ln => negate ? !match(ln) : match(ln));
      if (countOnly) out.push(String(hits.length));
      else out.push(...hits);
    };

    if (fileList.length) {
      for (const fp of fileList) {
        try {
          const lines = fs.readFileSync(fp, 'utf8').split('\n').map(l => l.trimEnd());
          process_lines(fp, lines);
        } catch (e) {
          out.push(`FIND: ${e.message}`);
        }
      }
    } else if (stdinData) {
      const lines = stdinData.split('\n').map(l => l.trimEnd());
      process_lines(null, lines);
    }
    return Result.ok(out.join('\n'));
  }

  findstr(args) {
    // Alias with regex support
    const tokens  = tokenise(args);
    const flags   = tokens.filter(t => t.startsWith('/'));
    const rest    = tokens.filter(t => !t.startsWith('/'));
    if (!rest.length) return Result.fail(`FINDSTR: Parameter format not correct`);

    const pattern = rest[0];
    const files   = rest.slice(1).map(f => resolvePath(f));
    const caseI   = flags.some(f => f.toUpperCase() === '/I');
    const regex   = flags.some(f => f.toUpperCase() === '/R');
    const negate  = flags.some(f => f.toUpperCase() === '/V');

    let re;
    try {
      re = regex ? new RegExp(pattern, caseI ? 'i' : '') : null;
    } catch { re = null; }

    const match = (line) => {
      if (re) return re.test(line);
      const a = caseI ? line.toLowerCase() : line;
      const b = caseI ? pattern.toLowerCase() : pattern;
      return a.includes(b);
    };

    const out = [];
    for (const fp of files) {
      try {
        const lines = fs.readFileSync(fp, 'utf8').split('\n');
        for (const line of lines) {
          if (negate ? !match(line) : match(line)) out.push(`${fp}:${line}`);
        }
      } catch (e) {
        out.push(`FINDSTR: ${e.message}`);
      }
    }
    return Result.ok(out.join('\n'));
  }

  // ── SORT ───────────────────────────────────────────────────────────────────
  sort(args, stdin) {
    const tokens  = tokenise(args);
    const flags   = tokens.filter(t => t.startsWith('/'));
    const files   = tokens.filter(t => !t.startsWith('/')).map(f => resolvePath(f));
    const reverse = flags.some(f => f.toUpperCase() === '/R');
    let content   = '';
    if (files.length) {
      try { content = fs.readFileSync(files[0], 'utf8'); } catch (e) { return Result.fail(e.message); }
    } else {
      content = stdin || '';
    }
    const sorted = content.split('\n').sort((a, b) => reverse ? b.localeCompare(a) : a.localeCompare(b));
    return Result.ok(sorted.join('\n'));
  }

  // ── MORE ───────────────────────────────────────────────────────────────────
  more(args) {
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    if (!tokens.length) return Result.ok('');
    try {
      const content = fs.readFileSync(resolvePath(tokens[0]), 'utf8');
      return Result.ok(content);
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  // ── ATTRIB ─────────────────────────────────────────────────────────────────
  attrib(args) {
    const tokens  = tokenise(args);
    const targets = tokens.filter(t => !t.startsWith('/') && !/^[+-][RASHEI]$/i.test(t));
    const dirs    = targets.length ? targets.map(t => resolvePath(t)) : [process.cwd()];
    const lines   = [];
    for (const d of dirs) {
      try {
        const stat = fs.statSync(d);
        if (stat.isDirectory()) {
          for (const entry of fs.readdirSync(d)) {
            const attrs = entry.startsWith('.') ? 'H  ' : '   ';
            lines.push(`${attrs}                 ${linuxToWin(path.join(d, entry))}`);
          }
        } else {
          lines.push(`                     ${linuxToWin(d)}`);
        }
      } catch (e) { lines.push(e.message); }
    }
    return Result.ok(lines.join('\n'));
  }

  // ── FC (File Compare) ──────────────────────────────────────────────────────
  fc(args) {
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    if (tokens.length < 2) return Result.fail(`Required parameter missing.`);
    const [f1, f2] = tokens.map(t => resolvePath(t));
    try {
      const a = fs.readFileSync(f1, 'utf8').split('\n');
      const b = fs.readFileSync(f2, 'utf8').split('\n');
      const diffs = [];
      const len = Math.max(a.length, b.length);
      let inBlock = false;
      for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) {
          if (!inBlock) {
            diffs.push(`***** ${linuxToWin(f1)}`);
            inBlock = true;
          }
          if (a[i] !== undefined) diffs.push(a[i]);
          if (b[i] !== undefined) { diffs.push(`***** ${linuxToWin(f2)}`); diffs.push(b[i]); }
        } else {
          if (inBlock) { diffs.push('*****'); inBlock = false; }
        }
      }
      if (!diffs.length) return Result.ok(`FC: no differences encountered`);
      return Result.ok([`Comparing files ${linuxToWin(f1)} and ${linuxToWin(f2)}`, ...diffs, '*****'].join('\n'));
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  // ── TREE ───────────────────────────────────────────────────────────────────
  tree(args) {
    const tokens   = tokenise(args);
    const showFiles = tokens.some(t => t.toUpperCase() === '/F');
    const target   = tokens.find(t => !t.startsWith('/')) || '.';
    const absPath  = resolvePath(target);

    const lines = [
      `Folder PATH listing`,
      `Volume serial number is DEAD-BEEF`,
      linuxToWin(absPath),
    ];

    const walk = (dir, prefix) => {
      let entries;
      try { entries = fs.readdirSync(dir); } catch { return; }
      entries.sort();
      entries.forEach((entry, i) => {
        const full    = path.join(dir, entry);
        const isLast  = i === entries.length - 1;
        const conn    = isLast ? '└───' : '├───';
        const extend  = isLast ? '    ' : '│   ';
        let stat;
        try { stat = fs.statSync(full); } catch { return; }
        if (stat.isDirectory()) {
          lines.push(`${prefix}${conn}${entry}`);
          walk(full, prefix + extend);
        } else if (showFiles) {
          lines.push(`${prefix}${conn}${entry}`);
        }
      });
    };

    walk(absPath, '');
    return Result.ok(lines.join('\n'));
  }

  // ── TASKLIST ───────────────────────────────────────────────────────────────
  tasklist(args) {
    const tokens  = tokenise(args);
    const filters = tokens.filter(t => t.startsWith('/'));
    const fmtSvc  = filters.some(t => t.toUpperCase() === '/SVC');
    try {
      const raw   = execSync('ps aux', { encoding: 'utf8' });
      const lines = raw.trim().split('\n').slice(1);
      const out   = [
        '',
        `${'Image Name'.padEnd(25)} ${'PID'.padStart(8)} ${'Session Name'.padEnd(15)} ${'Session#'.padStart(9)} ${'Mem Usage'.padStart(12)}`,
        '='.repeat(75),
      ];
      for (const ln of lines) {
        const parts = ln.split(/\s+/);
        if (parts.length < 11) continue;
        const pid  = parts[1];
        const mem  = parseInt(parts[5], 10) || 0;
        const cmd  = parts.slice(10).join(' ').trim();
        const exe  = (path.basename(cmd.split(' ')[0]) || 'Unknown').substring(0, 22) + '.exe';
        out.push(`${exe.padEnd(25)} ${pid.padStart(8)} ${'Console'.padEnd(15)} ${'1'.padStart(9)} ${(mem + ' K').padStart(12)}`);
      }
      return Result.ok(out.join('\n'));
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  // ── TASKKILL ───────────────────────────────────────────────────────────────
  taskkill(args) {
    const tokens = tokenise(args);
    const force  = tokens.some(t => t.toUpperCase() === '/F');
    const sig    = force ? '-9' : '-15';
    const out    = [];
    for (let i = 0; i < tokens.length; i++) {
      const u = tokens[i].toUpperCase();
      if (u === '/PID' && tokens[i+1]) {
        const pid = tokens[++i];
        const r   = spawnSync('kill', [sig, pid], { encoding: 'utf8' });
        out.push(r.status === 0
          ? `SUCCESS: The process with PID ${pid} has been terminated.`
          : `ERROR: The process "${pid}" not found.`);
      } else if (u === '/IM' && tokens[i+1]) {
        const img = tokens[++i];
        const r   = spawnSync('pkill', ['-f', img], { encoding: 'utf8' });
        out.push(r.status === 0
          ? `SUCCESS: The process "${img}" has been terminated.`
          : `ERROR: The process "${img}" not found.`);
      }
    }
    return Result.ok(out.join('\n'));
  }

  // ── IPCONFIG ───────────────────────────────────────────────────────────────
  ipconfig(args) {
    const all = args.toUpperCase().includes('/ALL');
    try {
      const ifaces = os.networkInterfaces();
      const out    = ['\nWindows IP Configuration\n'];
      for (const [name, addrs] of Object.entries(ifaces)) {
        out.push(`\nEthernet adapter ${name}:\n`);
        let ipv4 = 'N/A', ipv6 = 'N/A', mac = 'N/A';
        for (const addr of addrs) {
          if (addr.family === 'IPv4') { ipv4 = addr.address; }
          if (addr.family === 'IPv6') { ipv6 = addr.address; }
          if (addr.mac && addr.mac !== '00:00:00:00:00:00') mac = addr.mac.toUpperCase();
        }
        if (all) out.push(`   Physical Address. . . . . . . . . : ${mac}`);
        if (ipv6 !== 'N/A') out.push(`   IPv6 Address. . . . . . . . . . . : ${ipv6}`);
        out.push(`   IPv4 Address. . . . . . . . . . . : ${ipv4}`);
        out.push(`   Subnet Mask . . . . . . . . . . . : 255.255.255.0`);
        out.push(`   Default Gateway . . . . . . . . . : N/A`);
      }
      return Result.ok(out.join('\n'));
    } catch (e) {
      return Result.fail(e.message);
    }
  }

  // ── PING ───────────────────────────────────────────────────────────────────
  ping(args) {
    const tokens = tokenise(args);
    let host     = '', count = 4;
    for (let i = 0; i < tokens.length; i++) {
      const u = tokens[i].toUpperCase();
      if ((u === '-N' || u === '/N') && tokens[i+1]) { count = parseInt(tokens[++i], 10) || 4; }
      else if (!tokens[i].startsWith('-') && !tokens[i].startsWith('/')) host = tokens[i];
    }
    if (!host) return Result.fail(`Bad parameter.`);
    try {
      const r   = spawnSync('ping', ['-c', String(count), host], { encoding: 'utf8', timeout: 30000 });
      const raw = r.stdout || '';
      const out = [`\nPinging ${host} with 32 bytes of data:`];
      for (const ln of raw.split('\n')) {
        if (ln.includes('bytes from')) {
          const t = ln.match(/time=([\d.]+)/);
          out.push(`Reply from ${host}: bytes=32 time=${t ? t[1] : '?'}ms TTL=64`);
        } else if (ln.toLowerCase().includes('timeout') || ln.includes('100% packet loss')) {
          out.push(`Request timed out.`);
        }
      }
      const statsMatch = raw.match(/(\d+) packets transmitted, (\d+) (?:packets )?received/);
      if (statsMatch) {
        const sent = parseInt(statsMatch[1], 10), recv = parseInt(statsMatch[2], 10);
        const lost = sent - recv;
        out.push(`\nPing statistics for ${host}:`);
        out.push(`    Packets: Sent = ${sent}, Received = ${recv}, Lost = ${lost} (${Math.round(lost/sent*100)}% loss),`);
      }
      return Result.ok(out.join('\n'));
    } catch (e) {
      return Result.fail(`Ping request could not find host ${host}.`);
    }
  }

  // ── TRACERT ────────────────────────────────────────────────────────────────
  tracert(args) {
    const tokens = tokenise(args);
    const host   = tokens.find(t => !t.startsWith('/')) || '';
    if (!host) return Result.fail(`Bad parameter.`);
    const out = [`\nTracing route to ${host}\nover a maximum of 30 hops:\n`];
    try {
      const r = spawnSync('traceroute', ['-m', '30', host], { encoding: 'utf8', timeout: 60000 });
      const lines = (r.stdout || '').split('\n').slice(1);
      for (const ln of lines) {
        const m = ln.match(/^\s*(\d+)\s+(.*)/);
        if (m) out.push(`  ${m[1].padStart(3)}  ${m[2]}`);
      }
    } catch {
      out.push('  traceroute: command not found. Run: apt install traceroute');
    }
    out.push('\nTrace complete.');
    return Result.ok(out.join('\n'));
  }

  // ── NETSTAT ────────────────────────────────────────────────────────────────
  netstat(args) {
    const out = ['\nActive Connections\n',
      `  ${'Proto'.padEnd(6)} ${'Local Address'.padEnd(22)} ${'Foreign Address'.padEnd(22)} State`];
    try {
      const r = spawnSync('ss', ['-tunap'], { encoding: 'utf8' });
      const lines = (r.stdout || '').split('\n').slice(1);
      for (const ln of lines) {
        const parts = ln.split(/\s+/);
        if (parts.length >= 5 && ['tcp','udp'].includes(parts[0].toLowerCase())) {
          const proto  = parts[0].toUpperCase();
          const local  = (parts[4] || '').substring(0, 22);
          const remote = (parts[5] || '*:*').substring(0, 22);
          const state  = parts[1] || '';
          out.push(`  ${proto.padEnd(6)} ${local.padEnd(22)} ${remote.padEnd(22)} ${state}`);
        }
      }
    } catch (e) { out.push(`  ${e.message}`); }
    return Result.ok(out.join('\n'));
  }

  // ── SYSTEMINFO ─────────────────────────────────────────────────────────────
  systeminfo() {
    const host  = os.hostname().toUpperCase();
    const user  = os.userInfo().username;
    const uname = os.version();
    const arch  = os.arch();
    const now   = new Date();

    let osName = 'Kali Linux';
    try {
      const r = fs.readFileSync('/etc/os-release', 'utf8');
      const m = r.match(/PRETTY_NAME="([^"]+)"/);
      if (m) osName = m[1];
    } catch {}

    const totalMem = Math.round(os.totalmem() / 1024 / 1024);
    const freeMem  = Math.round(os.freemem()  / 1024 / 1024);

    const lines = [
      '',
      `Host Name:                 ${host}`,
      `OS Name:                   Microsoft Windows 10 Pro (Emulated — ${osName})`,
      `OS Version:                10.0.19045 N/A Build 19045`,
      `OS Manufacturer:           Microsoft Corporation`,
      `OS Configuration:          Standalone Workstation`,
      `OS Build Type:             Multiprocessor Free`,
      `Registered Owner:          ${user}`,
      `Registered Organization:   N/A`,
      `Product ID:                00330-71054-35713-AAOEM`,
      `Original Install Date:     01/01/2024, 12:00:00 AM`,
      `System Boot Time:          ${now.toLocaleString('en-US')}`,
      `System Manufacturer:       WinCMD-Kali Emulator`,
      `System Model:              WinCMD v1.0`,
      `System Type:               ${arch}-based PC`,
      `Processor(s):              ${uname}`,
      `Windows Directory:         C:\\Windows`,
      `System Directory:          C:\\Windows\\System32`,
      `Boot Device:               \\Device\\HarddiskVolume1`,
      `System Locale:             en-us;English (United States)`,
      `Input Locale:              en-us;English (United States)`,
      `Time Zone:                 (UTC+00:00) Coordinated Universal Time`,
      `Total Physical Memory:     ${totalMem.toLocaleString()} MB`,
      `Available Physical Memory: ${freeMem.toLocaleString()} MB`,
      `Virtual Memory: Max Size:  ${(totalMem * 2).toLocaleString()} MB`,
      `Virtual Memory: Available: ${(freeMem  * 2).toLocaleString()} MB`,
      `Page File Location(s):     C:\\pagefile.sys`,
      `Domain:                    WORKGROUP`,
      `Logon Server:              \\\\${host}`,
      `Hotfix(s):                 N/A`,
    ];
    return Result.ok(lines.join('\n'));
  }

  // ── VER ────────────────────────────────────────────────────────────────────
  ver() {
    return Result.ok('\nMicrosoft Windows [Version 10.0.19045.3996]\n(Emulated by WinCMD-Kali v1.0.0)\n');
  }

  // ── DATE ───────────────────────────────────────────────────────────────────
  date(args) {
    const d    = new Date();
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const mm   = String(d.getMonth()+1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    return Result.ok(`The current date is: ${days[d.getDay()]} ${mm}/${dd}/${d.getFullYear()}`);
  }

  // ── TIME ───────────────────────────────────────────────────────────────────
  time() {
    const d  = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const ss = String(d.getSeconds()).padStart(2,'0');
    const ms = String(d.getMilliseconds()).padStart(2,'0');
    return Result.ok(`The current time is:  ${hh}:${mm}:${ss}.${ms}`);
  }

  // ── WHOAMI ─────────────────────────────────────────────────────────────────
  whoami(args) {
    const user = os.userInfo().username;
    const host = os.hostname();
    if (args.toUpperCase().includes('/ALL')) {
      return Result.ok([
        '',
        `User Name: ${host}\\${user}`,
        ``,
        `GROUP INFORMATION`,
        `-----------------`,
        `Group Name                     Type`,
        `Everyone                       Well-known group`,
        `BUILTIN\\Users                  Alias`,
      ].join('\n'));
    }
    return Result.ok(`${host}\\${user}`);
  }

  // ── HOSTNAME ───────────────────────────────────────────────────────────────
  hostname() {
    return Result.ok(os.hostname());
  }

  // ── WHERE ──────────────────────────────────────────────────────────────────
  where(args) {
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    const out    = [];
    for (const t of tokens) {
      try {
        const r = execSync(`which ${t} 2>/dev/null`, { encoding: 'utf8' }).trim();
        if (r) out.push(linuxToWin(r));
        else   out.push(`INFO: Could not find files for the given pattern(s).`);
      } catch {
        out.push(`INFO: Could not find files for the given pattern(s).`);
      }
    }
    return Result.ok(out.join('\n'));
  }

  // ── PATH ───────────────────────────────────────────────────────────────────
  path(args) {
    if (!args.trim()) return Result.ok(`PATH=${process.env.PATH || ''}`);
    this.env.set('PATH', args.trim());
    return Result.ok('');
  }

  // ── HELP ───────────────────────────────────────────────────────────────────
  help(args) {
    const topic = args.trim().toUpperCase();
    const detailed = {
      DIR:        `Displays a list of files and subdirectories in a directory.\n\n  DIR [drive:][path][filename] [/A[[:]attributes]] [/B] [/W]\n\n  /A    Displays files with specified attributes.\n  /B    Uses bare format (no heading info or summary).\n  /W    Uses wide list format.`,
      CD:         `Displays the name of or changes the current directory.\n\n  CHDIR [/D] [drive:][path]\n  CHDIR [..]`,
      COPY:       `Copies one or more files to another location.\n\n  COPY source destination`,
      DEL:        `Deletes one or more files.\n\n  DEL [/F] [/Q] names\n\n  /F    Force deleting of read-only files.\n  /Q    Quiet mode, do not ask if ok to delete on global wildcard.`,
      ECHO:       `Displays messages, or turns command-echoing on or off.\n\n  ECHO [ON | OFF]\n  ECHO [message]`,
      FIND:       `Searches for a text string in a file or files.\n\n  FIND [/V] [/C] [/I] "string" [[drive:][path]filename[ ...]]\n\n  /V    Displays all lines NOT containing the specified string.\n  /C    Displays only the count of lines containing the string.\n  /I    Ignores the case of characters when searching for the string.`,
      IPCONFIG:   `Displays all current TCP/IP network configuration values.\n\n  IPCONFIG [/ALL]\n\n  /ALL  Display full configuration information.`,
      MKDIR:      `Creates a directory.\n\n  MKDIR [drive:]path\n  MD [drive:]path`,
      PING:       `Verifies IP-level connectivity to another TCP/IP computer.\n\n  PING [-n count] target_name\n\n  -n count    Number of echo requests to send.`,
      SET:        `Displays, sets, or removes Windows environment variables.\n\n  SET [variable=[string]]\n\n  If no string supplied after =, the variable is deleted.`,
      TASKLIST:   `Displays a list of currently running processes.\n\n  TASKLIST [/SVC]`,
      TASKKILL:   `Allows the user to end one or more processes.\n\n  TASKKILL [/PID pid | /IM imagename] [/F]\n\n  /F    Specifies to forcefully terminate the process(es).\n  /PID  Specifies the PID of the process to be terminated.\n  /IM   Specifies the image name of the process to be terminated.`,
      TREE:       `Graphically displays the folder structure of a drive or path.\n\n  TREE [drive:][path] [/F]\n\n  /F    Display the names of the files in each folder.`,
      XCOPY:      `Copies files and directory trees.\n\n  XCOPY source [destination] [/S] [/E]\n\n  /S    Copies directories and subdirectories.\n  /E    Copies all subdirectories, including empty ones.`,
    };

    if (topic && detailed[topic]) return Result.ok(`\n${detailed[topic]}\n`);

    const cmds = [
      ['ATTRIB',    'Displays or changes file attributes.'],
      ['CD',        'Displays the name of or changes the current directory.'],
      ['CLS',       'Clears the screen.'],
      ['COPY',      'Copies one or more files to another location.'],
      ['DATE',      'Displays or sets the date.'],
      ['DEL',       'Deletes one or more files.'],
      ['DIR',       'Displays a list of files and subdirectories in a directory.'],
      ['ECHO',      'Displays messages, or turns command echoing on or off.'],
      ['EXIT',      'Quits the CMD.EXE program (command interpreter).'],
      ['FC',        'Compares two files or sets of files, and displays the differences.'],
      ['FIND',      'Searches for a text string in a file or files.'],
      ['FINDSTR',   'Searches for strings in files.'],
      ['FOR',       'Runs a specified command for each file in a set of files.'],
      ['HELP',      'Provides Help information for Windows commands.'],
      ['HOSTNAME',  'Prints the name of the current host.'],
      ['IF',        'Performs conditional processing in batch programs.'],
      ['IPCONFIG',  'Displays all current TCP/IP network configuration values.'],
      ['MD',        'Creates a directory.'],
      ['MKDIR',     'Creates a directory.'],
      ['MORE',      'Displays output one screen at a time.'],
      ['MOVE',      'Moves one or more files from one directory to another directory.'],
      ['NETSTAT',   'Displays protocol statistics and current TCP/IP connections.'],
      ['PATH',      'Displays or sets a search path for executable files.'],
      ['PAUSE',     'Suspends processing of a batch file and displays a message.'],
      ['PING',      'Sends ICMP ECHO_REQUEST to network hosts.'],
      ['RD',        'Removes a directory.'],
      ['REM',       'Records comments (remarks) in batch files.'],
      ['REN',       'Renames a file or files.'],
      ['RENAME',    'Renames a file or files.'],
      ['RMDIR',     'Removes a directory.'],
      ['SET',       'Displays, sets, or removes Windows environment variables.'],
      ['SORT',      'Sorts input.'],
      ['SYSTEMINFO','Displays machine specific properties and configuration.'],
      ['TASKKILL',  'Kill or stop a running process or application.'],
      ['TASKLIST',  'Displays all currently running tasks including services.'],
      ['TIME',      'Displays or sets the system time.'],
      ['TRACERT',   'Traces the route taken by packets to reach a network host.'],
      ['TREE',      'Graphically displays the directory structure of a drive or path.'],
      ['TYPE',      'Displays the contents of a text file.'],
      ['VER',       'Displays the Windows version.'],
      ['WHOAMI',    'Displays the current domain and user name.'],
      ['WHERE',     'Displays the location of files that match the search pattern.'],
      ['XCOPY',     'Copies files and directory trees.'],
      // Extended commands
      ['ASSOC',      'Displays or modifies file extension associations.'],
      ['BCDEDIT',    'Sets properties in boot database to control boot loading.'],
      ['BREAK',      'Sets or clears extended CTRL+C checking.'],
      ['CACLS',      'Displays or modifies access control lists (ACLs) of files.'],
      ['CHCP',       'Displays or sets the active code page number.'],
      ['CHKDSK',     'Checks a disk and displays a status report.'],
      ['CIPHER',     'Displays or alters the encryption of directories/files.'],
      ['CLIP',       'Redirects output of command line tools to the clipboard.'],
      ['COLOR',      'Sets the default console foreground and background colors.'],
      ['COMP',       'Compares the contents of two files or sets of files.'],
      ['COMPACT',    'Displays or alters the compression of files on NTFS.'],
      ['CONVERT',    'Converts FAT volumes to NTFS.'],
      ['DISKPART',   'Displays or configures Disk Partition properties.'],
      ['DOSKEY',     'Edits command lines, recalls Windows commands, creates macros.'],
      ['DRIVERQUERY','Displays current device driver status and properties.'],
      ['ENDLOCAL',   'Ends localization of environment changes in a batch file.'],
      ['EXPAND',     'Expands one or more compressed files.'],
      ['FTYPE',      'Displays or modifies file types in file extension associations.'],
      ['GPRESULT',   'Displays Group Policy information for machine or user.'],
      ['ICACLS',     'Display, modify, backup, or restore ACLs for files/dirs.'],
      ['LABEL',      'Creates, changes, or deletes the volume label of a disk.'],
      ['MKLINK',     'Creates a symbolic link.'],
      ['MODE',       'Configures a system device.'],
      ['MSG',        'Send a message to a user.'],
      ['NET',        'Provides various network services.'],
      ['NETSH',      'Allows you to configure network components.'],
      ['NLTEST',     'Performs network tests.'],
      ['OPENFILES',  'Queries, displays, or disconnects open files.'],
      ['PRINT',      'Prints a text file.'],
      ['PROMPT',     'Changes the Windows command prompt.'],
      ['REG',        'Console registry tool.'],
      ['REPLACE',    'Replaces files in one directory with files of same name.'],
      ['ROBOCOPY',   'Robust file and folder copy.'],
      ['RUNAS',      'Allows a user to run specific tools/programs with permissions.'],
      ['SC',         'Displays or configures services (background processes).'],
      ['SCHTASKS',   'Schedules commands and programs to run on a computer.'],
      ['SETLOCAL',   'Begins localization of environment changes in a batch file.'],
      ['SETX',       'Sets environment variables in user or system environment.'],
      ['SFC',        'Scans and verifies the integrity of all protected system files.'],
      ['SHUTDOWN',   'Allows proper local or remote shutdown of machine.'],
      ['START',      'Starts a separate window to run a specified program or command.'],
      ['SUBST',      'Associates a path with a drive letter.'],
      ['TAKEOWN',    'Allows an administrator to recover access to a file.'],
      ['TIMEOUT',    'This utility accepts a timeout parameter to wait.'],
      ['VOL',        'Displays a disk volume label and serial number.'],
      ['WMIC',       'Displays WMI information inside interactive command shell.'],
    ];

    const lines = ['For more information on a specific command, type HELP command-name\n'];
    for (const [name, desc] of cmds) {
      lines.push(`${name.padEnd(15)} ${desc}`);
    }
    return Result.ok(lines.join('\n'));
  }

  // ── Glob helper ────────────────────────────────────────────────────────────
  _glob(name, pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
                           .replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i').test(name);
  }


// ── CHCP ──────────────────────────────────────────────────────────────────
  chcp(args) {
    const cp = args.trim();
    if (!cp) return Result.ok('Active code page: 437');
    const map = { '437':'US','850':'Multilingual','65001':'UTF-8','1252':'Windows-1252' };
    return map[cp]
      ? Result.ok(`Active code page: ${cp}`)
      : Result.fail(`Code page ${cp} is not valid.`);
  }

  // ── CHKDSK ────────────────────────────────────────────────────────────────
  chkdsk(args) {
    const { execSync } = require('child_process');
    try {
      const df = execSync('df -h / 2>/dev/null', { encoding:'utf8' }).trim().split('\n');
      const parts = df[1] ? df[1].split(/\s+/) : [];
      const total = parts[1]||'?', used = parts[2]||'?', avail = parts[3]||'?';
      return Result.ok([
        '',
        'The type of the file system is NTFS.',
        `Volume label is WinCMD-Kali.`,
        '',
        `Windows has scanned the file system and found no problems.`,
        '',
        ` Total disk space     : ${total}`,
        ` Total in use         : ${used}`,
        ` Available on disk    : ${avail}`,
        '',
        'Windows has finished checking your disk.',
      ].join('\n'));
    } catch(e) { return Result.fail(e.message); }
  }

  // ── VOL ───────────────────────────────────────────────────────────────────
  vol(args) {
    return Result.ok([
      '',
      ' Volume in drive C is WinCMD-Kali',
      ' Volume Serial Number is DEAD-BEEF',
    ].join('\n'));
  }

  // ── LABEL ─────────────────────────────────────────────────────────────────
  label(args) {
    const lbl = args.trim() || 'WinCMD-Kali';
    return Result.ok(`Volume label set to: ${lbl}`);
  }

  // ── ASSOC ─────────────────────────────────────────────────────────────────
  assoc(args) {
    const map = {
      '.txt':'txtfile','.bat':'batfile','.cmd':'cmdfile',
      '.exe':'exefile','.com':'comfile','.js':'JSFile',
      '.py':'Python.File','.sh':'bashscript','.zip':'CompressedFolder',
      '.jpg':'jpegfile','.png':'pngfile','.pdf':'AcroExch.Document',
    };
    const a = args.trim();
    if (!a) return Result.ok(Object.entries(map).map(([k,v])=>`${k}=${v}`).join('\n'));
    const ext = a.startsWith('.') ? a.toLowerCase() : '.' + a.toLowerCase();
    return map[ext]
      ? Result.ok(`${ext}=${map[ext]}`)
      : Result.fail(`File association not found for extension ${a}`);
  }

  // ── FTYPE ─────────────────────────────────────────────────────────────────
  ftype(args) {
    const types = {
      'txtfile':'%SystemRoot%\\system32\\NOTEPAD.EXE %1',
      'batfile':'%SystemRoot%\\System32\\cmd.exe /c "%1" %*',
      'exefile':'"%1" %*',
      'Python.File':'python3 "%1" %*',
    };
    const a = args.trim();
    if (!a) return Result.ok(Object.entries(types).map(([k,v])=>`${k}="${v}"`).join('\n'));
    return types[a]
      ? Result.ok(`${a}="${types[a]}"`)
      : Result.fail(`File type "${a}" not found or no open command associated with it.`);
  }

  // ── COLOR ─────────────────────────────────────────────────────────────────
  color(args) {
    // CMD color codes: first hex=bg, second=fg
    const code = args.trim();
    if (!code) { process.stdout.write('\x1b[0m'); return Result.ok(''); }
    const ansiMap = {
      '0':'\x1b[30m','1':'\x1b[34m','2':'\x1b[32m','3':'\x1b[36m',
      '4':'\x1b[31m','5':'\x1b[35m','6':'\x1b[33m','7':'\x1b[37m',
      '8':'\x1b[90m','9':'\x1b[94m','A':'\x1b[92m','B':'\x1b[96m',
      'C':'\x1b[91m','D':'\x1b[95m','E':'\x1b[93m','F':'\x1b[97m',
    };
    const fg = ansiMap[(code[1]||code[0]).toUpperCase()];
    if (fg) process.stdout.write(fg);
    return Result.ok('');
  }

  // ── PROMPT ────────────────────────────────────────────────────────────────
  prompt(args) {
    // Store custom prompt string in env
    const p = args.trim();
    this.env.set('PROMPT', p || '$P$G');
    return Result.ok('');
  }

  // ── MKLINK ────────────────────────────────────────────────────────────────
  mklink(args) {
    const { spawnSync } = require('child_process');
    const tokens = tokenise(args);
    const isDir  = tokens[0] === '/D';
    const isDel  = tokens[0] === '/H';
    const paths  = tokens.filter(t => !t.startsWith('/'));
    if (paths.length < 2) return Result.fail('The syntax of the command is incorrect.');
    const link   = resolvePath(paths[0]);
    const target = resolvePath(paths[1]);
    try {
      const flag = isDir ? '-s' : (isDel ? '-f' : '-s');
      const r = spawnSync('ln', [flag, target, link], { encoding:'utf8' });
      if (r.status !== 0) return Result.fail(r.stderr || 'Cannot create symbolic link.');
      return Result.ok(`symbolic link created for ${paths[0]} <<===>> ${paths[1]}`);
    } catch(e) { return Result.fail(e.message); }
  }

  // ── ICACLS / CACLS ────────────────────────────────────────────────────────
  icacls(args) {
    const { spawnSync } = require('child_process');
    const tokens = tokenise(args);
    const target = tokens.find(t => !t.startsWith('/'));
    if (!target) return Result.fail('The syntax of the command is incorrect.');
    const p = resolvePath(target);
    try {
      const r = spawnSync('ls', ['-la', p], { encoding:'utf8' });
      const out = [
        `${target}`,
        `  BUILTIN\\Administrators:(I)(F)`,
        `  NT AUTHORITY\\SYSTEM:(I)(F)`,
        `  ${this.env.get('USERNAME')}:(I)(RX)`,
        '',
        `Linux permissions: ${(r.stdout||'').split('\n')[0]}`,
        '',
        'Successfully processed 1 files; Failed processing 0 files',
      ];
      return Result.ok(out.join('\n'));
    } catch(e) { return Result.fail(e.message); }
  }

  // ── TAKEOWN ───────────────────────────────────────────────────────────────
  takeown(args) {
    const { spawnSync } = require('child_process');
    const tokens = tokenise(args);
    const fIdx   = tokens.findIndex(t => t.toUpperCase() === '/F');
    const target = fIdx !== -1 && tokens[fIdx+1] ? tokens[fIdx+1] : tokens.find(t => !t.startsWith('/'));
    if (!target) return Result.fail('The syntax of the command is incorrect.');
    const p = resolvePath(target);
    const r = spawnSync('chown', [process.env.USER||'root', p], { encoding:'utf8' });
    return r.status === 0
      ? Result.ok(`SUCCESS: The file (or folder): "${target}" now owned by the administrators group.`)
      : Result.fail(r.stderr || 'Access denied.');
  }

  // ── SC (Service Control) ──────────────────────────────────────────────────
  sc(args) {
    const { spawnSync } = require('child_process');
    const tokens = tokenise(args);
    const sub    = (tokens[0]||'').toLowerCase();
    const svc    = tokens[1] || '';
    const cmdMap = { start:'start', stop:'stop', restart:'restart', status:'status' };
    if (!cmdMap[sub]) {
      return Result.ok([
        'DESCRIPTION:',
        '  SC is a command line program used for communicating with the',
        '  Service Control Manager and services.',
        'USAGE:',
        '  sc [command] [service name]',
        'COMMANDS:',
        '  query   - Queries status for a service',
        '  start   - Starts a service',
        '  stop    - Sends a STOP control to a service',
        '  restart - Restarts a service',
      ].join('\n'));
    }
    const r = spawnSync('systemctl', [cmdMap[sub], svc], { encoding:'utf8' });
    if (r.status === 0) return Result.ok(`[SC] ${svc}: ${sub} successful.`);
    return Result.fail(r.stderr || `[SC] Failed to ${sub} ${svc}.`);
  }

  // ── NET ───────────────────────────────────────────────────────────────────
  net(args) {
    const { spawnSync, execSync } = require('child_process');
    const tokens = tokenise(args);
    const sub    = (tokens[0]||'').toLowerCase();

    if (sub === 'user') {
      try {
        const out = execSync("cat /etc/passwd | grep -v nologin | grep -v false | cut -d: -f1", {encoding:'utf8'});
        const users = out.trim().split('\n');
        const lines = [
          '', `User accounts for \\\\${require('os').hostname().toUpperCase()}`, '',
          '-'.repeat(65),
          ...users.map(u => u.padEnd(24)),
          '', 'The command completed successfully.',
        ];
        return Result.ok(lines.join('\n'));
      } catch(e) { return Result.fail(e.message); }
    }
    if (sub === 'start') {
      const svc = tokens[1]||'';
      const r = spawnSync('systemctl', ['start', svc], { encoding:'utf8' });
      return r.status === 0 ? Result.ok(`The ${svc} service is starting.`) : Result.fail(r.stderr||'Failed.');
    }
    if (sub === 'stop') {
      const svc = tokens[1]||'';
      const r = spawnSync('systemctl', ['stop', svc], { encoding:'utf8' });
      return r.status === 0 ? Result.ok(`The ${svc} service was stopped.`) : Result.fail(r.stderr||'Failed.');
    }
    if (sub === 'view' || sub === 'share') {
      try {
        const h = execSync('hostname', {encoding:'utf8'}).trim();
        return Result.ok([`Server Name          Remark`, '-'.repeat(50), h.padEnd(20)+' WinCMD-Kali Host'].join('\n'));
      } catch(e) { return Result.fail(e.message); }
    }
    return Result.ok([
      'The syntax of this command is:',
      '',
      'NET [ ACCOUNTS | COMPUTER | CONFIG | CONTINUE | FILE | GROUP |',
      '      HELP | HELPMSG | LOCALGROUP | PAUSE | PRINT | SESSION |',
      '      SHARE | START | STATISTICS | STOP | TIME | USE | USER | VIEW ]',
    ].join('\n'));
  }

  // ── NETSH ─────────────────────────────────────────────────────────────────
  netsh(args) {
    const { execSync } = require('child_process');
    const a = args.trim().toLowerCase();
    if (a.includes('interface') || a.includes('ip show')) {
      try {
        const r = execSync('ip addr show 2>/dev/null', { encoding:'utf8' });
        return Result.ok(r);
      } catch(e) { return Result.fail(e.message); }
    }
    if (a.includes('wlan')) {
      try {
        const r = execSync('iwconfig 2>/dev/null || echo "No wireless interface found"', { encoding:'utf8', shell:true });
        return Result.ok(r);
      } catch(e) { return Result.fail(e.message); }
    }
    return Result.ok([
      'The following commands are available:',
      '',
      'Commands in this context:',
      '..             - Goes up one context level.',
      '?              - Displays a list of commands.',
      'add            - Adds a configuration entry.',
      'delete         - Deletes a configuration entry.',
      'dump           - Displays a configuration script.',
      'exec           - Runs a script file.',
      'help           - Displays a list of commands.',
      'interface      - Changes to the "netsh interface" context.',
      'wlan           - Changes to the "netsh wlan" context.',
    ].join('\n'));
  }

  // ── RUNAS ─────────────────────────────────────────────────────────────────
  runas(args) {
    const { spawnSync } = require('child_process');
    const tokens  = tokenise(args);
    const userIdx = tokens.findIndex(t => t.toLowerCase().startsWith('/user:'));
    const user    = userIdx !== -1 ? tokens[userIdx].split(':')[1] : 'Administrator';
    const cmd     = tokens.filter(t => !t.startsWith('/')).join(' ');
    if (!cmd) return Result.fail('The syntax of this command is:\nRUNAS /user:username "command"');
    const r = spawnSync('sudo', ['-u', user, 'bash', '-c', cmd], { stdio:'inherit', encoding:'utf8' });
    return Result.ok('');
  }

  // ── SHUTDOWN ──────────────────────────────────────────────────────────────
  shutdown(args) {
    const { spawnSync } = require('child_process');
    const a = args.toUpperCase();
    if (a.includes('/A')) return Result.ok('Shutdown aborted.');
    if (a.includes('/R')) {
      const r = spawnSync('shutdown', ['-r', 'now'], { encoding:'utf8' });
      return Result.ok('The system is going down for reboot NOW!');
    }
    if (a.includes('/S') || a.includes('/P')) {
      const r = spawnSync('shutdown', ['-h', 'now'], { encoding:'utf8' });
      return Result.ok('The system is going down for halt NOW!');
    }
    return Result.ok([
      'Usage: SHUTDOWN [/S] [/R] [/A] [/P] [/H] [/T xxx] [/C "comment"]',
      '',
      '/S    Shutdown the computer.',
      '/R    Shutdown and restart the computer.',
      '/A    Abort a system shutdown.',
      '/P    Turn off the local computer with no time-out or warning.',
      '/T xxx  Set the time-out period before shutdown to xxx seconds.',
    ].join('\n'));
  }

  // ── START ─────────────────────────────────────────────────────────────────
  start(args) {
    const { spawn } = require('child_process');
    const tokens = tokenise(args);
    const prog   = tokens.find(t => !t.startsWith('/'));
    if (!prog) return Result.ok('');
    // try xdg-open for files, or spawn for programs
    const child = spawn('xdg-open', [prog], { detached:true, stdio:'ignore' });
    child.unref();
    return Result.ok('');
  }

  // ── TIMEOUT ───────────────────────────────────────────────────────────────
  timeout(args) {
    const tokens  = tokenise(args);
    const noBreak = tokens.some(t => t.toLowerCase() === '/nobreak');
    const secs    = parseInt(tokens.find(t => !t.startsWith('/')) || '0', 10);
    if (isNaN(secs) || secs <= 0) return Result.fail('ERROR: Invalid timeout value.');
    const { execSync } = require('child_process');
    for (let i = secs; i > 0; i--) {
      process.stdout.write(`\rWaiting for ${i} second(s), press a key to continue ...`);
      try { execSync('sleep 1', { stdio: ['pipe','pipe','pipe'] }); } catch {}
    }
    process.stdout.write('\n');
    return Result.ok('');
  }

  // ── SETX ──────────────────────────────────────────────────────────────────
  setx(args) {
    const tokens = tokenise(args);
    if (tokens.length < 2) return Result.fail('ERROR: Invalid syntax. Usage: SETX variable value');
    const [name, value] = tokens;
    this.env.set(name.toUpperCase(), value);
    // Persist to ~/.bashrc
    try {
      const fs = require('fs');
      const home = require('os').homedir();
      const line = `\nexport ${name.toUpperCase()}="${value}"`;
      fs.appendFileSync(`${home}/.bashrc`, line);
    } catch {}
    return Result.ok([
      'SUCCESS: Specified value was saved.',
    ].join('\n'));
  }

  // ── SETLOCAL / ENDLOCAL ───────────────────────────────────────────────────
  setlocal(args) {
    this._localEnvStack = this._localEnvStack || [];
    this._localEnvStack.push(Object.assign({}, this.env.vars));
    return Result.ok('');
  }
  endlocal(args) {
    this._localEnvStack = this._localEnvStack || [];
    if (this._localEnvStack.length > 0) {
      this.env.vars = this._localEnvStack.pop();
    }
    return Result.ok('');
  }

  // ── ROBOCOPY ──────────────────────────────────────────────────────────────
  robocopy(args) {
    const { spawnSync } = require('child_process');
    const tokens  = tokenise(args);
    const flags   = tokens.filter(t => t.startsWith('/'));
    const paths   = tokens.filter(t => !t.startsWith('/')).map(t => resolvePath(t));
    if (paths.length < 2) return Result.fail('Usage: ROBOCOPY source destination [file] [options]');
    const rsyncArgs = ['-av', '--progress'];
    if (flags.some(f => f.toUpperCase()==='/S' || f.toUpperCase()==='/E')) rsyncArgs.push('-r');
    if (flags.some(f => f.toUpperCase()==='/MIR')) rsyncArgs.push('--delete');
    rsyncArgs.push(paths[0]+'/', paths[1]);
    const r = spawnSync('rsync', rsyncArgs, { encoding:'utf8', stdio:['pipe','pipe','pipe'] });
    const out = [
      '-------------------------------------------------------------------------------',
      `   ROBOCOPY     ::     Robust File Copy for Windows`,
      '-------------------------------------------------------------------------------',
      `  Source : ${paths[0]}\\`,
      `    Dest : ${paths[1]}\\`,
      '-------------------------------------------------------------------------------',
      r.stdout || '',
      '-------------------------------------------------------------------------------',
      `               Total    Copied   Skipped  Mismatch    FAILED    Extras`,
      `    Dirs :         1         1         0         0         0         0`,
      `   Files :         *         *         0         0         0         0`,
      '-------------------------------------------------------------------------------',
    ];
    return Result.ok(out.join('\n'));
  }

  // ── REG ───────────────────────────────────────────────────────────────────
  reg(args) {
    const tokens = tokenise(args);
    const sub    = (tokens[0]||'').toUpperCase();
    const regDir = require('path').join(require('os').homedir(), '.wincmd_registry');
    const fs     = require('fs');
    if (!fs.existsSync(regDir)) fs.mkdirSync(regDir, { recursive:true });

    if (sub === 'QUERY') {
      const key  = tokens[1] || 'HKCU';
      const file = require('path').join(regDir, key.replace(/[\\/]/g,'_') + '.json');
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file,'utf8'));
        const lines = [key];
        for (const [k,v] of Object.entries(data)) lines.push(`    ${k}    REG_SZ    ${v}`);
        return Result.ok(lines.join('\n'));
      }
      return Result.ok(`${key}\n\n    (No values)`);
    }
    if (sub === 'ADD') {
      const key  = tokens[1] || 'HKCU';
      const vIdx = tokens.findIndex(t => t.toUpperCase() === '/V');
      const dIdx = tokens.findIndex(t => t.toUpperCase() === '/D');
      const name = vIdx !== -1 ? tokens[vIdx+1] : '(Default)';
      const val  = dIdx !== -1 ? tokens[dIdx+1] : '';
      const file = require('path').join(regDir, key.replace(/[\\/]/g,'_') + '.json');
      const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {};
      data[name] = val;
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      return Result.ok('The operation completed successfully.');
    }
    if (sub === 'DELETE') {
      const key  = tokens[1] || '';
      const file = require('path').join(regDir, key.replace(/[\\/]/g,'_') + '.json');
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return Result.ok('The operation completed successfully.');
    }
    return Result.ok([
      'REG Operation [QUERY | ADD | DELETE | COPY | SAVE | LOAD | UNLOAD | RESTORE | COMPARE | EXPORT | IMPORT | FLAGS]',
      '',
      'Return Code: (Mnemonic: operation, abbrevation, ..., REGSAM)',
      '',
      'REG QUERY KeyName [/v [ValueName] | /ve] [/s]',
      'REG ADD    KeyName [/v ValueName] [/d Data] [/f]',
      'REG DELETE KeyName [/v ValueName] [/f]',
    ].join('\n'));
  }

  // ── SCHTASKS ──────────────────────────────────────────────────────────────
  schtasks(args) {
    const { execSync, spawnSync } = require('child_process');
    const tokens = tokenise(args);
    const sub    = tokens.find(t => t.startsWith('/')) ? (tokens.find(t => t.toUpperCase()==='/CREATE') ? 'CREATE' : tokens.find(t => t.toUpperCase()==='/QUERY') ? 'QUERY' : 'QUERY') : 'QUERY';
    if (sub === 'QUERY') {
      try {
        const r = execSync('crontab -l 2>/dev/null || echo "(no cron jobs)"', { encoding:'utf8', shell:true });
        return Result.ok(['TaskName                                 Next Run Time          Status','='.repeat(73), r.trim()].join('\n'));
      } catch(e) { return Result.fail(e.message); }
    }
    return Result.ok('SCHTASKS /parameter [arguments]\nMaps to cron on Linux. Use "crontab -e" to edit scheduled tasks.');
  }

  // ── WMIC ──────────────────────────────────────────────────────────────────
  wmic(args) {
    const { execSync } = require('child_process');
    const a = args.trim().toLowerCase();
    try {
      if (a.includes('cpu') || a.includes('processor')) {
        const info = execSync('lscpu 2>/dev/null', { encoding:'utf8' });
        return Result.ok(['Caption  Description  MaxClockSpeed  Name', info].join('\n'));
      }
      if (a.includes('memorychip') || a.includes('os') || a.includes('computersystem')) {
        const mem  = Math.round(require('os').totalmem()/1024/1024);
        const free = Math.round(require('os').freemem()/1024/1024);
        return Result.ok([`TotalPhysicalMemory=${mem}MB`, `FreePhysicalMemory=${free}MB`].join('\n'));
      }
      if (a.includes('logicaldisk') || a.includes('disk')) {
        const df = execSync('df -h 2>/dev/null', { encoding:'utf8' });
        return Result.ok(['Caption  FreeSpace  Size  VolumeName', df].join('\n'));
      }
      if (a.includes('process')) {
        const ps = execSync('ps aux 2>/dev/null', { encoding:'utf8' });
        return Result.ok(['Caption  CommandLine  ProcessId  Status', ps].join('\n'));
      }
      if (a.includes('nic') || a.includes('network')) {
        const ip = execSync('ip addr 2>/dev/null', { encoding:'utf8' });
        return Result.ok(['Caption  Description  IPAddress  MACAddress', ip].join('\n'));
      }
    } catch(e) { return Result.fail(e.message); }
    return Result.ok([
      'wmic:root\\cli>',
      'WMIC is deprecated. Please use PowerShell cmdlets instead.',
      '',
      'Usage: wmic [alias] [where clause] [verb clause]',
      '',
      'Available aliases: cpu, memorychip, logicaldisk, os, computersystem,',
      '                   process, nic, baseboard, bios',
    ].join('\n'));
  }

  // ── DRIVERQUERY ───────────────────────────────────────────────────────────
  driverquery(args) {
    const { execSync } = require('child_process');
    try {
      const mods = execSync('lsmod 2>/dev/null | head -30', { encoding:'utf8' });
      const lines = mods.trim().split('\n');
      const out = [
        `Module Name          Display Name                           Driver Type   Link Date`,
        '='.repeat(85),
      ];
      for (const ln of lines.slice(1)) {
        const parts = ln.split(/\s+/);
        if (parts[0]) out.push(`${parts[0].padEnd(21)}${parts[0].padEnd(39)}${'Kernel'.padEnd(14)}N/A`);
      }
      return Result.ok(out.join('\n'));
    } catch(e) { return Result.fail(e.message); }
  }

  // ── OPENFILES ─────────────────────────────────────────────────────────────
  openfiles(args) {
    const { execSync } = require('child_process');
    try {
      const r = execSync('lsof -n -P 2>/dev/null | head -30', { encoding:'utf8' });
      return Result.ok(['Files Opened Locally:', '='.repeat(60), r].join('\n'));
    } catch(e) {
      return Result.fail('ERROR: The system was unable to open the file. lsof not found.');
    }
  }

  // ── CIPHER ────────────────────────────────────────────────────────────────
  cipher(args) {
    return Result.ok([
      ' Listing C:\\',
      ' New files added to this directory will be encrypted.',
      '',
      'U = Unencrypted  E = Encrypted',
      '',
      'U [error]  .',
      'U [error]  ..',
      '',
      'CIPHER emulation — actual NTFS encryption not applicable on Linux.',
      'Use: gpg, openssl, or cryptsetup for encryption on Linux.',
    ].join('\n'));
  }

  // ── SFC ───────────────────────────────────────────────────────────────────
  sfc(args) {
    return Result.ok([
      '',
      'Beginning system scan.  This process will take some time.',
      '',
      'Beginning verification phase of system scan.',
      'Verification 100% complete.',
      '',
      'Windows Resource Protection did not find any integrity violations.',
    ].join('\n'));
  }

  // ── GPRESULT ──────────────────────────────────────────────────────────────
  gpresult(args) {
    const user = require('os').userInfo().username;
    const host = require('os').hostname().toUpperCase();
    return Result.ok([
      '',
      `Microsoft (R) Windows (R) Operating System Group Policy Result tool v2.0`,
      `(C) Microsoft Corporation. All rights reserved.`,
      '',
      `Created on ${new Date().toLocaleDateString('en-US')} at ${new Date().toLocaleTimeString('en-US')}`,
      '',
      `RSOP data for ${host}\\${user} on ${host} : Logging Mode`,
      '-'.repeat(60),
      '',
      'OS Configuration:            Standalone Workstation',
      'OS Version:                  10.0.19045',
      'Site Name:                   N/A',
      'Roaming Profile:             N/A',
      'Local Profile:               C:\\Users\\' + user,
      'Connected over a slow link?: No',
      '',
      'COMPUTER SETTINGS',
      '-'.repeat(25),
      '    N/A',
      '',
      'USER SETTINGS',
      '-'.repeat(25),
      '    N/A',
    ].join('\n'));
  }

  // ── DOSKEY ────────────────────────────────────────────────────────────────
  doskey(args) {
    const a = args.trim();
    if (!a) return Result.ok('No macros defined. Use DOSKEY macroname=command');
    if (a.includes('=')) {
      const [name, ...rest] = a.split('=');
      this.env.set('DOSKEY_' + name.trim().toUpperCase(), rest.join('=').trim());
      return Result.ok('');
    }
    if (a.toUpperCase() === '/MACROS') {
      const macros = Object.entries(this.env.vars)
        .filter(([k]) => k.startsWith('DOSKEY_'))
        .map(([k,v]) => `${k.slice(7)}=${v}`);
      return Result.ok(macros.length ? macros.join('\n') : 'No macros defined.');
    }
    return Result.ok('');
  }

  // ── MODE ──────────────────────────────────────────────────────────────────
  mode(args) {
    const a = args.trim().toLowerCase();
    if (!a || a.includes('con')) {
      const cols = process.stdout.columns || 80;
      const rows = process.stdout.rows    || 25;
      return Result.ok([
        '',
        'Status for device CON:',
        '-'.repeat(25),
        `    Lines:          ${rows}`,
        `    Columns:        ${cols}`,
        `    Keyboard rate:  31`,
        `    Keyboard delay: 1`,
        `    Code page:      437`,
      ].join('\n'));
    }
    if (a.startsWith('con:cols=') || a.startsWith('con cols=')) {
      return Result.ok('');
    }
    return Result.ok('MODE: Device is not recognized.');
  }

  // ── DISKPART stub ─────────────────────────────────────────────────────────
  diskpart(args) {
    const { execSync } = require('child_process');
    try {
      let r;
      try { r = execSync('lsblk -o NAME,SIZE,TYPE,MOUNTPOINT 2>/dev/null', { encoding:'utf8' }); }
      catch { r = execSync('df -h 2>/dev/null', { encoding:'utf8' }); }
      return Result.ok([
        '',
        'Microsoft DiskPart version 10.0.19041.964',
        '',
        'Copyright (C) Microsoft Corporation.',
        'On computer: ' + require('os').hostname().toUpperCase(),
        '',
        '(Linux block device mapping)',
        r,
      ].join('\n'));
    } catch(e) { return Result.fail(e.message); }
  }

  // ── COMP ──────────────────────────────────────────────────────────────────
  comp(args) {
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    if (tokens.length < 2) return Result.fail('Usage: COMP file1 file2');
    const fs = require('fs');
    try {
      const a = fs.readFileSync(resolvePath(tokens[0]));
      const b = fs.readFileSync(resolvePath(tokens[1]));
      if (a.equals(b)) return Result.ok('Files compare OK');
      // Find first difference
      let pos = 0;
      while (pos < a.length && pos < b.length && a[pos] === b[pos]) pos++;
      return Result.ok([
        `Compare error at OFFSET ${pos.toString(16).toUpperCase()}`,
        `file1 = ${a[pos]?.toString(16).padStart(2,'0').toUpperCase() ?? 'EOF'}`,
        `file2 = ${b[pos]?.toString(16).padStart(2,'0').toUpperCase() ?? 'EOF'}`,
      ].join('\n'));
    } catch(e) { return Result.fail(e.message); }
  }

  // ── REPLACE ───────────────────────────────────────────────────────────────
  replace(args) {
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    if (tokens.length < 2) return Result.fail('Usage: REPLACE source destination');
    const fs = require('fs'), path = require('path');
    try {
      const src = resolvePath(tokens[0]);
      const dst = path.join(resolvePath(tokens[1]), path.basename(src));
      fs.copyFileSync(src, dst);
      return Result.ok(`Replacing ${tokens[0]}\n1 file(s) replaced.`);
    } catch(e) { return Result.fail(e.message); }
  }

  // ── CLIP ──────────────────────────────────────────────────────────────────
  clip(args, stdinData) {
    const { spawnSync } = require('child_process');
    const text = stdinData || args.trim();
    const cmds = ['xclip', 'xsel', 'wl-copy'];
    for (const cmd of cmds) {
      const r = spawnSync(cmd, cmd === 'xclip' ? ['-selection','clipboard'] : cmd === 'xsel' ? ['--clipboard','--input'] : [], {
        input: text, encoding:'utf8', stdio:['pipe','pipe','pipe']
      });
      if (r.status === 0) return Result.ok('');
    }
    return Result.fail('CLIP: xclip/xsel/wl-copy not found. Install with: apt install xclip');
  }

  // ── EXPAND ────────────────────────────────────────────────────────────────
  expand(args) {
    const { spawnSync } = require('child_process');
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    if (!tokens.length) return Result.fail('Usage: EXPAND source [destination]');
    const src = resolvePath(tokens[0]);
    const dst = tokens[1] ? resolvePath(tokens[1]) : '.';
    const ext = require('path').extname(src).toLowerCase();
    const cmds = {
      '.gz':  ['gunzip', '-k', src],
      '.bz2': ['bunzip2', '-k', src],
      '.zip': ['unzip', src, '-d', dst],
      '.cab': ['cabextract', '-d', dst, src],
    };
    const cmd = cmds[ext] || ['cp', src, dst];
    const r = spawnSync(cmd[0], cmd.slice(1), { encoding:'utf8' });
    return r.status === 0 ? Result.ok(`${src}: 1 file(s) expanded.`) : Result.fail(r.stderr||'Expansion failed.');
  }

  // ── SUBST ─────────────────────────────────────────────────────────────────
  subst(args) {
    const tokens = tokenise(args);
    if (!tokens.length) {
      const drives = Object.entries(this._substDrives||{}).map(([d,p])=>`${d}: => ${p}`);
      return Result.ok(drives.join('\n') || '(No substitutions active)');
    }
    if (tokens[0].toUpperCase() === '/D') {
      delete (this._substDrives||{})[tokens[1]];
      return Result.ok('');
    }
    const drive = tokens[0].replace(':','').toUpperCase();
    const path  = tokens[1] ? resolvePath(tokens[1]) : '';
    this._substDrives = this._substDrives || {};
    this._substDrives[drive] = path;
    return Result.ok(`${drive}: is now associated with ${path}`);
  }

  // ── PRINT ─────────────────────────────────────────────────────────────────
  print(args) {
    const { spawnSync } = require('child_process');
    const tokens = tokenise(args).filter(t => !t.startsWith('/'));
    if (!tokens.length) return Result.fail('Usage: PRINT [/D:device] filename');
    const file = resolvePath(tokens[0]);
    const r = spawnSync('lp', [file], { encoding:'utf8' });
    if (r.status === 0) return Result.ok(`${tokens[0]} is currently being printed`);
    return Result.fail('PRINT: lp not found or printer not available. Install with: apt install cups');
  }

  // ── MSG ───────────────────────────────────────────────────────────────────
  msg(args) {
    const { spawnSync } = require('child_process');
    const tokens  = tokenise(args);
    const target  = tokens[0] || '*';
    const message = tokens.slice(1).join(' ');
    const r = spawnSync('wall', [], { input: message, encoding:'utf8', stdio:['pipe','pipe','pipe'] });
    return r.status === 0
      ? Result.ok('')
      : Result.fail('MSG: wall command failed. Try: apt install sysvinit-utils');
  }

  // ── BREAK ─────────────────────────────────────────────────────────────────
  break(args) {
    return Result.ok('');  // No-op — BREAK is obsolete in modern CMD
  }

  // ── BCDEDIT stub ──────────────────────────────────────────────────────────
  bcdedit(args) {
    return Result.ok([
      '',
      'Windows Boot Manager',
      '--------------------',
      'identifier              {bootmgr}',
      'device                  partition=\\Device\\HarddiskVolume1',
      'description             Windows Boot Manager',
      'locale                  en-US',
      'default                 {current}',
      '',
      'Windows Boot Loader',
      '-------------------',
      'identifier              {current}',
      'device                  partition=C:',
      'path                    \\Windows\\system32\\winload.exe',
      'description             Windows 10',
      'osdevice                partition=C:',
      'systemroot              \\Windows',
      '',
      '(Note: This is a WinCMD-Kali emulation — running on Linux)',
    ].join('\n'));
  }

  // ── COMPACT stub ──────────────────────────────────────────────────────────
  compact(args) {
    return Result.ok([
      '',
      ' Listing C:\\',
      ' New files added to this directory will not be compressed.',
      '',
      '0 files within 1 directories were compressed.',
      '0 total bytes of data are stored in 0 bytes.',
      'The compression ratio is 1.0 to 1.',
    ].join('\n'));
  }

  // ── CONVERT stub ──────────────────────────────────────────────────────────
  convert(args) {
    return Result.ok([
      'The type of the file system is NTFS.',
      'CONVERT is not required. Volume is already NTFS.',
    ].join('\n'));
  }

  // ── NLTEST stub ───────────────────────────────────────────────────────────
  nltest(args) {
    const host = require('os').hostname().toUpperCase();
    return Result.ok([
      `I_NetLogonControl failed: Status = 1717 0x6b5 ERROR_UNKNOWN_PRODUCT`,
      `(Note: NLTEST is a domain tool — no domain controller in WinCMD-Kali)`,
      `Flags: 0`,
      `Connection Status = 0 0x0 NERR_Success`,
      `Trusted DC Name \\\\${host}`,
      `Trusted DC Connection Status Status = 0 0x0 NERR_Success`,
      `The command completed successfully`,
    ].join('\n'));
  }
}

module.exports = { CMDCommands, Result };
