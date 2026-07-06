#!/bin/bash
# Opens the in-browser test suite in the default browser (via tests.html redirect).
cd "$(dirname "$0")/.."
# Open via tests.html: LaunchServices sometimes drops ?query from file:// URLs,
# and tests.html's JS redirect (location.replace) carries it reliably.
open tests.html
