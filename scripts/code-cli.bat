@echo off
setlocal

title VSCode Dev

pushd %~dp0..

:: Get electron, compile, built-in extensions
if "%VSCODE_SKIP_PRELAUNCH%"=="" node build/lib/preLaunch.js

for /f "delims=" %%a in ('node -p "require('./product.json').nameShort + '.exe'"') do set NAMESHORT=%%a
set CODE=".build\electron\%NAMESHORT%"

:: Manage built-in extensions
if "%~1"=="--builtin" goto builtin

:: Configuration
set ELECTRON_RUN_AS_NODE=1
set NODE_ENV=development
set VSCODE_DEV=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

:: Launch Code
%CODE% --inspect=5874 out\cli.js %~dp0.. %*
goto end

:builtin
%CODE% build/builtin

:end

popd

endlocal
