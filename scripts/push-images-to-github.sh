#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

LIMIT=$((12 * 1024 * 1024))
part=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
part=$((part + 1))
[[ "$part" -lt 2 ]] && part=2

has_untracked() {
  [[ -n "$(git ls-files --others --exclude-standard assets/img/ 2>/dev/null | head -1)" ]]
}

while has_untracked; do
  sum=0
  added=0
  while IFS= read -r line; do
    kb=${line%%$'\t'*}
    dir=${line#*$'\t'}
    if [[ -n "$(git ls-files --others --exclude-standard "$dir" 2>/dev/null | head -1)" ]]; then
      sum=$((sum + kb))
      git add -- "$dir"
      added=1
      if (( sum >= 12288 )); then break; fi
    fi
  done < <(du -sk assets/img/*/ | sort -n)

  if (( added == 0 )); then
    echo "No untracked image folders left."
    break
  fi

  count=$(git diff --cached --name-only | wc -l | tr -d ' ')
  echo "→ Part $part: $count files (~${sum}KB)..."
  git commit -m "Add image assets (part $part)."
  git -c http.postBuffer=524288000 push origin main
  echo "✓ Part $part done"
  part=$((part + 1))
done

echo "All image batches pushed."
