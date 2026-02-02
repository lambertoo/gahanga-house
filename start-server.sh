#!/bin/bash

# Simple script to start a local web server for the dashboard
# This avoids CORS issues when loading data from Google Sheets

echo "🚀 Starting local web server..."
echo ""
echo "The dashboard will be available at: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Try Python 3 first, then Python 2, then suggest alternatives
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m SimpleHTTPServer 8000
else
    echo "❌ Python not found. Please install Python 3 or use one of these alternatives:"
    echo ""
    echo "Option 1: Install Python 3"
    echo "Option 2: Use Node.js: npx http-server -p 8000"
    echo "Option 3: Use VS Code Live Server extension"
    exit 1
fi
