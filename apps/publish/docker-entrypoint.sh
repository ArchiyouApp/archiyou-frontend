#!/bin/sh

# For local development, we need to check for local archiyou-core library in /libs/archiyou-core, 
# build it, and link it into the server before starting.

LOCAL_LIB="/libs/archiyou-core"

if [ -d "$LOCAL_LIB" ]; then
    echo "📦 Found local archiyou-core, building..."
    
    cd $LOCAL_LIB

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "🔧 Installing archiyou-core dependencies..."
        pnpm install
    fi

    # Build
    echo "🔧 Building archiyou-core..."
    pnpm run build

    if [ $? -ne 0 ]; then
        echo "❌ archiyou-core build failed!"
        exit 1
    fi

    echo "✅ archiyou-core built successfully"

    # Link into archiyou-server
    cd /app
    pnpm link $LOCAL_LIB
    echo "✅ archiyou-core linked"
else
    echo "📦 Using installed archiyou-core from registry"
fi

echo "🚀 Starting server..."
exec "$@"