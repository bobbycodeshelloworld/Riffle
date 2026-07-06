#!/bin/bash
# build.sh — compile "MD+SQL Viewer.app" from launcher.applescript, bundle
# viewer.html + the seed helper inside it, and register it as a handler for
# BOTH Markdown (.md/.markdown/.mdown/.mkd) and SQL (.sql) files.
# Re-run any time you edit viewer.html.
set -euo pipefail
cd "$(dirname "$0")"

APP="MD+SQL Viewer.app"
PLIST_BUDDY="/usr/libexec/PlistBuddy"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

echo "› compiling $APP"
rm -rf "$APP"
osacompile -o "$APP" launcher.applescript

echo "› bundling resources"
cp ../viewer.html "$APP/Contents/Resources/viewer.html"
cp seed-and-open.sh "$APP/Contents/Resources/seed-and-open.sh"
chmod +x "$APP/Contents/Resources/seed-and-open.sh"

echo "› patching Info.plist (declare .md + .sql document types)"
PLIST="$APP/Contents/Info.plist"
"$PLIST_BUDDY" -c "Set :CFBundleName MD+SQL Viewer" "$PLIST" 2>/dev/null \
  || "$PLIST_BUDDY" -c "Add :CFBundleName string 'MD+SQL Viewer'" "$PLIST"
"$PLIST_BUDDY" -c "Set :CFBundleIdentifier com.vanovian.mdsqlviewer" "$PLIST" 2>/dev/null \
  || "$PLIST_BUDDY" -c "Add :CFBundleIdentifier string com.vanovian.mdsqlviewer" "$PLIST"
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

echo "› registering with LaunchServices"
"$LSREGISTER" -f "$APP" || true

echo "✓ built $(pwd)/$APP"
echo "  Set it as your default opener: right-click a .md or .sql file → Get Info →"
echo "  Open with → MD+SQL Viewer → Change All. (See README.md.)"
