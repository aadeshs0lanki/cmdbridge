# cmdbridge 🪟➡️🐉

> **Windows CMD Emulator running natively on Kali Linux**  
> Type Windows commands. Get Linux results.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/Tests-77%20passing-brightgreen)](#testing)
[![Platform](https://img.shields.io/badge/Platform-Linux-orange)](https://www.kali.org/)

---

## What Is This?

**cmdbridge** is a production-grade Windows CMD emulator that runs on **Kali Linux** (and any Linux/macOS system).  
You type real Windows CMD commands — it executes them natively on Linux.

**No Wine. No Windows. No VM.** Pure Node.js.

```
C:\Users\kali> dir /B
commands.js
environment.js
interpreter.js
pathUtils.js
repl.js

C:\Users\kali> ipconfig /all

Windows IP Configuration

Ethernet adapter eth0:
   Physical Address. . . . . . . . . : 00:11:22:33:44:55
   IPv4 Address. . . . . . . . . . . : 192.168.1.100
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : N/A

C:\Users\kali> systeminfo
Host Name:                 KALI
OS Name:                   Microsoft Windows 10 Pro (Emulated — Kali GNU/Linux)
OS Version:                10.0.19045 N/A Build 19045
...
```

---

## Why?

- **Penetration testers** who switch between Windows and Kali constantly
- **Students** learning Linux who know CMD better than bash  
- **Malware analysts** working with Windows artifacts on Linux  
- **CTF players** testing Windows-style command patterns  
- **Anyone** who wants one unified command-line experience

---

## Features

| Feature | Status |
|---|---|
| 40+ CMD built-in commands | ✅ |
| Windows-style path display (`C:\Users\kali`) | ✅ |
| Bidirectional path conversion | ✅ |
| `%VARIABLE%` expansion | ✅ |
| Output redirection (`>`, `>>`, `<`) | ✅ |
| Pipes (`cmd1 \| cmd2`) | ✅ |
| `&&`, `\|\|`, `&` logical operators | ✅ |
| `IF` / `IF NOT` / `IF EXIST` / `IF ERRORLEVEL` | ✅ |
| `FOR` loops (`IN`, `/L`, `/F`) | ✅ |
| `GOTO` / labels / `:EOF` | ✅ |
| `.bat` / `.cmd` batch file runner | ✅ |
| Tab completion (commands + filesystem) | ✅ |
| Persistent command history (`~/.wincmd_history`) | ✅ |
| `@ECHO OFF` / `@ECHO ON` | ✅ |
| `CALL` (batch + inline) | ✅ |
| External process passthrough | ✅ |
| Network commands (`ipconfig`, `ping`, `tracert`, `netstat`) | ✅ |
| Process management (`tasklist`, `taskkill`) | ✅ |
| File operations (`copy`, `xcopy`, `move`, `del`, `ren`) | ✅ |
| Directory operations (`dir`, `mkdir`, `rmdir`, `tree`) | ✅ |

---

## Quick Start

### Requirements
- Node.js ≥ 18.0.0
- Linux (Kali, Ubuntu, Debian, Arch, etc.) or macOS

### Install

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/cmdbridge.git
cd cmdbridge

# No npm install needed — zero dependencies!

# Make executable
chmod +x bin/wincmd.js
```

### Run

```bash
# Interactive CMD shell
node bin/wincmd.js

# OR make it a global command
npm link
wincmd
```

---

## Usage

### Interactive Shell

```bash
node bin/wincmd.js
```

```
Microsoft Windows [Version 10.0.19045.3996]
(c) Microsoft Corporation. All rights reserved.

cmdbridge v1.0.0 — Windows CMD Emulator running on Kali Linux
Type 'help' to list all available commands.

C:\Users\kali> _
```

### Run a Single Command

```bash
node bin/wincmd.js /C "dir /b"
node bin/wincmd.js /C "ipconfig /all"
node bin/wincmd.js /C "tasklist"
node bin/wincmd.js /C "systeminfo"
```

### Run a Batch File

```bash
node bin/wincmd.js myscript.bat
node bin/wincmd.js examples/demo.bat
```

### Run Command Then Stay in Shell

```bash
node bin/wincmd.js /K "echo Welcome to cmdbridge"
```

### Skip Banner

```bash
node bin/wincmd.js --no-banner
```

---

## Supported Commands

### File System
| CMD Command | What It Does |
|---|---|
| `dir [path] [/B] [/A] [/W]` | List directory contents |
| `cd [path]` | Change directory |
| `mkdir / md [path]` | Create directory (supports nested) |
| `rmdir / rd [/S] [/Q] [path]` | Remove directory |
| `copy [src] [dst]` | Copy file |
| `xcopy [src] [dst] [/S] [/E]` | Copy with subdirectories |
| `move [src] [dst]` | Move / rename |
| `del / erase [file]` | Delete file (supports wildcards) |
| `ren / rename [old] [new]` | Rename file |
| `type [file]` | Print file contents |
| `tree [path] [/F]` | Show folder structure |
| `attrib [path]` | Show file attributes |
| `fc [file1] [file2]` | Compare files |

### Text Processing
| CMD Command | What It Does |
|---|---|
| `find [/I] [/V] [/C] "pattern" [file]` | Search for text in files |
| `findstr [/I] [/R] [/V] "pattern" [file]` | Search with regex support |
| `sort [/R] [file]` | Sort lines |
| `more [file]` | Page through output |

### System Info
| CMD Command | What It Does |
|---|---|
| `systeminfo` | Full system information |
| `ver` | Windows version string |
| `whoami [/all]` | Current user |
| `hostname` | Computer name |
| `date` | Current date |
| `time` | Current time |
| `set [var[=val]]` | Get/set environment variables |
| `where [program]` | Find executable location |
| `path [value]` | Get/set PATH |

### Networking
| CMD Command | What It Does |
|---|---|
| `ipconfig [/all]` | Network interface info |
| `ping [-n count] [host]` | Ping a host |
| `tracert [host]` | Trace route to host |
| `netstat` | Active network connections |

### Process Management
| CMD Command | What It Does |
|---|---|
| `tasklist` | List running processes |
| `taskkill /PID [pid]` | Kill process by PID |
| `taskkill /IM [name] [/F]` | Kill process by name |

### Shell Flow
| CMD Command | What It Does |
|---|---|
| `echo [text]` | Print text |
| `cls` | Clear screen |
| `help [command]` | Show help |
| `exit` | Exit shell |
| `pause` | Wait for keypress |
| `title [text]` | Set window title |
| `pushd / popd` | Push/pop directory stack |
| `call [file/cmd]` | Call batch or command |

---

## Batch File Support

cmdbridge runs `.bat` and `.cmd` files with full support for:

```batch
@echo off
:: Comments work
SET MYVAR=Hello World
echo %MYVAR%

:: IF / ELSE
IF "%MYVAR%"=="Hello World" echo Match found!
IF EXIST output.txt echo File exists
IF NOT EXIST output.txt echo File missing
IF ERRORLEVEL 1 echo Error occurred

:: FOR loops
FOR %%I IN (one two three) DO echo %%I
FOR /L %%N IN (1,1,10) DO echo Step %%N
FOR /F %%L IN (myfile.txt) DO echo %%L

:: GOTO
GOTO myLabel
echo This is skipped
:myLabel
echo Jumped here!

:: Redirection
echo Hello > output.txt
echo World >> output.txt
TYPE output.txt | FIND "Hello"
```

---

## Path Conversion

cmdbridge automatically converts paths between Windows and Linux formats:

| Linux Path | Windows Path |
|---|---|
| `/home/kali` | `C:\Users\kali` |
| `/root` | `C:\Users\Administrator` |
| `/tmp` | `C:\Windows\Temp` |
| `/home/kali/Desktop` | `C:\Users\kali\Desktop` |

The prompt always shows the Windows-style path:
```
C:\Users\kali\projects\myapp>
```

---

## Testing

```bash
# Run all 77 tests
npm test

# Run with detailed output
npm run test:verbose
```

```
# tests 77
# pass 77
# fail 0
```

Tests cover: path conversion, all built-in commands, environment variable expansion, output redirection, append redirection, pipes, `&&`/`||` operators, `IF` conditions, `FOR` loops, GOTO, and full batch file execution.

---

## Architecture

```
cmdbridge/
├── bin/
│   └── wincmd.js          # CLI entry point (/C, /K, script.bat, REPL)
├── src/
│   ├── index.js           # Public API exports
│   ├── pathUtils.js       # Linux ↔ Windows path conversion
│   ├── environment.js     # CMD environment variables + %VAR% expansion
│   ├── commands.js        # All 40+ built-in CMD command implementations
│   ├── interpreter.js     # Parser: pipes, redirection, IF, FOR, GOTO, &&, ||
│   └── repl.js            # Interactive shell (readline, history, tab-complete)
├── tests/
│   └── wincmd.test.js     # 77 unit + integration tests (Node built-in test runner)
├── examples/
│   └── demo.bat           # Feature demonstration batch file
├── docs/
│   └── COMMANDS.md        # Full command reference
├── package.json
├── .gitignore
└── README.md
```

---

## Use as a Library

```javascript
const { CMDInterpreter, CMDEnvironment } = require('./src/index');

const env    = new CMDEnvironment();
const interp = new CMDInterpreter(env);

// Run a command
interp.execute('echo Hello from cmdbridge!');

// Run a batch file
interp.runBatch('/path/to/script.bat');

// Set variables
env.set('MY_VAR', 'hello');
console.log(env.expand('Value: %MY_VAR%'));
// → 'Value: hello'
```

---

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/new-command`
3. Run the tests: `npm test`
4. Commit: `git commit -m 'Add: support for NET USE command'`
5. Push: `git push origin feature/new-command`
6. Open a Pull Request

### Adding a New Command

1. Add implementation in `src/commands.js` as a method on `CMDCommands`
2. Register it in the `builtins` map in `src/interpreter.js`
3. Add it to the `CMD_LIST` array in `src/repl.js` for tab-completion
4. Add it to `help()` in `src/commands.js`
5. Write tests in `tests/wincmd.test.js`

---

## Known Differences from Real CMD

| Feature | Real CMD | cmdbridge |
|---|---|---|
| Registry (`reg query`) | ✅ | ❌ Not applicable |
| `net use` (network drives) | ✅ | ❌ Not applicable |
| Windows services (`sc`) | ✅ | ➡️ Maps to `systemctl` |
| `msiexec` | ✅ | ➡️ Maps to `apt install` |
| Drive letters (`D:\`) | ✅ | ✅ Mapped to Linux paths |
| ANSI color codes | ✅ | ✅ |
| Unicode support | ✅ | ✅ |

---

## License

MIT © cmdbridge Project

---

## Star History

If this project helped you, please ⭐ star it on GitHub!

```
   __        ___       ____ __  __ ____        _  __     _ _
   \ \      / (_)_ __ / ___|  \/  |  _ \      | |/ /__ _| (_)
    \ \ /\ / /| | '_ \ |   | |\/| | | | |_____| ' // _` | | |
     \ V  V / | | | | | |___| |  | | |_| |_____| . \ (_| | | |
      \_/\_/  |_|_| |_|\____|_|  |_|____/      |_|\_\__,_|_|_|

    Windows CMD  ──────────────────────────►  Kali Linux
```
