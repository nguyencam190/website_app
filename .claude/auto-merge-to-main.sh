#!/bin/bash
# Auto cherry-pick new commits from current branch to main after Claude stops.
# Outputs JSON systemMessage to notify the user.

REPO_DIR=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO_DIR" || exit 0

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0

# Only run on the feature branch, not on main itself
if [ "$CURRENT_BRANCH" = "main" ]; then
  exit 0
fi

# Fetch latest main
git fetch origin main --quiet 2>/dev/null || true

# Count commits on current branch ahead of main
AHEAD=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')

if [ "$AHEAD" -eq 0 ]; then
  exit 0
fi

# Get list of new commit hashes (oldest first)
COMMITS=$(git log origin/main..HEAD --reverse --format="%H" 2>/dev/null)
SUBJECTS=$(git log origin/main..HEAD --reverse --format="- %s" 2>/dev/null)

# Create a temp branch from latest main
TEMP_BRANCH="_automerge_$$"
git checkout -b "$TEMP_BRANCH" origin/main --quiet 2>/dev/null

FAILED=0
MERGED=0
for COMMIT in $COMMITS; do
  # Skip if equivalent content already in main (cherry-picked with different hash)
  if git cherry-pick "$COMMIT" --quiet 2>/dev/null; then
    MERGED=$((MERGED+1))
  else
    # Check if this is an empty cherry-pick (content already present)
    if git diff --cached --quiet 2>/dev/null && [ "$(git status --porcelain 2>/dev/null)" = "" ]; then
      git cherry-pick --skip 2>/dev/null || true
    else
      git cherry-pick --abort 2>/dev/null || true
      FAILED=1
      break
    fi
  fi
done

# Return to original branch
git checkout "$CURRENT_BRANCH" --quiet 2>/dev/null

if [ "$FAILED" -eq 1 ]; then
  git branch -D "$TEMP_BRANCH" --quiet 2>/dev/null || true
  MSG="⚠️ Auto-merge thất bại (conflict). Cần merge thủ công vào main."
  printf '{"systemMessage": "%s"}' "$MSG"
  exit 0
fi

# Push temp branch to main
if git push origin "$TEMP_BRANCH:main" --quiet 2>/dev/null; then
  git branch -D "$TEMP_BRANCH" --quiet 2>/dev/null || true
  # Also update the remote tracking for the current branch
  git push origin "$CURRENT_BRANCH" --quiet 2>/dev/null || true
  printf '{"systemMessage": "✅ Đã tự động cập nhật %s commit mới vào main:\n%s"}' "$AHEAD" "$SUBJECTS"
else
  git branch -D "$TEMP_BRANCH" --quiet 2>/dev/null || true
  MSG="⚠️ Push to main thất bại (branch protection?). Đã push feature branch, merge thủ công."
  printf '{"systemMessage": "%s"}' "$MSG"
fi
