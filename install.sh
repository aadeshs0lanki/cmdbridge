#!/bin/bash
# ============================================================
# WinCMD-Kali Installer for Kali Linux / Debian / Ubuntu
# Native terminal application — NO browser, NO Electron
#
# Usage:
#   sudo bash install.sh            full install
#   sudo bash install.sh --remove   uninstall everything
# ============================================================

set -e

RED='\033[0;31m';   GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m';  WHITE='\033[1;37m'; GRAY='\033[0;90m'; NC='\033[0m'

INSTALL_DIR="/opt/wincmd-kali"
CLI_LINK="/usr/local/bin/wincmd"
GUI_LINK="/usr/local/bin/wincmd-gui"
DESKTOP_DIR="/usr/share/applications"
ICON_DIR="/usr/share/pixmaps"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─────────────────────────────────────────────────────────────
banner() {
  echo -e "${WHITE}"
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║         WinCMD-Kali  Installer  v1.1.0              ║"
  echo "  ║   Windows CMD Emulator — 100% Native Linux App       ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

check_root() {
  if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root:  sudo bash install.sh${NC}"
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────
do_remove() {
  echo -e "${YELLOW}Removing WinCMD-Kali...${NC}"
  rm -rf  "$INSTALL_DIR"
  rm -f   "$CLI_LINK" "$GUI_LINK"
  rm -f   "$DESKTOP_DIR/wincmd-kali.desktop" "$DESKTOP_DIR/wincmd-kali-gui.desktop"
  rm -f   "$ICON_DIR/wincmd-kali.png" "$ICON_DIR/wincmd-kali.xpm"
  for UHOME in /home/* /root; do
    [ -d "$UHOME/Desktop" ] && rm -f \
      "$UHOME/Desktop/wincmd-kali.desktop" \
      "$UHOME/Desktop/wincmd-kali-gui.desktop" 2>/dev/null
    BASHRC="$UHOME/.bashrc"
    if [ -f "$BASHRC" ]; then
      sed -i '/# WinCMD-Kali/d' "$BASHRC"
      sed -i '/alias wincmd/d' "$BASHRC"
    fi
  done
  command -v update-desktop-database &>/dev/null && \
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  echo -e "${GREEN}✓ WinCMD-Kali removed successfully.${NC}"
  exit 0
}

[[ "$1" == "--remove" || "$1" == "-r" || "$1" == "--uninstall" ]] && { check_root; do_remove; }

# ─────────────────────────────────────────────────────────────
banner
check_root

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(getent passwd "$REAL_USER" 2>/dev/null | cut -d: -f6 || echo /root)"
echo -e "${CYAN}Installing for user: ${REAL_USER}  (${REAL_HOME})${NC}\n"

# ── STEP 1: Node.js ──────────────────────────────────────────
step=1
echo -e "${WHITE}[$step/7] Node.js${NC}"
if command -v node &>/dev/null; then
  NVER=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
  if [ "$NVER" -ge 18 ]; then
    echo -e "${GREEN}  ✓ $(node --version)${NC}"
  else
    echo -e "${YELLOW}  v$NVER too old — installing Node 20...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y nodejs 2>/dev/null | grep -E "^(Inst|Setting)" | tail -3
    echo -e "${GREEN}  ✓ $(node --version)${NC}"
  fi
else
  echo -e "${YELLOW}  Not found — installing...${NC}"
  if apt-cache show nodejs &>/dev/null; then
    apt-get install -y nodejs 2>/dev/null | grep -E "^(Inst|Setting)" | tail -3
  else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y nodejs 2>/dev/null | grep -E "^(Inst|Setting)" | tail -3
  fi
  echo -e "${GREEN}  ✓ $(node --version)${NC}"
fi

# ── STEP 2: xterm ────────────────────────────────────────────
((step++))
echo -e "${WHITE}[$step/7] xterm (native terminal)${NC}"
if ! command -v xterm &>/dev/null; then
  echo -e "${YELLOW}  Installing xterm...${NC}"
  apt-get install -y xterm 2>/dev/null | grep -E "^(Inst|Setting)" | tail -3
fi
echo -e "${GREEN}  ✓ xterm ready${NC}"

# Better fonts for Windows CMD look
echo -e "${GRAY}  Installing Consolas-compatible fonts...${NC}"
apt-get install -y fonts-dejavu fonts-liberation 2>/dev/null | grep -E "^(Inst|Setting)" | tail -2
fc-cache -f 2>/dev/null || true
echo -e "${GREEN}  ✓ Fonts ready${NC}"

# ── STEP 3: Install files ─────────────────────────────────────
((step++))
echo -e "${WHITE}[$step/7] Installing to $INSTALL_DIR${NC}"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

for d in src bin assets examples docs tests; do
  [ -d "$SCRIPT_DIR/$d" ] && cp -r "$SCRIPT_DIR/$d" "$INSTALL_DIR/"
done
for f in package.json README.md CHANGELOG.md CONTRIBUTING.md LICENSE install.sh; do
  [ -f "$SCRIPT_DIR/$f" ] && cp "$SCRIPT_DIR/$f" "$INSTALL_DIR/"
done

chmod +x "$INSTALL_DIR/bin/wincmd.js"
chmod +x "$INSTALL_DIR/bin/wincmd-native.sh"
chmod +x "$INSTALL_DIR/install.sh"
echo -e "${GREEN}  ✓ Files installed${NC}"

# ── STEP 4: Icon ─────────────────────────────────────────────
((step++))
echo -e "${WHITE}[$step/7] Application icon${NC}"
mkdir -p "$ICON_DIR"

python3 - << 'PYEOF'
import struct, zlib

def png_chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xffffffff
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

W, H = 48, 48
BK = (0,0,0); NV = (0,0,128); GR = (192,192,192); DG = (64,64,64); GN = (0,200,0)

rows = []
for y in range(H):
    row = []
    for x in range(W):
        if y < 2 or y >= H-2 or x < 2 or x >= W-2:
            row.append(NV)           # navy border
        elif y < 5 or y > H-6:
            row.append(NV)           # navy titlebar / bottom
        elif 4 <= y <= H-5 and 4 <= x <= W-5:
            row.append(BK)           # black terminal area
        else:
            row.append(DG)
    rows.append(row)

# White text simulation (horizontal bars = "text lines")
for line_y in [12, 18, 24, 30]:
    if line_y < H:
        for x in range(7, 38):
            rows[line_y][x] = GR

# Green cursor block
for y in range(34, 38):
    for x in range(7, 11):
        rows[y][x] = GN

raw = b''
for row in rows:
    raw += b'\x00' + b''.join(bytes(p) for p in row)

data  = png_chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
data += png_chunk(b'IDAT', zlib.compress(raw, 9))
data += png_chunk(b'IEND', b'')

with open('/usr/share/pixmaps/wincmd-kali.png', 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + data)
print('  Icon created')
PYEOF

echo -e "${GREEN}  ✓ Icon ready${NC}"

# ── STEP 5: xterm Xresources (Windows CMD theme) ─────────────
((step++))
echo -e "${WHITE}[$step/7] Configuring xterm Windows CMD theme${NC}"

mkdir -p /etc/wincmd-kali
cat > /etc/wincmd-kali/WinCMD.Xresources << 'XRES'
! WinCMD-Kali — Windows CMD exact theme for xterm
WinCMD.background:        #000000
WinCMD.foreground:        #C0C0C0
WinCMD.cursorColor:       #C0C0C0
WinCMD.color0:    #000000
WinCMD.color1:    #800000
WinCMD.color2:    #008000
WinCMD.color3:    #808000
WinCMD.color4:    #000080
WinCMD.color5:    #800080
WinCMD.color6:    #008080
WinCMD.color7:    #C0C0C0
WinCMD.color8:    #808080
WinCMD.color9:    #FF0000
WinCMD.color10:   #00FF00
WinCMD.color11:   #FFFF00
WinCMD.color12:   #0000FF
WinCMD.color13:   #FF00FF
WinCMD.color14:   #00FFFF
WinCMD.color15:   #FFFFFF
WinCMD.faceName:         Consolas,Monospace,DejaVu Sans Mono
WinCMD.faceSize:         11
WinCMD.geometry:         80x25
WinCMD.scrollBar:        true
WinCMD.rightScrollBar:   true
WinCMD.saveLines:        3000
WinCMD.cursorBlink:      true
WinCMD.selectBackground: #000080
WinCMD.selectForeground: #FFFFFF
WinCMD.borderWidth:      1
WinCMD.internalBorder:   2
WinCMD.allowBoldFonts:   true
XRES

# Merge into user Xresources so it applies at login
XRFILE="$REAL_HOME/.Xresources"
touch "$XRFILE" 2>/dev/null || true
if ! grep -q "WinCMD-Kali" "$XRFILE" 2>/dev/null; then
  { echo ""; echo "! WinCMD-Kali theme"; cat /etc/wincmd-kali/WinCMD.Xresources; } >> "$XRFILE"
  chown "$REAL_USER:$REAL_USER" "$XRFILE" 2>/dev/null || true
fi

# Apply immediately if display is available
[ -n "$DISPLAY" ] && sudo -u "$REAL_USER" xrdb -merge /etc/wincmd-kali/WinCMD.Xresources 2>/dev/null || true

echo -e "${GREEN}  ✓ xterm theme configured (Windows CMD colors)${NC}"

# ── STEP 6: Commands ─────────────────────────────────────────
((step++))
echo -e "${WHITE}[$step/7] Creating system commands${NC}"

# wincmd — terminal mode (current terminal)
cat > "$CLI_LINK" << 'EOF'
#!/bin/bash
exec node /opt/wincmd-kali/bin/wincmd.js "$@"
EOF
chmod +x "$CLI_LINK"

# wincmd-gui — opens a native styled xterm window
cat > "$GUI_LINK" << 'EOF'
#!/bin/bash
exec /opt/wincmd-kali/bin/wincmd-native.sh "$@"
EOF
chmod +x "$GUI_LINK"

# Add aliases to user bashrc
BASHRC="$REAL_HOME/.bashrc"
if ! grep -q "WinCMD-Kali" "$BASHRC" 2>/dev/null; then
  cat >> "$BASHRC" << 'BEOF'

# WinCMD-Kali — Windows CMD Emulator
alias wincmd='node /opt/wincmd-kali/bin/wincmd.js'
alias wincmd-gui='/opt/wincmd-kali/bin/wincmd-native.sh'
BEOF
  chown "$REAL_USER:$REAL_USER" "$BASHRC" 2>/dev/null || true
fi

echo -e "${GREEN}  ✓ wincmd      (terminal mode — run in current terminal)${NC}"
echo -e "${GREEN}  ✓ wincmd-gui  (window mode  — opens native CMD window)${NC}"

# ── STEP 7: Desktop shortcuts ─────────────────────────────────
((step++))
echo -e "${WHITE}[$step/7] Desktop shortcuts${NC}"

ICON_PATH="$ICON_DIR/wincmd-kali.png"
[ ! -f "$ICON_PATH" ] && ICON_PATH="utilities-terminal"

# Terminal mode (.desktop with Terminal=true)
cat > "$DESKTOP_DIR/wincmd-kali.desktop" << DEOF
[Desktop Entry]
Version=1.0
Type=Application
Name=WinCMD-Kali
GenericName=Windows CMD Emulator
Comment=Windows Command Prompt Emulator running natively on Kali Linux
Exec=wincmd
Icon=$ICON_PATH
Terminal=true
StartupNotify=false
Categories=System;TerminalEmulator;Security;
Keywords=cmd;windows;terminal;kali;pentesting;
MimeType=application/x-bat;text/x-batch;
Actions=OpenWindow;

[Desktop Action OpenWindow]
Name=Open in CMD Window
Exec=wincmd-gui
DEOF

# Window mode (.desktop with Terminal=false — opens xterm)
cat > "$DESKTOP_DIR/wincmd-kali-gui.desktop" << DEOF
[Desktop Entry]
Version=1.0
Type=Application
Name=WinCMD-Kali Window
GenericName=Windows CMD — Styled Window
Comment=Windows CMD Emulator in a native Windows-styled terminal window
Exec=wincmd-gui
Icon=$ICON_PATH
Terminal=false
StartupNotify=true
Categories=System;TerminalEmulator;Security;
Keywords=cmd;windows;native;kali;
DEOF

chmod 644 "$DESKTOP_DIR/wincmd-kali.desktop" "$DESKTOP_DIR/wincmd-kali-gui.desktop"
command -v update-desktop-database &>/dev/null && \
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

# Copy to user Desktop
if [ -d "$REAL_HOME/Desktop" ]; then
  cp "$DESKTOP_DIR/wincmd-kali.desktop"     "$REAL_HOME/Desktop/"
  cp "$DESKTOP_DIR/wincmd-kali-gui.desktop" "$REAL_HOME/Desktop/"
  chown "$REAL_USER:$REAL_USER" \
    "$REAL_HOME/Desktop/wincmd-kali.desktop" \
    "$REAL_HOME/Desktop/wincmd-kali-gui.desktop"
  chmod +x \
    "$REAL_HOME/Desktop/wincmd-kali.desktop" \
    "$REAL_HOME/Desktop/wincmd-kali-gui.desktop"
  echo -e "${GREEN}  ✓ Desktop shortcuts created${NC}"
fi
echo -e "${GREEN}  ✓ Applications menu entry added${NC}"

# ── Tests ─────────────────────────────────────────────────────
echo ""
echo -e "${WHITE}Running tests...${NC}"
cd "$INSTALL_DIR"
TRESULT=$(node --test tests/wincmd.test.js 2>&1)
TPASS=$(echo "$TRESULT" | grep "# pass" | awk '{print $3}')
TFAIL=$(echo "$TRESULT" | grep "# fail" | awk '{print $3}')

if [ "${TFAIL:-1}" = "0" ]; then
  echo -e "${GREEN}  ✓ All ${TPASS} tests passed${NC}"
else
  echo -e "${YELLOW}  ⚠ ${TPASS} passed, ${TFAIL} failed${NC}"
fi

# Smoke test key commands
for cmd in "ver" "whoami" "dir /b" "ipconfig" "vol"; do
  OUT=$(node "$INSTALL_DIR/bin/wincmd.js" /C "$cmd" 2>/dev/null | head -1 | tr -d '\r\n')
  [ -n "$OUT" ] \
    && echo -e "${GREEN}  ✓ $cmd${NC}" \
    || echo -e "${RED}  ✗ $cmd failed${NC}"
done

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${WHITE}  ╔══════════════════════════════════════════════════════╗"
echo -e "  ║         WinCMD-Kali installed successfully!         ║"
echo -e "  ╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Terminal mode${NC} (run inside your current terminal):"
echo -e "    ${YELLOW}wincmd${NC}"
echo ""
echo -e "  ${CYAN}Window mode${NC} (opens a native Windows CMD-styled window):"
echo -e "    ${YELLOW}wincmd-gui${NC}"
echo ""
echo -e "  ${CYAN}Run a batch file:${NC}"
echo -e "    ${YELLOW}wincmd myscript.bat${NC}"
echo ""
echo -e "  ${CYAN}Single command:${NC}"
echo -e "    ${YELLOW}wincmd /C \"ipconfig /all\"${NC}"
echo ""
echo -e "  ${CYAN}Uninstall:${NC}"
echo -e "    ${YELLOW}sudo bash /opt/wincmd-kali/install.sh --remove${NC}"
echo ""
