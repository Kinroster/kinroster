#!/usr/bin/env bash
# PreToolUse hook for Bash: blocks `gh pr create` if tsc or lint fail.
# Reads the tool input JSON from stdin to find the command.
set -u

input=$(cat)
cmd=$(echo "$input" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

# Only intercept gh pr create.
case "$cmd" in
  *"gh pr create"*) ;;
  *) exit 0 ;;
esac

# Ensure a modern Node (>=18) runs the checks. Hooks can inherit a PATH that
# resolves `node` to an old version (e.g. an nvm v16), which breaks ESLint 9
# with "structuredClone is not defined". Find a newer node if needed.
node_major() {
  "${1:-node}" -e 'process.stdout.write(String(process.versions.node.split(".")[0]||"0"))' 2>/dev/null || echo 0
}

if [ "$(node_major)" -lt 18 ]; then
  found=""
  # Prefer any node already on PATH that is new enough.
  for candidate in $(command -v -a node 2>/dev/null || which -a node 2>/dev/null); do
    if [ "$(node_major "$candidate")" -ge 18 ]; then
      found="$candidate"
      break
    fi
  done
  # Fall back to scanning nvm-installed versions.
  if [ -z "$found" ] && [ -d "$HOME/.nvm/versions/node" ]; then
    for dir in $(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -rV); do
      candidate="$HOME/.nvm/versions/node/$dir/bin/node"
      if [ -x "$candidate" ] && [ "$(node_major "$candidate")" -ge 18 ]; then
        found="$candidate"
        break
      fi
    done
  fi
  if [ -n "$found" ]; then
    export PATH="$(dirname "$found"):$PATH"
  else
    echo "❌ Pre-PR check: could not find Node >=18 (current: $(node --version 2>/dev/null)). Install/select a newer Node and retry." >&2
    exit 2
  fi
fi

echo "Running pre-PR checks (tsc + lint) with $(node --version)..." >&2

if ! pnpm exec tsc --noEmit >&2; then
  echo "❌ Pre-PR check failed: TypeScript errors. Fix, then retry." >&2
  exit 2
fi

if ! pnpm lint >&2; then
  echo "❌ Pre-PR check failed: lint errors. Fix, then retry." >&2
  exit 2
fi

echo "✅ Pre-PR checks passed." >&2
exit 0
