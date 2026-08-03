#!/bin/bash
set -e

echo "======================================"
echo "🚀 Starting Cobble AI Setup"
echo "======================================"

# 1. Check prerequisites
command -v docker >/dev/null 2>&1 || { echo >&2 "❌ Docker is required but it's not installed. Aborting."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo >&2 "❌ Python 3 is required but it's not installed. Aborting."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo >&2 "❌ npm is required but it's not installed. Aborting."; exit 1; }

# 2. Check Port 8000
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  WARNING: Port 8000 is already in use by another application."
    echo "    Cobble AI backend requires port 8000."
    echo "    Please stop the conflicting service (e.g., another Docker container) and try again."
    exit 1
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  WARNING: Port 5173 is already in use by another application."
    echo "    Please stop the conflicting service and try again."
    exit 1
fi

echo "✅ Ports 8000 and 5173 are free."

# 3. Start Docker Containers
echo "🐳 Starting Docker infrastructure (MongoDB, Redis, Qdrant, MinIO)..."
docker-compose up -d

echo "⏳ Waiting for databases to initialize..."
sleep 5

# 4. Setup Backend
echo "🐍 Setting up Python Backend..."
cd backend

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt

# Start Celery in the background
echo "🏃‍♂️ Starting Celery worker..."
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
nohup celery -A app.core.celery_app worker --pool=solo --loglevel=info > celery_worker.log 2>&1 &
CELERY_PID=$!
echo "   Celery worker started (PID: $CELERY_PID)"

# Start FastAPI in the background
echo "🚀 Starting FastAPI server..."
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > fastapi_server.log 2>&1 &
FASTAPI_PID=$!
echo "   FastAPI server started (PID: $FASTAPI_PID)"

cd ..

# 5. Setup Frontend
echo "⚛️  Setting up React Frontend..."
cd frontend
npm install

# Start Vite in the background
echo "🌟 Starting Vite dev server..."
nohup npm run dev > vite_server.log 2>&1 &
VITE_PID=$!
echo "   Vite server started (PID: $VITE_PID)"

cd ..

echo "======================================"
echo "✅ Setup Complete!"
echo "======================================"
echo "Cobble AI is now running:"
echo "➡️  Frontend: http://localhost:5173"
echo "➡️  Backend API: http://localhost:8000"
echo ""
echo "To stop the servers later, you can kill the background processes or use 'pkill -f uvicorn' and 'pkill -f celery', then run 'docker-compose down'."
