@echo off
REM Abre el workspace GestorNova.code-workspace en VS Code.
set WORKSPACE="%~dp0GestorNova.code-workspace"
if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" (
  "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" %WORKSPACE%
  exit /b %errorlevel%
)
if exist "%LocalAppData%\Programs\Microsoft VS Code\bin\code.cmd" (
  "%LocalAppData%\Programs\Microsoft VS Code\bin\code.cmd" %WORKSPACE%
  exit /b %errorlevel%
)
if exist "%ProgramFiles%\Microsoft VS Code\Code.exe" (
  start "" "%ProgramFiles%\Microsoft VS Code\Code.exe" %WORKSPACE%
  exit /b %errorlevel%
)
if exist "%LocalAppData%\Programs\Microsoft VS Code\Code.exe" (
  start "" "%LocalAppData%\Programs\Microsoft VS Code\Code.exe" %WORKSPACE%
  exit /b %errorlevel%
)
echo ERROR: No se encontró VS Code en la ubicación esperada ni el comando code en PATH.
echo Asegurate de tener VS Code instalado y / o de ejecutar este script desde un terminal con PATH configurado.
pause
