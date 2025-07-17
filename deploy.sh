#!/bin/bash

# Vardaan DS Backend Deployment Script
# This script helps prepare and deploy your backend

echo "🚀 Vardaan DS Backend Deployment Helper"
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp env.example .env
    echo "✅ .env file created from template"
    echo "📝 Please edit .env file with your configuration"
else
    echo "✅ .env file exists"
fi

# Test the server
echo "🧪 Testing server startup..."
timeout 10s node server.js &
SERVER_PID=$!

sleep 3

if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Server starts successfully"
    kill $SERVER_PID
else
    echo "❌ Server failed to start. Check your configuration."
    exit 1
fi

echo ""
echo "🎉 Backend is ready for deployment!"
echo ""
echo "📋 Next Steps:"
echo "1. Push this code to GitHub"
echo "2. Deploy to Render/Railway (see README.md)"
echo "3. Set environment variables in deployment platform"
echo "4. Deploy your React frontend to Netlify"
echo "5. Update frontend API URL to point to deployed backend"
echo ""
echo "📚 For detailed instructions, see README.md"
echo "🔗 Render: https://render.com"
echo "🔗 Railway: https://railway.app"
echo "🔗 Netlify: https://netlify.com" 