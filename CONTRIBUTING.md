# Contributing to WinCMD-Kali

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/wincmd-kali.git
cd wincmd-kali
node --version   # Must be >= 18.0.0
npm test         # All 77 tests must pass
```

## Project Structure

```
src/
├── pathUtils.js      Windows ↔ Linux path conversion
├── environment.js    Environment variables + %VAR% expansion
├── commands.js       All built-in CMD command implementations
├── interpreter.js    Command parser (pipes, redirection, IF, FOR, GOTO)
└── repl.js           Interactive shell (readline, history, autocomplete)
```

## Adding a New Command

### 1. Implement in `src/commands.js`

Add a method to the `CMDCommands` class:

```javascript
// Example: implementing the 'color' command
color(args) {
  // args = everything after 'color'
  const code = args.trim();
  if (!code) return Result.ok(''); // reset
  // ... implementation
  return Result.ok('');   // success
  // return Result.fail('Error message', 1);  // failure
}
```

Every command returns a `Result`:
- `Result.ok('output text')` — success
- `Result.fail('error message', exitCode)` — failure

### 2. Register in `src/interpreter.js`

In the `builtins` object inside `_dispatch()`:

```javascript
color: () => this.cmds.color(args),
```

### 3. Add tab completion in `src/repl.js`

```javascript
const CMD_LIST = [
  // ... existing commands ...
  'color',  // add your command here
];
```

### 4. Add to `help()` in `src/commands.js`

```javascript
// In the cmds array inside help():
['COLOR', 'Sets the default console foreground and background colors.'],
```

### 5. Write tests in `tests/wincmd.test.js`

```javascript
test('color: sets color code', () => {
  withTmp(() => {
    const r = makeCmds().color('0A');
    assert.strictEqual(r.code, 0);
  });
});
```

## Code Style

- Use `'use strict'` at the top of every file
- `const` and `let` — never `var`
- 2-space indentation
- Single quotes for strings
- Semicolons at end of statements
- Descriptive variable names

## Testing

```bash
# Run all tests
npm test

# Run with detailed output
npm run test:verbose

# Run a single test file
node --test tests/wincmd.test.js
```

All 77 tests must pass before submitting a PR.

## Pull Request Checklist

- [ ] Tests pass (`npm test`)
- [ ] New command has tests
- [ ] New command added to `help()` output
- [ ] New command added to tab completion list
- [ ] README updated if needed
- [ ] No new dependencies added

## Reporting Issues

Please include:
1. Your OS and Node.js version (`node --version`)
2. The command that caused the issue
3. Expected behaviour
4. Actual behaviour / error message

## Ideas for Contributions

- `net user` — user account management
- `reg` — registry emulation (mapped to Linux config files)  
- `sc` — service control (mapped to systemctl)
- `icacls` — file permissions (mapped to chmod/chown)
- `cipher` — encryption (mapped to gpg/openssl)
- `diskpart` — disk management (mapped to fdisk/lsblk)
- `wmic` — WMI queries emulation
- PowerShell passthrough mode
- Windows line ending normalisation (CRLF)
- Colour themes matching Windows CMD colour codes
