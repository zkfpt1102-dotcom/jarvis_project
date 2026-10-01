@echo off
chcp 65001 >nul
echo ========================================================
echo [J.A.R.V.I.S.] Android Native APK One-Click Builder
echo ========================================================

set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.7.6-hotspot"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

echo 1. Web Assets Syncing...
if not exist "mobile-dist" mkdir "mobile-dist"
xcopy /E /I /Y "src\renderer\*" "mobile-dist" >nul
call npx cap sync android

echo 2. Compiling Android APK with Native Gradle...
cd android
call gradlew.bat assembleDebug
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] APK 빌드 중 오류가 발생했습니다. 로그를 확인하십시오.
    cd ..
    pause
    exit /b 1
)
cd ..

if not exist "dist" mkdir "dist"
copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "dist\jarvis-mobile.apk" >nul

echo ========================================================
echo [SUCCESS] APK 빌드가 성공적으로 완료되었습니다!
echo 산출물 위치: dist\jarvis-mobile.apk
echo ========================================================
pause
