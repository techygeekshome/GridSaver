#!/usr/bin/env bash
# Builds the release packages into dist/.
#   GridSaver.zip          Chrome, Edge, Brave, Opera, Vivaldi (unzip, then Load unpacked)
#   GridSaver-chrome.zip   same files, named for Chrome users
#   GridSaver-edge.zip     same files, named for Edge users
#   GridSaver-firefox.zip  Firefox package (Firefox manifest, files at the root)
set -euo pipefail
cd "$(dirname "$0")"
FILES="background.js bridge.js config.js extract.js hook.js results.css results.html results.js scan.js site.js zip.js icons"
OUT=dist; TMP=$(mktemp -d)
mkdir -p "$OUT"
rm -f "$OUT"/GridSaver*.zip

mkdir "$TMP/grid-saver"
cp -r $FILES manifest.json "$TMP/grid-saver/"
(cd "$TMP" && zip -qr -X pkg.zip grid-saver)
for n in GridSaver GridSaver-chrome GridSaver-edge; do cp "$TMP/pkg.zip" "$OUT/$n.zip"; done

mkdir "$TMP/ff"
cp -r $FILES "$TMP/ff/"
cp manifest.firefox.json "$TMP/ff/manifest.json"
(cd "$TMP/ff" && zip -qr -X ../ff.zip .)
cp "$TMP/ff.zip" "$OUT/GridSaver-firefox.zip"

rm -r "$TMP"
ls -l "$OUT"
