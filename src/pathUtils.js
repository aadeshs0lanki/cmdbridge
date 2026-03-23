'use strict';
/**
 * pathUtils.js
 * Bidirectional Windows ↔ Linux path conversion
 */

const os   = require('os');
const path = require('path');

const HOME = os.homedir();
const USER = os.userInfo().username;

/**
 * Convert a Linux path to a Windows-style path
 * e.g. /home/kali/docs  →  C:\Users\kali\docs
 */
function linuxToWin(lpath) {
  if (!lpath) return 'C:\\';
  let w = lpath;

  if (w.startsWith(HOME)) {
    w = w.replace(HOME, `C:\\Users\\${USER}`);
  } else if (w.startsWith('/root')) {
    w = w.replace('/root', 'C:\\Users\\Administrator');
  } else if (w.startsWith('/tmp')) {
    w = w.replace('/tmp', 'C:\\Windows\\Temp');
  } else if (w.startsWith('/')) {
    w = 'C:' + w;
  }

  // Replace all forward slashes with backslashes
  w = w.replace(/\//g, '\\');

  // Ensure starts with drive letter
  if (!/^[A-Za-z]:/.test(w)) {
    w = 'C:\\' + w.replace(/^\\+/, '');
  }
  return w;
}

/**
 * Convert a Windows-style path to a Linux path
 * e.g. C:\Users\kali\docs  →  /home/kali/docs
 */
function winToLinux(wpath) {
  if (!wpath) return '.';
  // Strip surrounding quotes
  wpath = wpath.replace(/^["']|["']$/g, '');

  if (/^[A-Za-z]:[/\\]/.test(wpath)) {
    let p = wpath.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/');

    if (p.startsWith(`/Users/${USER}`)) {
      p = p.replace(`/Users/${USER}`, HOME);
    } else if (p.startsWith('/Users/Administrator')) {
      p = p.replace('/Users/Administrator', '/root');
    } else if (p.startsWith('/Windows/Temp')) {
      p = p.replace('/Windows/Temp', '/tmp');
    } else {
      // Generic C:\ → keep as-is under root
      p = p;
    }
    return p;
  }

  // Pure backslash path (no drive letter)
  if (wpath.includes('\\')) {
    return wpath.replace(/\\/g, '/');
  }

  return wpath;
}

/**
 * Normalise a path argument from user input:
 * - Handles quoted paths
 * - Converts Windows separators to Linux
 * - Resolves relative to cwd
 */
function resolvePath(input, cwd) {
  cwd = cwd || process.cwd();
  if (!input) return cwd;

  const linux = winToLinux(input.trim());
  if (path.isAbsolute(linux)) return linux;
  return path.resolve(cwd, linux);
}

module.exports = { linuxToWin, winToLinux, resolvePath };
