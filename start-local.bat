@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
	py -m http.server 4173
	exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
	python -m http.server 4173
	exit /b
)
echo Python 3 is required to run the local server.
pause
