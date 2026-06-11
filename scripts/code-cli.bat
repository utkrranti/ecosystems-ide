@echo off
setlocal

title VSCode Dev

pushd %~dp0..

:: Get electron, compile, built-in extensions
if "%VSCODE_SKIP_PRELAUNCH%"=="" node build/lib/preLaunch.js

for /f "usebackq delims=" %%a in (`node "%~dp0resolve-electron-exe.js"`) do set "CODE_EXE=%%a"

:: Manage built-in extensions
if "%~1"=="--builtin" goto builtin

:: Configuration
set ELECTRON_RUN_AS_NODE=1
set NODE_ENV=development
set VSCODE_DEV=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

:: Launch Code
call "%CODE_EXE%" --inspect=5874 out\cli.js %~dp0.. %*
goto end

:builtin
call "%CODE_EXE%" build/builtin

:end

popd

endlocal
