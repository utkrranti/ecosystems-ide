@echo off
setlocal

title Altus IDE Dev

pushd %~dp0\..

:: Get electron, compile, built-in extensions
if "%VSCODE_SKIP_PRELAUNCH%"=="" node build/lib/preLaunch.js

for /f "usebackq delims=" %%a in (`node "%~dp0resolve-electron-exe.js"`) do set "CODE_EXE=%%a"
if not defined CODE_EXE (
	echo Failed to resolve Electron executable. Run: npm run electron
	popd
	exit /b 1
)

:: Manage built-in extensions
if "%~1"=="--builtin" goto builtin

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1
set VSCODE_CLI=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

set DISABLE_TEST_EXTENSION="--disable-extension=vscode.vscode-api-tests"
for %%A in (%*) do (
	if "%%~A"=="--extensionTestsPath" (
		set DISABLE_TEST_EXTENSION=""
	)
)

:: Launch IDE
call "%CODE_EXE%" . %DISABLE_TEST_EXTENSION% %*
goto end

:builtin
call "%CODE_EXE%" build/builtin

:end

popd

endlocal
