@echo off
rem Arranca el servidor multijugador de Batallas medievales (doble clic). Cerrar la ventana lo para.
cd /d "%~dp0"
if not exist node_modules\ws call npm.cmd install --no-audit --no-fund
echo Servidor de Batallas medievales. Cierra esta ventana para pararlo.
echo Abre en el navegador una de las direcciones de abajo (la de tu red es la que debe usar quien juegue contigo).
node servidor-lobby.js %*
pause
