@echo off
setlocal
REM Foreground Elasticsearch runner for the local demo stack.

if "%ELASTIC_HOME%"=="" (
    if exist "C:\elasticsearch-8.11.0\bin\elasticsearch.bat" (
        set "ELASTIC_HOME=C:\elasticsearch-8.11.0"
    ) else if exist "C:\elasticsearch-9.3.3\bin\elasticsearch.bat" (
        set "ELASTIC_HOME=C:\elasticsearch-9.3.3"
    )
)

if not exist "%ELASTIC_HOME%\bin\elasticsearch.bat" (
    echo Elasticsearch not found. Set ELASTIC_HOME or install it under C:\elasticsearch-*
    exit /b 1
)

for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
set "RUNTIME_ROOT=%REPO_ROOT%\.runtime\elasticsearch"
set "ES_DATA_PATH=%RUNTIME_ROOT%\data"
set "ES_LOG_PATH=%RUNTIME_ROOT%\logs"
set "ES_TMPDIR=%RUNTIME_ROOT%\tmp"
set "ES_JAVA_OPTS=-Xms512m -Xmx512m"
set "TMP=%ES_TMPDIR%"
set "TEMP=%ES_TMPDIR%"

if not exist "%ES_DATA_PATH%" mkdir "%ES_DATA_PATH%"
if not exist "%ES_LOG_PATH%" mkdir "%ES_LOG_PATH%"
if not exist "%ES_TMPDIR%" mkdir "%ES_TMPDIR%"

call "%ELASTIC_HOME%\bin\elasticsearch.bat" ^
  -Enetwork.host=127.0.0.1 ^
  -Ehttp.port=9200 ^
  -Ediscovery.type=single-node ^
  -Expack.security.enabled=false ^
  -Ecluster.routing.allocation.disk.threshold_enabled=false ^
  -Epath.data=%ES_DATA_PATH% ^
  -Epath.logs=%ES_LOG_PATH%
