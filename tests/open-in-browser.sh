#!/bin/bash
# Opens the in-browser test suite (viewer.html?test=1) in the default browser.
cd "$(dirname "$0")/.."
python3 -c "import pathlib,subprocess; subprocess.run(['open', pathlib.Path('viewer.html').resolve().as_uri() + '?test=1'])"
