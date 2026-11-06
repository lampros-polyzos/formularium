#!/bin/sh
# Turns on the repository's git hooks (the secret check before every commit). Run once per clone:  sh scripts/install-hooks.sh
cd "$(git rev-parse --show-toplevel)" || exit 1
git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null
echo "Git hooks are on: commits are now checked for secrets."
