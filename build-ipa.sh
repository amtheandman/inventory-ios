#!/usr/bin/env bash
# ============================================================
#  进销存管家 - 在 macOS 上构建 iOS IPA（供 TrollStore 安装）
#  用法:
#    ./build-ipa.sh            # 无签名构建（TrollStore 会重新签名，推荐）
#    SIGN_IDENTITY="iPhone Developer: xxx" ./build-ipa.sh   # 用你的开发者证书签名
#  依赖: Node 22, Xcode (含命令行工具), CocoaPods
# ============================================================
set -e
cd "$(dirname "$0")"

echo "== 1/5 安装 Web 依赖 =="
npm install --no-audit --no-fund

echo "== 2/5 同步 Capacitor iOS 原生工程 =="
npx cap sync ios || npx cap copy ios

cd ios/App

echo "== 3/5 pod install =="
pod install --repo-update

WS="App.xcworkspace"
SCHEME="App"
ARCHIVE="./build/App.xcarchive"

rm -rf ./build
mkdir -p ./build

if [ -z "$SIGN_IDENTITY" ]; then
  echo "== 4/5 无签名 Archive（TrollStore 安装时会重新签名）=="
  xcodebuild -workspace "$WS" -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$ARCHIVE" \
    -destination 'generic/platform=iOS' \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    archive
else
  echo "== 4/5 使用证书 $SIGN_IDENTITY Archive =="
  xcodebuild -workspace "$WS" -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$ARCHIVE" \
    -destination 'generic/platform=iOS' \
    CODE_SIGN_IDENTITY="$SIGN_IDENTITY" \
    archive
fi

echo "== 5/5 打包为 IPA =="
rm -rf ./build/Payload
mkdir -p ./build/Payload
cp -R "$ARCHIVE/Products/Applications/App.app" ./build/Payload/
cd ./build
zip -r "../build/进销存管家.ipa" Payload >/dev/null
cd ..

OUT="$(pwd)/../build/进销存管家.ipa"
echo ""
echo "✅ 构建完成！IPA 位于:"
echo "   $OUT"
echo ""
echo "下一步: 把 IPA 传到 iPhone，用 TrollStore 安装即可（无需 Apple 账号）。"
