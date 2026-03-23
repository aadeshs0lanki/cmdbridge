# Changelog

All notable changes to WinCMD-Kali are documented here.

## [1.1.0] - 2024-01-02

### Added
- 47 new commands: assoc, bcdedit, break, cacls, chcp, chkdsk, cipher, clip,
  color, comp, compact, convert, diskpart, doskey, driverquery, endlocal, expand,
  ftype, gpresult, icacls, label, mklink, mode, msg, net, netsh, nltest, openfiles,
  print, prompt, reg, replace, robocopy, runas, sc, schtasks, setlocal, setx, sfc,
  shutdown, start, subst, takeown, timeout, vol, wmic
- Authentic Windows CMD GUI (wincmd-gui.js) using xterm.js — black terminal, blue titlebar
- .desktop files for Kali Linux application menu integration
- install.sh — one-command system installer with desktop shortcut creation
- Tab completion expanded to cover all 87 commands

## [1.0.0] - 2024-01-01

### Added
- Initial production release
- 40+ Windows CMD built-in commands
- Bidirectional Windows ↔ Linux path conversion
- `%VARIABLE%` expansion with special vars (`%CD%`, `%DATE%`, `%TIME%`, `%RANDOM%`, `%ERRORLEVEL%`)
- Output redirection (`>`, `>>`, `<`)
- Pipe support (`cmd1 | cmd2`)
- Logical operators (`&&`, `||`, `&`)
- `IF` / `IF NOT` / `IF EXIST` / `IF ERRORLEVEL` / string comparison
- `FOR` loops: token sets, `/L` numeric ranges, `/F` file iteration
- `GOTO` / label / `:EOF` support
- `.bat` / `.cmd` batch file runner with full feature support
- `@ECHO OFF` / `@ECHO ON` in batch files
- `CALL` for calling batch files and inline commands
- `PUSHD` / `POPD` directory stack
- `SET /A` arithmetic expressions
- Interactive REPL with tab completion
- Persistent command history (`~/.wincmd_history`)
- CLI flags: `/C` (run and exit), `/K` (run and stay), `--no-banner`, `--version`
- 77 unit and integration tests (zero dependencies — uses Node.js built-in test runner)
- Zero runtime dependencies

### Commands Implemented
`attrib`, `call`, `cd`, `chdir`, `cls`, `color`, `copy`, `date`, `del`, `dir`,
`echo`, `erase`, `exit`, `fc`, `find`, `findstr`, `for`, `help`, `hostname`,
`if`, `ipconfig`, `md`, `mkdir`, `more`, `move`, `netstat`, `path`, `pause`,
`ping`, `popd`, `pushd`, `rd`, `rem`, `ren`, `rename`, `rmdir`, `set`, `sort`,
`systeminfo`, `taskkill`, `tasklist`, `time`, `title`, `tracert`, `tree`,
`type`, `ver`, `whoami`, `where`, `xcopy`
