@echo off
setlocal

set ELECTRON_RUN_AS_NODE=1

pushd %~dp0\..

for /f "usebackq delims=" %%a in (`node "%~dp0resolve-electron-exe.js"`) do set "CODE_EXE=%%a"

call "%CODE_EXE%" %*

popd

endlocal
exit /b %errorlevel%
