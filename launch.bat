@echo off
title Phone Farm 3.0
cd /d "%~dp0"

:: Phone Farm 3.0 — Tüm bağımlılıklar paket içinde gömülüdür.
:: Python ve ADB kurulumu gerekmez. Doğrudan başlatılır.

echo Phone Farm 3.0 baslatiliyor...

:: Paketli sürümü dene (electron-builder çıktısı)
if exist "dist\win-unpacked\Phone Farm.exe" (
    start "" "dist\win-unpacked\Phone Farm.exe"
    exit /b 0
)

:: Geliştirme sürümü: npm ile başlat
if exist "node_modules\electron\dist\electron.exe" (
    "%~dp0node_modules\electron\dist\electron.exe" .
    exit /b 0
)

echo Hata: Phone Farm exe'si bulunamadi.
echo Uygulamayi kurmak icin PhoneFarm-Setup-3.0.0.exe dosyasini calistirin.
pause
