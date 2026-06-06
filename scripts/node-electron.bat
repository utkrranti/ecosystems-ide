@echo off
setlocal

set ELECTRON_RUN_AS_NODE=1

pushd %~dp0\..

for /f "delims=" %%a in ('node -p "require('./product.json').nameShort + '.exe'"') do set NAMESHORT=%%a
set CODE=".build\electron\%NAMESHORT%"

%CODE% %*

popd

endlocal
exit /b %errorlevel%
