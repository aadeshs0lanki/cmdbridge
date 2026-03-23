#!/bin/bash
# ============================================================
# WinCMD-Kali Native Launcher
# Opens a real Windows CMD-style terminal window (no browser)
# Uses xterm with exact Windows CMD appearance
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINCMD_JS="$SCRIPT_DIR/wincmd.js"

# Windows CMD exact colors
BG_COLOR="#000000"
FG_COLOR="#C0C0C0"
CURSOR_COLOR="#C0C0C0"
SELECT_BG="#000080"
SELECT_FG="#FFFFFF"

# Windows CMD title
TITLE="C:\\Windows\\System32\\cmd.exe"

# Find best available terminal emulator
launch_with_xterm() {
  xterm \
    -title "$TITLE" \
    -geometry 80x25+100+100 \
    -bg "$BG_COLOR" \
    -fg "$FG_COLOR" \
    -cr "$CURSOR_COLOR" \
    -fa "Consolas,Monospace,DejaVu Sans Mono,Lucida Console" \
    -fs 11 \
    -bd "#808080" \
    -bw 1 \
    -sb \
    -sl 3000 \
    -rightbar \
    -xrm "xterm*selectBackground: $SELECT_BG" \
    -xrm "xterm*selectForeground: $SELECT_FG" \
    -xrm "xterm*colorBD: #FFFFFF" \
    -xrm "xterm*colorUL: #00FF00" \
    -xrm "xterm*allowBoldFonts: true" \
    -xrm "xterm*vt100.translations: #override \
      Shift<Key>Insert: insert-selection(CLIPBOARD) \n\
      Ctrl<Key>c: copy-selection(CLIPBOARD)" \
    -e bash -c "node '$WINCMD_JS' \"\$@\"" -- "$@"
}

launch_with_xfce4() {
  xfce4-terminal \
    --title="$TITLE" \
    --geometry=80x25 \
    --color-bg="$BG_COLOR" \
    --color-fg="$FG_COLOR" \
    --font="Consolas 11" \
    --command="bash -c \"node '$WINCMD_JS' \\\"\\\$@\\\"\"" -- "$@"
}

launch_with_gnome() {
  gnome-terminal \
    --title="$TITLE" \
    --geometry=80x25 \
    -- bash -c "node '$WINCMD_JS' \"\$@\"; read -p 'Press Enter...'" -- "$@"
}

launch_with_konsole() {
  konsole \
    --title "$TITLE" \
    --profile "WinCMD" \
    -e bash -c "node '$WINCMD_JS' \"\$@\"" -- "$@"
}

launch_with_lxterminal() {
  lxterminal \
    --title="$TITLE" \
    --geometry=80x25 \
    --command="bash -c \"node '$WINCMD_JS'\""
}

launch_fallback() {
  # No X11 terminal found - run in current terminal
  node "$WINCMD_JS" "$@"
}

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Please install: apt install nodejs"
  exit 1
fi

# Check display available
if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
  # No display - run in current terminal (e.g. from SSH)
  launch_fallback "$@"
  exit $?
fi

# Try terminals in order of preference
if command -v xterm &>/dev/null; then
  launch_with_xterm "$@"
elif command -v xfce4-terminal &>/dev/null; then
  launch_with_xfce4 "$@"
elif command -v gnome-terminal &>/dev/null; then
  launch_with_gnome "$@"
elif command -v konsole &>/dev/null; then
  launch_with_konsole "$@"
elif command -v lxterminal &>/dev/null; then
  launch_with_lxterminal "$@"
elif command -v x-terminal-emulator &>/dev/null; then
  x-terminal-emulator -title "$TITLE" -e "node '$WINCMD_JS' \"\$@\""
else
  echo "No graphical terminal found. Installing xterm..."
  sudo apt-get install -y xterm
  launch_with_xterm "$@"
fi
