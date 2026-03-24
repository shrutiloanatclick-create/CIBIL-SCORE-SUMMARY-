@echo off
echo ==========================================
echo Starting CIBIL Summarization System...
echo ==========================================

REM Check if Python is installed
python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Python is not found! Please install Python and add it to your PATH.
    pause
    exit /b
)

REM Check if Node is installed
npm --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Node.js (npm) is not found! Please install Node.js and add it to your PATH.
    pause
    exit /b
)

echo Installing backend requirements...
cd backend
python -m venv venv
call venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt

echo Starting Backend Server (FastAPI) in a new window...
start cmd /k "title Backend Server && cd /d %~dp0backend && call venv\Scripts\activate.bat && python -m uvicorn main:app --reload --port 8000 --host 0.0.0.0"

echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo Installing frontend requirements...
cd ..\frontend
call npm install

echo Starting Frontend Server (React/Vite) in a new window...
start cmd /k "title Frontend Server && cd /d %~dp0frontend && npm run dev"

echo ==========================================
echo Servers are starting up!
echo Backend will be at http://localhost:8000
echo Frontend will be at http://127.0.0.1:5174
echo ==========================================
pause
