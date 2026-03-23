'use strict';
/**
 * environment.js
 * Manages CMD environment variables, ERRORLEVEL, %VAR% expansion
 */

const os   = require('os');
const { linuxToWin } = require('./pathUtils');

class CMDEnvironment {
  constructor() {
    const user = os.userInfo().username;
    const host = os.hostname().toUpperCase();

    // Start with real process env, then overlay Windows defaults
    this.vars = Object.assign({}, process.env);

    const defaults = {
      PATHEXT:                  '.COM;.EXE;.BAT;.CMD;.VBS;.JS;.WS;.MSC',
      COMSPEC:                  'C:\\Windows\\System32\\cmd.exe',
      SystemRoot:               'C:\\Windows',
      SystemDrive:              'C:',
      PROCESSOR_ARCHITECTURE:   'AMD64',
      OS:                       'Windows_NT',
      USERNAME:                 user,
      USERDOMAIN:               host,
      COMPUTERNAME:             host,
      USERPROFILE:              `C:\\Users\\${user}`,
      APPDATA:                  `C:\\Users\\${user}\\AppData\\Roaming`,
      LOCALAPPDATA:             `C:\\Users\\${user}\\AppData\\Local`,
      TEMP:                     'C:\\Windows\\Temp',
      TMP:                      'C:\\Windows\\Temp',
      WINDIR:                   'C:\\Windows',
      NUMBER_OF_PROCESSORS:     String(os.cpus().length),
      PROCESSOR_IDENTIFIER:     os.arch(),
    };

    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in this.vars)) this.vars[k] = v;
    }

    this.errorlevel = 0;
  }

  get(name) {
    return this.vars[name.toUpperCase()] ?? this.vars[name] ?? undefined;
  }

  set(name, value) {
    const key = name.toUpperCase();
    this.vars[key] = value;
    process.env[key] = value;
  }

  delete(name) {
    const key = name.toUpperCase();
    delete this.vars[key];
    delete process.env[key];
  }

  /**
   * Expand %VAR% style variables in a string.
   * Special dynamic vars: %ERRORLEVEL% %DATE% %TIME% %RANDOM% %CD%
   */
  expand(text) {
    return text.replace(/%([^%]*)%/g, (match, name) => {
      const upper = name.toUpperCase();
      if (upper === 'ERRORLEVEL') return String(this.errorlevel);
      if (upper === 'DATE') {
        const d = new Date();
        return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]} ${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
      }
      if (upper === 'TIME') {
        const d = new Date();
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(2,'0')}`;
      }
      if (upper === 'RANDOM') return String(Math.floor(Math.random() * 32768));
      if (upper === 'CD') return linuxToWin(process.cwd());
      return this.vars[upper] ?? this.vars[name] ?? match;
    });
  }

  /** List all vars in SET format */
  list(prefix) {
    const lines = [];
    const p = prefix ? prefix.toUpperCase() : '';
    for (const [k, v] of Object.entries(this.vars).sort()) {
      if (!p || k.toUpperCase().startsWith(p)) {
        lines.push(`${k}=${v}`);
      }
    }
    return lines.join('\n');
  }
}

module.exports = CMDEnvironment;
