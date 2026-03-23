# WinCMD-Kali — Complete Command Reference

## File System Commands

### DIR
List directory contents.
```
DIR [drive:][path][filename] [/A[[:]attributes]] [/B] [/W]

  /A    Display files with all attributes (including hidden)
  /B    Bare format — filenames only, no header or summary
  /W    Wide list format

Examples:
  dir
  dir /b
  dir C:\Users\kali
  dir *.txt /b
```

### CD / CHDIR
Display or change current directory.
```
CD [path]
CD ..         Move to parent directory

Examples:
  cd
  cd Desktop
  cd C:\Users\kali\Downloads
  cd ..
```

### MKDIR / MD
Create one or more directories (including nested).
```
MKDIR [drive:]path
MD [drive:]path

Examples:
  mkdir mydir
  mkdir projects\app\src
  md C:\temp\logs
```

### RMDIR / RD
Remove a directory.
```
RMDIR [/S] [/Q] [drive:]path
RD    [/S] [/Q] [drive:]path

  /S    Remove all subdirectories and files (recursive)
  /Q    Quiet mode — do not prompt for confirmation

Examples:
  rmdir emptydir
  rmdir /s /q build
```

### COPY
Copy one or more files.
```
COPY source destination

Examples:
  copy file.txt backup.txt
  copy report.pdf C:\temp\
```

### XCOPY
Copy files and directory trees.
```
XCOPY source [destination] [/S] [/E]

  /S    Copy directories and subdirectories (not empty ones)
  /E    Copy all subdirectories including empty ones

Examples:
  xcopy src\ dst\ /s /e
  xcopy myapp\ backup\
```

### MOVE
Move files or rename files and directories.
```
MOVE [source] [target]

Examples:
  move old.txt new.txt
  move file.txt C:\temp\
  move myfolder\ otherfolder\
```

### DEL / ERASE
Delete one or more files.
```
DEL  [/F] [/Q] names
ERASE [/F] [/Q] names

  /F    Force delete read-only files
  /Q    Quiet — don't ask for confirmation on wildcards

Examples:
  del temp.txt
  del /q *.log
  del C:\temp\*.tmp
```

### REN / RENAME
Rename a file or files.
```
REN [drive:][path]filename1 filename2
RENAME [drive:][path]filename1 filename2

Examples:
  ren old.txt new.txt
  rename report.docx report_final.docx
```

### TYPE
Display contents of a text file.
```
TYPE [drive:][path]filename

Examples:
  type readme.txt
  type C:\logs\app.log
```

### TREE
Graphically display folder structure.
```
TREE [drive:][path] [/F]

  /F    Display filenames in each folder

Examples:
  tree
  tree /f
  tree C:\projects\myapp
```

### ATTRIB
Display file attributes.
```
ATTRIB [[+|-]attribute] [path]

  H    Hidden attribute

Examples:
  attrib
  attrib myfile.txt
```

### FC (File Compare)
Compare two files and show differences.
```
FC [/B] file1 file2

Examples:
  fc file1.txt file2.txt
```

---

## Text Processing Commands

### FIND
Search for a text string in files.
```
FIND [/V] [/C] [/I] "string" [[drive:][path]filename]

  /V    Display all lines NOT containing the string
  /C    Display only the count of matching lines
  /I    Ignore case when searching

Examples:
  find "error" app.log
  find /i "warning" app.log
  find /v "success" results.txt
  find /c "line" file.txt
  type file.txt | find "keyword"
```

### FINDSTR
Search for strings in files (with regex support).
```
FINDSTR [/I] [/R] [/V] "pattern" [files]

  /I    Case insensitive
  /R    Use regular expression
  /V    Show non-matching lines

Examples:
  findstr "error" *.log
  findstr /i /r "err[or]+" app.log
```

### SORT
Sort input alphabetically.
```
SORT [/R] [[drive:][path]filename]

  /R    Sort in reverse order

Examples:
  sort names.txt
  sort /r scores.txt
  dir /b | sort
```

### MORE
Display output one screen at a time.
```
MORE [file]

  Press Enter to advance one line
  Press Space to advance one page
  Press Q to quit

Examples:
  more readme.txt
  type longfile.txt | more
```

---

## Environment Commands

### SET
Display, set, or remove environment variables.
```
SET                    List all variables
SET prefix             List variables starting with prefix
SET var=value          Set a variable
SET var=               Delete a variable

Examples:
  set
  set PATH
  set MYVAR=hello
  set MYVAR=
  echo %MYVAR%
```

### PATH
Display or set the PATH environment variable.
```
PATH
PATH value

Examples:
  path
  path C:\Windows\System32
```

---

## System Information Commands

### SYSTEMINFO
Display detailed system configuration.
```
SYSTEMINFO

Shows: hostname, OS version, memory, CPU, locale, network cards
```

### VER
Display the Windows version string.
```
VER
```

### WHOAMI
Display the current user.
```
WHOAMI [/ALL]

  /ALL    Display user info and group memberships

Examples:
  whoami
  whoami /all
```

### HOSTNAME
Display the computer name.
```
HOSTNAME
```

### DATE
Display the current date.
```
DATE
```

### TIME
Display the current time.
```
TIME
```

### WHERE
Locate a program in PATH.
```
WHERE [pattern]

Examples:
  where python3
  where node
  where git
```

---

## Network Commands

### IPCONFIG
Display network configuration.
```
IPCONFIG [/ALL]

  /ALL    Show full configuration including MAC address

Examples:
  ipconfig
  ipconfig /all
```

### PING
Send ICMP echo requests to a host.
```
PING [-n count] target_name

  -n count    Number of requests to send (default: 4)

Examples:
  ping google.com
  ping -n 10 192.168.1.1
  ping localhost
```

### TRACERT
Trace the network route to a host.
```
TRACERT target_name

Examples:
  tracert google.com
  tracert 8.8.8.8
```

### NETSTAT
Display active network connections.
```
NETSTAT [/A] [/N]

  /A    Show all connections and listening ports
  /N    Show addresses numerically

Examples:
  netstat
  netstat /a
```

---

## Process Management Commands

### TASKLIST
Display all running processes.
```
TASKLIST [/SVC]

  /SVC    Show services for each process

Examples:
  tasklist
  tasklist | find "python"
```

### TASKKILL
Terminate a running process.
```
TASKKILL [/PID pid | /IM imagename] [/F]

  /PID pid       Kill process by PID
  /IM name       Kill process by image name
  /F             Force kill (SIGKILL)

Examples:
  taskkill /pid 1234
  taskkill /im python3 /f
  taskkill /f /pid 9999
```

---

## Shell Control Commands

### ECHO
Display a message.
```
ECHO message
ECHO ON | OFF
ECHO.              Print blank line

Examples:
  echo Hello World
  echo.
  @echo off
  echo Current dir: %CD%
```

### CLS
Clear the screen.
```
CLS
```

### HELP
Display help information.
```
HELP [command]

Examples:
  help
  help dir
  help find
  help taskkill
```

### EXIT
Quit the CMD shell.
```
EXIT [exitcode]

Examples:
  exit
  exit 0
  exit 1
```

### PAUSE
Wait for a keypress.
```
PAUSE

Output: Press any key to continue . . .
```

### TITLE
Set the terminal window title.
```
TITLE text

Examples:
  title My CMD Window
```

### PUSHD / POPD
Push and pop directory stack.
```
PUSHD [path]    Save current dir and change to path
POPD            Return to previously saved dir

Examples:
  pushd C:\temp
  popd
```

---

## Batch File Commands

### REM
Add a comment in a batch file.
```
REM This is a comment
:: This is also a comment (CMD style)
```

### CALL
Call another batch file or command.
```
CALL [filename.bat] [arguments]
CALL [command]

Examples:
  call setup.bat
  call echo Hello
```

### IF / IF NOT
Conditional execution.
```
IF [NOT] condition command

Conditions:
  EXIST path              File or directory exists
  ERRORLEVEL n            Exit code >= n
  "string1"=="string2"    String comparison

Examples:
  IF EXIST output.txt echo File found
  IF NOT EXIST log.txt echo No log file
  IF "%VAR%"=="hello" echo Match
  IF ERRORLEVEL 1 echo Failed
```

### FOR
Loop over a set of items.
```
FOR %%var IN (set) DO command
FOR /L %%var IN (start,step,end) DO command
FOR /F %%var IN (file) DO command

Examples:
  FOR %%I IN (a b c) DO echo %%I
  FOR /L %%N IN (1,1,10) DO echo %%N
  FOR /F %%L IN (data.txt) DO echo %%L
```

### GOTO
Jump to a label in a batch file.
```
GOTO label
GOTO :EOF      Jump to end of file

:label         Define a label

Examples:
  GOTO end
  echo This is skipped
  :end
  echo Done
```

---

## Redirection and Pipes

### Output Redirection
```
command > file      Write output to file (overwrite)
command >> file     Append output to file
command 2> file     Redirect stderr to file
command < file      Read input from file

Examples:
  dir > listing.txt
  echo hello >> log.txt
  type file.txt | find "error" > errors.txt
```

### Pipes
```
command1 | command2

Examples:
  dir /b | sort
  tasklist | find "python"
  type app.log | find /c "error"
  dir /b | sort /r > sorted.txt
```

### Logical Operators
```
cmd1 && cmd2    Run cmd2 only if cmd1 succeeds (exit code 0)
cmd1 || cmd2    Run cmd2 only if cmd1 fails (non-zero exit code)
cmd1 & cmd2     Always run both commands

Examples:
  mkdir output && echo Directory created
  del temp.txt || echo File not found
  echo start & echo end
```
