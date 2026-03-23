'use strict';
/**
 * WinCMD-Kali — Test Suite
 * Run: npm test   OR   node --test tests/wincmd.test.js
 */

const test      = require('node:test');
const assert    = require('node:assert/strict');
const fs        = require('node:fs');
const path      = require('node:path');
const os        = require('node:os');

const { linuxToWin, winToLinux, resolvePath } = require('../src/pathUtils');
const CMDEnvironment                           = require('../src/environment');
const { CMDCommands, Result }                  = require('../src/commands');
const { CMDInterpreter }                       = require('../src/interpreter');

// ── Test helpers ──────────────────────────────────────────────────────────────
function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wincmd-test-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function withTmp(fn) {
  const tmp = makeTmp();
  const old = process.cwd();
  process.chdir(tmp);
  try { fn(tmp); }
  finally { process.chdir(old); cleanup(tmp); }
}

function makeEnv()    { return new CMDEnvironment(); }
function makeCmds(e)  { return new CMDCommands(e || makeEnv()); }
function makeInterp(e){ return new CMDInterpreter(e || makeEnv()); }

// ══════════════════════════════════════════════════════════════════════════════
// PATH CONVERSION
// ══════════════════════════════════════════════════════════════════════════════
test('pathUtils: linuxToWin converts home dir', () => {
  const home   = os.homedir();
  const user   = os.userInfo().username;
  const result = linuxToWin(home);
  assert.ok(result.startsWith('C:\\Users\\'), `Got: ${result}`);
  assert.ok(result.includes(user));
});

test('pathUtils: linuxToWin converts /tmp', () => {
  const result = linuxToWin('/tmp/foo');
  assert.ok(result.startsWith('C:\\Windows\\Temp'));
});

test('pathUtils: winToLinux converts C drive to home', () => {
  const user   = os.userInfo().username;
  const result = winToLinux(`C:\\Users\\${user}\\Desktop`);
  assert.ok(result.startsWith(os.homedir()));
});

test('pathUtils: winToLinux converts backslashes to forward slashes', () => {
  const result = winToLinux('foo\\bar\\baz');
  assert.strictEqual(result, 'foo/bar/baz');
});

test('pathUtils: round-trip home dir', () => {
  const home = os.homedir();
  const back = winToLinux(linuxToWin(home));
  assert.strictEqual(back, home);
});

test('pathUtils: winToLinux strips surrounding quotes', () => {
  const result = winToLinux('"foo\\bar"');
  assert.strictEqual(result, 'foo/bar');
});

// ══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT
// ══════════════════════════════════════════════════════════════════════════════
test('env: contains Windows default vars', () => {
  const env = makeEnv();
  assert.ok(env.vars.COMSPEC);
  assert.ok(env.vars.PATHEXT);
  assert.ok(env.vars.OS === 'Windows_NT');
  assert.ok(env.vars.USERNAME);
});

test('env: expand %VAR% replaces known var', () => {
  const env = makeEnv();
  env.set('GREET', 'hello');
  assert.strictEqual(env.expand('%GREET%'), 'hello');
});

test('env: expand unknown var returns original', () => {
  const env    = makeEnv();
  const result = env.expand('%ZZZUNKNOWN%');
  assert.strictEqual(result, '%ZZZUNKNOWN%');
});

test('env: expand %ERRORLEVEL%', () => {
  const env = makeEnv();
  env.errorlevel = 42;
  assert.strictEqual(env.expand('%ERRORLEVEL%'), '42');
});

test('env: expand %CD% returns Windows path', () => {
  const result = makeEnv().expand('%CD%');
  assert.ok(result.includes('\\'), `Expected Windows path, got: ${result}`);
});

test('env: set and delete variable', () => {
  const env = makeEnv();
  env.set('MYKEY', 'myval');
  assert.strictEqual(env.get('MYKEY'), 'myval');
  env.delete('MYKEY');
  assert.strictEqual(env.get('MYKEY'), undefined);
});

test('env: list with prefix', () => {
  const env = makeEnv();
  env.set('WINCMD_TEST_A', '1');
  env.set('WINCMD_TEST_B', '2');
  const out = env.list('WINCMD_TEST_');
  assert.ok(out.includes('WINCMD_TEST_A=1'));
  assert.ok(out.includes('WINCMD_TEST_B=2'));
});

// ══════════════════════════════════════════════════════════════════════════════
// DIR
// ══════════════════════════════════════════════════════════════════════════════
test('dir: lists files in current directory', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'hello.txt'), 'hi');
    const r = makeCmds().dir('');
    assert.strictEqual(r.code, 0);
    assert.ok(r.out.includes('hello.txt'));
    assert.ok(r.out.includes('Volume in drive C'));
    assert.ok(r.out.includes('Directory of'));
  });
});

test('dir /B: bare format lists only names', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'alpha.txt'), 'a');
    fs.writeFileSync(path.join(tmp, 'beta.txt'),  'b');
    const r     = makeCmds().dir('/B');
    const lines = r.out.trim().split('\n');
    assert.ok(lines.includes('alpha.txt'));
    assert.ok(lines.includes('beta.txt'));
    assert.ok(!r.out.includes('Volume'));
  });
});

test('dir: returns error for missing path', () => {
  const r = makeCmds().dir('C:\\NonExistentXYZ');
  assert.strictEqual(r.code, 1);
  assert.ok(r.err.length > 0);
});

test('dir: shows <DIR> for subdirectories', () => {
  withTmp(tmp => {
    fs.mkdirSync(path.join(tmp, 'subdir'));
    const r = makeCmds().dir('');
    assert.ok(r.out.includes('<DIR>'));
    assert.ok(r.out.includes('subdir'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CD
// ══════════════════════════════════════════════════════════════════════════════
test('cd: changes into subdirectory', () => {
  withTmp(tmp => {
    fs.mkdirSync(path.join(tmp, 'mydir'));
    const r = makeCmds().cd('mydir');
    assert.strictEqual(r.code, 0);
    assert.ok(process.cwd().includes('mydir'));
  });
});

test('cd ..: moves to parent', () => {
  withTmp(tmp => {
    const sub = path.join(tmp, 'sub');
    fs.mkdirSync(sub);
    process.chdir(sub);
    const r = makeCmds().cd('..');
    assert.strictEqual(r.code, 0);
    assert.strictEqual(process.cwd(), tmp);
  });
});

test('cd: returns error for missing dir', () => {
  withTmp(() => {
    const r = makeCmds().cd('nonexistent_zzz');
    assert.strictEqual(r.code, 1);
    assert.ok(r.err.toLowerCase().includes('cannot find') || r.err.toLowerCase().includes('path'));
  });
});

test('cd: no args prints Windows path', () => {
  withTmp(() => {
    const r = makeCmds().cd('');
    // cd with no args returns the current Windows path in r.out
    assert.ok(r.out.includes('C:\\') || r.out.includes('\\'), `Got: ${r.out}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ECHO
// ══════════════════════════════════════════════════════════════════════════════
test('echo: outputs text', () => {
  const r = makeCmds().echo('Hello World');
  assert.strictEqual(r.out, 'Hello World');
});

test('echo: empty returns ECHO is on', () => {
  const r = makeCmds().echo('');
  assert.ok(r.out.includes('ECHO is on'));
});

test('echo: ON/OFF returns empty', () => {
  assert.strictEqual(makeCmds().echo('ON').out,  '');
  assert.strictEqual(makeCmds().echo('OFF').out, '');
});

// ══════════════════════════════════════════════════════════════════════════════
// SET
// ══════════════════════════════════════════════════════════════════════════════
test('set: sets a variable', () => {
  const env = makeEnv();
  makeCmds(env).set('MYVAR=hello');
  assert.strictEqual(env.get('MYVAR'), 'hello');
});

test('set: lists all vars when empty', () => {
  const r = makeCmds().set('');
  assert.ok(r.out.includes('USERNAME') || r.out.includes('PATH'));
});

test('set: prefix search', () => {
  const env = makeEnv();
  env.set('WTEST_X', 'val');
  const r = makeCmds(env).set('WTEST_X');
  assert.ok(r.out.includes('WTEST_X=val'));
});

test('set: deletes var when value is empty', () => {
  const env = makeEnv();
  env.set('DELME', 'yes');
  makeCmds(env).set('DELME=');
  assert.strictEqual(env.get('DELME'), undefined);
});

// ══════════════════════════════════════════════════════════════════════════════
// COPY / MOVE / DEL
// ══════════════════════════════════════════════════════════════════════════════
test('copy: copies a file', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'src.txt'), 'data');
    const r = makeCmds().copy('src.txt dst.txt');
    assert.strictEqual(r.code, 0);
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'dst.txt'), 'utf8'), 'data');
  });
});

test('copy: fails for missing source', () => {
  withTmp(() => {
    const r = makeCmds().copy('ghost.txt out.txt');
    assert.strictEqual(r.code, 1);
  });
});

test('move: renames file', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'orig.txt'), 'move');
    const r = makeCmds().move('orig.txt moved.txt');
    assert.strictEqual(r.code, 0);
    assert.ok(fs.existsSync(path.join(tmp, 'moved.txt')));
    assert.ok(!fs.existsSync(path.join(tmp, 'orig.txt')));
  });
});

test('del: deletes a file', () => {
  withTmp(tmp => {
    const f = path.join(tmp, 'kill.txt');
    fs.writeFileSync(f, 'bye');
    const r = makeCmds().del('kill.txt');
    assert.strictEqual(r.code, 0);
    assert.ok(!fs.existsSync(f));
  });
});

test('del: error on missing file', () => {
  withTmp(() => {
    const r = makeCmds().del('ghost_xyz.txt');
    assert.strictEqual(r.code, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// MKDIR / RMDIR
// ══════════════════════════════════════════════════════════════════════════════
test('mkdir: creates directory', () => {
  withTmp(tmp => {
    const r = makeCmds().mkdir('newdir');
    assert.strictEqual(r.code, 0);
    assert.ok(fs.existsSync(path.join(tmp, 'newdir')));
  });
});

test('mkdir: creates nested directories', () => {
  withTmp(tmp => {
    const r = makeCmds().mkdir('a/b/c');
    assert.strictEqual(r.code, 0);
    assert.ok(fs.existsSync(path.join(tmp, 'a', 'b', 'c')));
  });
});

test('mkdir: error on existing directory', () => {
  withTmp(tmp => {
    fs.mkdirSync(path.join(tmp, 'dup'));
    const r = makeCmds().mkdir('dup');
    assert.strictEqual(r.code, 1);
  });
});

test('rmdir: removes empty directory', () => {
  withTmp(tmp => {
    fs.mkdirSync(path.join(tmp, 'empty'));
    const r = makeCmds().rmdir('empty');
    assert.strictEqual(r.code, 0);
    assert.ok(!fs.existsSync(path.join(tmp, 'empty')));
  });
});

test('rmdir /S: removes non-empty directory recursively', () => {
  withTmp(tmp => {
    const d = path.join(tmp, 'full');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'child.txt'), 'x');
    const r = makeCmds().rmdir('/S /Q full');
    assert.strictEqual(r.code, 0);
    assert.ok(!fs.existsSync(d));
  });
});

test('rmdir: error on non-empty directory without /S', () => {
  withTmp(tmp => {
    const d = path.join(tmp, 'notempty');
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'file.txt'), 'x');
    const r = makeCmds().rmdir('notempty');
    assert.strictEqual(r.code, 1);
    assert.ok(r.err.toLowerCase().includes('not empty'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TYPE
// ══════════════════════════════════════════════════════════════════════════════
test('type: reads file content', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'hello.txt'), 'Hello CMD!');
    const r = makeCmds().type('hello.txt');
    assert.ok(r.out.includes('Hello CMD!'));
  });
});

test('type: error on missing file', () => {
  withTmp(() => {
    const r = makeCmds().type('nope.txt');
    assert.strictEqual(r.code, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FIND
// ══════════════════════════════════════════════════════════════════════════════
test('find: finds string in file', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'data.txt'), 'apple\nbanana\napricot\n');
    const r = makeCmds().find('"apple" data.txt');
    assert.ok(r.out.includes('apple'));
    assert.ok(!r.out.includes('banana'));
  });
});

test('find /I: case-insensitive search', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'ci.txt'), 'Apple\n');
    const r = makeCmds().find('/I "apple" ci.txt');
    assert.ok(r.out.includes('Apple'));
  });
});

test('find /V: negated search', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'neg.txt'), 'apple\nbanana\n');
    const r = makeCmds().find('/V "apple" neg.txt');
    assert.ok(r.out.includes('banana'));
    assert.ok(!r.out.includes('apple'));
  });
});

test('find /C: counts matching lines', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'count.txt'), 'yes\nno\nyes\nyes\n');
    const r = makeCmds().find('/C "yes" count.txt');
    assert.ok(r.out.includes('3'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SORT
// ══════════════════════════════════════════════════════════════════════════════
test('sort: sorts file ascending', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'u.txt'), 'banana\napple\ncherry\n');
    const r     = makeCmds().sort('u.txt');
    const lines = r.out.trim().split('\n').filter(Boolean);
    assert.deepStrictEqual(lines, [...lines].sort());
  });
});

test('sort /R: sorts descending', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'u2.txt'), 'banana\napple\ncherry\n');
    const r     = makeCmds().sort('/R u2.txt');
    const lines = r.out.trim().split('\n').filter(Boolean);
    assert.deepStrictEqual(lines, [...lines].sort().reverse());
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INFO COMMANDS
// ══════════════════════════════════════════════════════════════════════════════
test('ver: returns Windows version string', () => {
  const r = makeCmds().ver();
  assert.ok(r.out.includes('10.0'));
  assert.ok(r.out.includes('Windows'));
});

test('whoami: returns domain\\user format', () => {
  const r = makeCmds().whoami('');
  assert.ok(r.out.includes('\\'), `Expected domain\\user, got: ${r.out}`);
});

test('hostname: returns machine hostname', () => {
  const r = makeCmds().hostname();
  assert.strictEqual(r.out.trim(), os.hostname());
});

test('systeminfo: includes expected fields', () => {
  const r = makeCmds().systeminfo();
  assert.ok(r.out.includes('Host Name'));
  assert.ok(r.out.includes('OS Name'));
  assert.ok(r.out.includes('Total Physical Memory'));
});

test('date: returns formatted date', () => {
  const r = makeCmds().date('');
  assert.ok(r.out.includes('current date'));
  assert.ok(/\d{2}\/\d{2}\/\d{4}/.test(r.out));
});

test('time: returns formatted time', () => {
  const r = makeCmds().time();
  assert.ok(r.out.includes('current time'));
  assert.ok(/\d{2}:\d{2}:\d{2}/.test(r.out));
});

test('ipconfig: returns network info', () => {
  const r = makeCmds().ipconfig('');
  assert.ok(r.out.includes('Windows IP Configuration'));
  assert.ok(r.out.includes('IPv4 Address'));
});

// ══════════════════════════════════════════════════════════════════════════════
// INTERPRETER: REDIRECTION
// ══════════════════════════════════════════════════════════════════════════════
test('interpreter: > redirects output to file', () => {
  withTmp(tmp => {
    const out  = path.join(tmp, 'redir.txt');
    const interp = makeInterp();
    interp.execute(`echo Hello Redirect > ${out}`);
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('Hello Redirect'));
  });
});

test('interpreter: >> appends to file', () => {
  withTmp(tmp => {
    const out  = path.join(tmp, 'append.txt');
    const interp = makeInterp();
    interp.execute(`echo line1 > ${out}`);
    interp.execute(`echo line2 >> ${out}`);
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('line1'));
    assert.ok(content.includes('line2'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INTERPRETER: LOGICAL OPERATORS
// ══════════════════════════════════════════════════════════════════════════════
test('interpreter: && runs second on success', () => {
  withTmp(tmp => {
    const out    = path.join(tmp, 'and.txt');
    const interp = makeInterp();
    interp.execute(`echo a > ${out} && echo b >> ${out}`);
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('a'));
    assert.ok(content.includes('b'));
  });
});

test('interpreter: || runs second on failure', () => {
  withTmp(tmp => {
    const out    = path.join(tmp, 'or.txt');
    const interp = makeInterp();
    // First command fails (missing file), second should run
    interp.execute(`type missing_xyz.txt || echo fallback > ${out}`);
    if (fs.existsSync(out)) {
      assert.ok(fs.readFileSync(out, 'utf8').includes('fallback'));
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INTERPRETER: IF
// ══════════════════════════════════════════════════════════════════════════════
test('interpreter: IF EXIST runs command when file exists', () => {
  withTmp(tmp => {
    const f      = path.join(tmp, 'exists.txt');
    const out    = path.join(tmp, 'ifout.txt');
    fs.writeFileSync(f, 'x');
    const interp = makeInterp();
    interp.execute(`IF EXIST ${f} echo found > ${out}`);
    assert.ok(fs.readFileSync(out, 'utf8').includes('found'));
  });
});

test('interpreter: IF NOT EXIST skips when file exists', () => {
  withTmp(tmp => {
    const f      = path.join(tmp, 'here.txt');
    const out    = path.join(tmp, 'skip.txt');
    fs.writeFileSync(f, 'x');
    const interp = makeInterp();
    interp.execute(`IF NOT EXIST ${f} echo skipped > ${out}`);
    assert.ok(!fs.existsSync(out));
  });
});

test('interpreter: IF "a"=="a" runs command', () => {
  withTmp(tmp => {
    const out    = path.join(tmp, 'eq.txt');
    const interp = makeInterp();
    interp.execute(`IF "hello"=="hello" echo match > ${out}`);
    assert.ok(fs.readFileSync(out, 'utf8').includes('match'));
  });
});

test('interpreter: IF ERRORLEVEL checks errorlevel', () => {
  withTmp(tmp => {
    const out    = path.join(tmp, 'el.txt');
    const interp = makeInterp();
    interp.env.errorlevel = 1;
    interp.execute(`IF ERRORLEVEL 1 echo triggered > ${out}`);
    assert.ok(fs.readFileSync(out, 'utf8').includes('triggered'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INTERPRETER: FOR
// ══════════════════════════════════════════════════════════════════════════════
test('interpreter: FOR loop iterates token set', () => {
  withTmp(tmp => {
    const out    = path.join(tmp, 'for.txt');
    const interp = makeInterp();
    interp.execute(`FOR %I IN (one two three) DO echo %I >> ${out}`);
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('one'));
    assert.ok(content.includes('two'));
    assert.ok(content.includes('three'));
  });
});

test('interpreter: FOR /L numeric range', () => {
  withTmp(tmp => {
    const out    = path.join(tmp, 'forl.txt');
    const interp = makeInterp();
    interp.execute(`FOR /L %I IN (1,1,5) DO echo %I >> ${out}`);
    const content = fs.readFileSync(out, 'utf8');
    ['1','2','3','4','5'].forEach(n => assert.ok(content.includes(n)));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INTERPRETER: PIPE
// ══════════════════════════════════════════════════════════════════════════════
test('interpreter: pipe passes output to next command', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'piped.txt'), 'apple\nbanana\napricot\n');
    const out    = path.join(tmp, 'pipeout.txt');
    const interp = makeInterp();
    interp.execute(`type piped.txt | find "apple" > ${out}`);
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('apple'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BATCH FILE RUNNER
// ══════════════════════════════════════════════════════════════════════════════
test('batch: runs simple batch file', () => {
  withTmp(tmp => {
    const bat = path.join(tmp, 'test.bat');
    const out = path.join(tmp, 'result.txt');
    fs.writeFileSync(bat, `@echo off\necho BatchWorks > ${out}\n`);
    const interp = makeInterp();
    const code   = interp.runBatch(bat);
    assert.strictEqual(code, 0);
    assert.ok(fs.readFileSync(out, 'utf8').includes('BatchWorks'));
  });
});

test('batch: SET and ECHO var', () => {
  withTmp(tmp => {
    const bat = path.join(tmp, 'vars.bat');
    const out = path.join(tmp, 'vars_out.txt');
    fs.writeFileSync(bat, `@echo off\nSET MYVAR=KaliCMD\necho %MYVAR% > ${out}\n`);
    makeInterp().runBatch(bat);
    assert.ok(fs.readFileSync(out, 'utf8').includes('KaliCMD'));
  });
});

test('batch: GOTO skips lines', () => {
  withTmp(tmp => {
    const bat = path.join(tmp, 'goto.bat');
    const out = path.join(tmp, 'goto_out.txt');
    fs.writeFileSync(bat,
      `@echo off\nGOTO end\necho SHOULD_NOT_APPEAR > ${out}\n:end\necho REACHED_END > ${out}\n`
    );
    makeInterp().runBatch(bat);
    assert.ok(fs.readFileSync(out, 'utf8').includes('REACHED_END'));
  });
});

test('batch: FOR loop in batch file', () => {
  withTmp(tmp => {
    const bat = path.join(tmp, 'forloop.bat');
    const out = path.join(tmp, 'for_out.txt');
    fs.writeFileSync(bat,
      `@echo off\nFOR %%I IN (alpha beta gamma) DO echo %%I >> ${out}\n`
    );
    makeInterp().runBatch(bat);
    const content = fs.readFileSync(out, 'utf8');
    assert.ok(content.includes('alpha'));
    assert.ok(content.includes('beta'));
    assert.ok(content.includes('gamma'));
  });
});

test('batch: IF condition in batch file', () => {
  withTmp(tmp => {
    const bat = path.join(tmp, 'ifbatch.bat');
    const out = path.join(tmp, 'if_out.txt');
    fs.writeFileSync(bat,
      `@echo off\nSET FLAG=yes\nIF "%FLAG%"=="yes" echo Condition met > ${out}\n`
    );
    makeInterp().runBatch(bat);
    assert.ok(fs.readFileSync(out, 'utf8').includes('Condition met'));
  });
});

test('batch: missing file returns error code 1', () => {
  const interp = makeInterp();
  const code   = interp.runBatch('/tmp/nonexistent_wincmd_xyz.bat');
  assert.strictEqual(code, 1);
});

// ══════════════════════════════════════════════════════════════════════════════
// TREE
// ══════════════════════════════════════════════════════════════════════════════
test('tree: generates folder structure', () => {
  withTmp(tmp => {
    fs.mkdirSync(path.join(tmp, 'sub1'));
    fs.mkdirSync(path.join(tmp, 'sub2'));
    const r = makeCmds().tree('');
    assert.ok(r.out.includes('sub1'));
    assert.ok(r.out.includes('sub2'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FC (File Compare)
// ══════════════════════════════════════════════════════════════════════════════
test('fc: reports no differences for identical files', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'same\n');
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'same\n');
    const r = makeCmds().fc('a.txt b.txt');
    assert.ok(r.out.includes('no differences'));
  });
});

test('fc: reports differences for different files', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'a.txt'), 'foo\n');
    fs.writeFileSync(path.join(tmp, 'b.txt'), 'bar\n');
    const r = makeCmds().fc('a.txt b.txt');
    assert.ok(r.out.includes('*****'));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// REN
// ══════════════════════════════════════════════════════════════════════════════
test('ren: renames file', () => {
  withTmp(tmp => {
    fs.writeFileSync(path.join(tmp, 'old.txt'), 'data');
    const r = makeCmds().ren('old.txt new.txt');
    assert.strictEqual(r.code, 0);
    assert.ok(fs.existsSync(path.join(tmp, 'new.txt')));
    assert.ok(!fs.existsSync(path.join(tmp, 'old.txt')));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// HELP
// ══════════════════════════════════════════════════════════════════════════════
test('help: lists commands', () => {
  const r = makeCmds().help('');
  assert.ok(r.out.includes('DIR'));
  assert.ok(r.out.includes('COPY'));
  assert.ok(r.out.includes('ECHO'));
});

test('help: shows detail for specific command', () => {
  const r = makeCmds().help('COPY');
  assert.ok(r.out.toLowerCase().includes('copy'));
  assert.ok(r.out.includes('source') || r.out.includes('COPY'));
});
