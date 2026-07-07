#!/bin/bash
# build.sh — compile "Riffle.app" from launcher.applescript, bundle
# viewer.html + the seed helper inside it, and register it as a handler for
# Markdown, SQL, JSON, CSV/TSV, and diff/patch files.
# Re-run any time you edit viewer.html.
set -euo pipefail
cd "$(dirname "$0")"

APP="Riffle.app"
PLIST_BUDDY="/usr/libexec/PlistBuddy"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

echo "› compiling $APP"
rm -rf "$APP"
osacompile -o "$APP" launcher.applescript

echo "› bundling resources"
cp ../viewer.html "$APP/Contents/Resources/viewer.html"
cp seed-and-open.sh "$APP/Contents/Resources/seed-and-open.sh"
chmod +x "$APP/Contents/Resources/seed-and-open.sh"

echo "› patching Info.plist (declare md/sql/json/csv/diff document types)"
PLIST="$APP/Contents/Info.plist"
"$PLIST_BUDDY" -c "Set :CFBundleName Riffle" "$PLIST" 2>/dev/null \
  || "$PLIST_BUDDY" -c "Add :CFBundleName string 'Riffle'" "$PLIST"
"$PLIST_BUDDY" -c "Set :CFBundleIdentifier com.vanovian.riffle" "$PLIST" 2>/dev/null \
  || "$PLIST_BUDDY" -c "Add :CFBundleIdentifier string com.vanovian.riffle" "$PLIST"
# osacompile seeds a default CFBundleDocumentTypes — drop it and add our own.
"$PLIST_BUDDY" -c "Delete :CFBundleDocumentTypes" "$PLIST" 2>/dev/null || true
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0 dict" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeName string 'Markdown Document'" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Viewer" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:LSHandlerRank string Alternate" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:0 string md" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:1 string markdown" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:2 string mdown" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:3 string mkd" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1 dict" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:CFBundleTypeName string 'SQL Script'" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:CFBundleTypeRole string Viewer" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:LSHandlerRank string Alternate" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:CFBundleTypeExtensions array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:1:CFBundleTypeExtensions:0 string sql" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:2 dict" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:2:CFBundleTypeName string 'JSON Document'" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:2:CFBundleTypeRole string Viewer" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:2:LSHandlerRank string Alternate" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:2:CFBundleTypeExtensions array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:2:CFBundleTypeExtensions:0 string json" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:2:CFBundleTypeExtensions:1 string geojson" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:3 dict" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:3:CFBundleTypeName string 'CSV Document'" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:3:CFBundleTypeRole string Viewer" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:3:LSHandlerRank string Alternate" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:3:CFBundleTypeExtensions array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:3:CFBundleTypeExtensions:0 string csv" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:3:CFBundleTypeExtensions:1 string tsv" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:4 dict" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:4:CFBundleTypeName string 'Diff Document'" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:4:CFBundleTypeRole string Viewer" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:4:LSHandlerRank string Alternate" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:4:CFBundleTypeExtensions array" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:4:CFBundleTypeExtensions:0 string diff" "$PLIST"
"$PLIST_BUDDY" -c "Add :CFBundleDocumentTypes:4:CFBundleTypeExtensions:1 string patch" "$PLIST"

if [ -f icon.png ]; then
  echo "› building icon"
  ICONTMP=$(mktemp -d)
  ICONSET="$ICONTMP/riffle.iconset"
  mkdir -p "$ICONSET"
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
    sips -z "$((s*2))" "$((s*2))" icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/droplet.icns"
  rm -rf "$ICONTMP"
  # osacompile ships an Assets.car whose CFBundleIconName wins over
  # droplet.icns — drop both so the custom icon is used.
  rm -f "$APP/Contents/Resources/Assets.car"
  "$PLIST_BUDDY" -c "Delete :CFBundleIconName" "$PLIST" 2>/dev/null || true
fi

echo "› registering with LaunchServices"
"$LSREGISTER" -f "$APP" || true

echo "✓ built $(pwd)/$APP"
echo "  Set it as your default opener: right-click a .md, .sql, .json, .csv or .diff file → Get Info →"
echo "  Open with → Riffle → Change All. (See README.md.)"
