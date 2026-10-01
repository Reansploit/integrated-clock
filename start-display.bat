@echo off
REM Jalankan display clock2 (produksi). Klik 2x file ini.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terinstall. Install dulu dari https://nodejs.org (versi 22 ke atas).
  pause
  exit /b 1
)
if not exist ".next" (
  echo Folder .next belum ada, build dulu...
  call npm run build
  if errorlevel 1 (
    echo Build gagal, cek pesan error di atas.
    pause
    exit /b 1
  )
)
echo Display jalan di http://localhost:3000 - buka browser lalu tekan F11.
call npm start
pause
