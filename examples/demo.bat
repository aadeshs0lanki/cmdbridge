@echo off
:: ============================================================
:: demo.bat - WinCMD-Kali Feature Demo Script
:: Run: node bin/wincmd.js demo.bat
:: ============================================================

echo.
echo ============================================================
echo   WinCMD-Kali Demo Script
echo ============================================================
echo.

:: --- System Info ---
echo [1] System Information
echo --------------------
ver
echo.
whoami
echo.

:: --- Directory Operations ---
echo [2] Directory Operations
echo ------------------------
echo Creating demo folder structure...
IF EXIST demo_output RMDIR /S /Q demo_output
MKDIR demo_output
MKDIR demo_output\docs
MKDIR demo_output\logs

echo Folders created:
TREE demo_output

:: --- File Operations ---
echo.
echo [3] File Operations
echo -------------------
echo Hello from WinCMD-Kali! > demo_output\docs\readme.txt
echo This is line 2.        >> demo_output\docs\readme.txt
echo This is line 3.        >> demo_output\docs\readme.txt

echo Contents of readme.txt:
TYPE demo_output\docs\readme.txt

:: --- Environment Variables ---
echo.
echo [4] Environment Variables
echo -------------------------
SET DEMO_VAR=WinCMD-Kali Rocks!
echo DEMO_VAR = %DEMO_VAR%
echo Current dir: %CD%

:: --- Find / Search ---
echo.
echo [5] FIND Command
echo ----------------
FIND "line 2" demo_output/docs/readme.txt

:: --- FOR Loop ---
echo.
echo [6] FOR Loop
echo ------------
FOR %%F IN (alpha beta gamma delta) DO echo Processing: %%F

:: --- FOR /L Numeric Range ---
echo.
echo [7] FOR /L Numeric Range
echo ------------------------
FOR /L %%N IN (1,1,5) DO echo Step %%N of 5

:: --- IF / ELSE ---
echo.
echo [8] IF / ELSE Logic
echo -------------------
SET SCORE=85
IF "%SCORE%"=="85" echo Score is 85 - Pass!
IF NOT "%SCORE%"=="85" echo Score is not 85.

IF EXIST demo_output\docs\readme.txt echo readme.txt EXISTS - check passed.
IF NOT EXIST demo_output\docs\readme.txt echo readme.txt NOT found.

:: --- COPY / MOVE ---
echo.
echo [9] COPY and MOVE
echo -----------------
COPY demo_output\docs\readme.txt demo_output\logs\readme_backup.txt
echo Copied readme.txt to logs folder.
DIR demo_output\logs /B

:: --- SORT ---
echo.
echo [10] SORT Command
echo -----------------
echo banana  > demo_output\unsorted.txt
echo apple   >> demo_output\unsorted.txt
echo cherry  >> demo_output\unsorted.txt
echo date    >> demo_output\unsorted.txt
echo Sorted output:
SORT demo_output\unsorted.txt

:: --- FIND with /V (negate) ---
echo.
echo [11] FIND /V (lines NOT containing 'line')
echo -------------------------------------------
FIND /V "line" demo_output/docs/readme.txt

:: --- Cleanup ---
echo.
echo [12] Cleanup
echo ------------
RMDIR /S /Q demo_output
echo demo_output removed.

echo.
echo ============================================================
echo   Demo Complete! WinCMD-Kali works perfectly on Linux.
echo ============================================================
echo.
