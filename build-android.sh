#!/bin/bash
echo "🤖 Building Android APK..."
cd android
./gradlew assembleDebug
cd ..
mkdir -p public/downloads
cp android/app/build/outputs/apk/debug/app-debug.apk public/downloads/solzity.apk
echo "✅ APK ready at: public/downloads/solzity.apk"
