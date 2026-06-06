@echo off
setlocal

set ELECTRON_RUN_AS_NODE=

pushd %~dp0\..

:: Get Code.exe location
for /f "delims=" %%a in ('node -p "require('./product.json').nameShort + '.exe'"') do set NAMESHORT=%%a
set CODE=".build\electron\%NAMESHORT%"

:: Download Electron if needed
call node build\lib\electron.js
if %errorlevel% neq 0 node .\node_modules\gulp\bin\gulp.js electron

:: Run tests
set ELECTRON_ENABLE_LOGGING=1
%CODE% .\test\unit\electron\index.js --crash-reporter-directory=%~dp0\..\.build\crashes %*

popd

endlocal

:: app.exit(0) is exiting with code 255 in Electron 1.7.4.
:: See https://github.com/microsoft/vscode/issues/28582
echo errorlevel: %errorlevel%
if %errorlevel% == 255 set errorlevel=0

exit /b %errorlevel%
