@echo off
REM Elasticsearch Setup Script for Windows - 2GB Memory Limit
REM This script downloads and configures Elasticsearch with minimal memory usage

echo ================================
echo Elasticsearch Setup (2GB Max)
echo ================================
echo.

REM Check if Elasticsearch is already downloaded
if exist "C:\elasticsearch-8.11.0" (
    echo ✓ Elasticsearch found at C:\elasticsearch-8.11.0
    goto configure
)

echo Downloading Elasticsearch 8.11.0...
echo This will take 2-5 minutes depending on your internet speed.
echo.

REM Create elasticsearch directory
if not exist "C:\elasticsearch-8.11.0" mkdir "C:\elasticsearch-8.11.0"

REM Download Elasticsearch (you can manually download and extract if this fails)
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.0-windows-x86_64.zip' -OutFile 'elasticsearch-8.11.0-windows-x86_64.zip'; Expand-Archive 'elasticsearch-8.11.0-windows-x86_64.zip' -DestinationPath 'C:\' -Force; Remove-Item 'elasticsearch-8.11.0-windows-x86_64.zip'}"

if not exist "C:\elasticsearch-8.11.0" (
    echo.
    echo ❌ Auto-download failed. Please manually:
    echo 1. Visit: https://www.elastic.co/downloads/elasticsearch
    echo 2. Download: Elasticsearch 8.11.0 for Windows
    echo 3. Extract to: C:\elasticsearch-8.11.0
    echo 4. Run this script again
    pause
    exit /b 1
)

echo ✓ Elasticsearch downloaded successfully
echo.

:configure
echo Configuring JVM settings for 2GB memory limit...
echo.

REM Backup original jvm.options
if not exist "C:\elasticsearch-8.11.0\config\jvm.options.backup" (
    copy "C:\elasticsearch-8.11.0\config\jvm.options" "C:\elasticsearch-8.11.0\config\jvm.options.backup"
)

REM Create new jvm.options with 1GB heap (safe for 2GB total memory)
(
    echo ## JVM Configuration for 2GB System
    echo -Xms512m
    echo -Xmx1g
    echo -XX:+UseG1GC
    echo -XX:G1ReservePercent=25
    echo -XX:InitiatingHeapOccupancyPercent=30
) > "C:\elasticsearch-8.11.0\config\jvm.options"

echo ✓ JVM settings configured (512MB initial, 1GB max)
echo.

echo ================================
echo ✓ Setup Complete!
echo ================================
echo.
echo To start Elasticsearch:
echo.
echo   cd C:\elasticsearch-8.11.0\bin
echo   elasticsearch.bat
echo.
echo Or run: run_elasticsearch.bat
echo.
echo Port: http://localhost:9200
echo Memory: 512MB - 1GB (Total ~2GB with OS overhead)
echo.
pause
