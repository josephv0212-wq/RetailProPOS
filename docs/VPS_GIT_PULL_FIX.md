# Fix Git Pull Conflicts on VPS

If you get errors when running `git pull` on your VPS, follow these steps:

## Error Message
```
error: Your local changes to the following files would be overwritten by merge:
        client/.env
        server/.env
        server/server.js
error: The following untracked working tree files would be overwritten by merge:
        .env
```

## Solution

### Step 1: Save your local .env files (IMPORTANT!)
```bash
# Backup your environment files
cp .env .env.backup
cp client/.env client/.env.backup
cp server/.env server/.env.backup
```

### Step 2: Stash local changes to server.js
```bash
# Stash changes (saves them temporarily)
git stash push -m "VPS local changes" server/server.js
```

### Step 3: Remove .env files from git tracking (if they were tracked)
```bash
# Remove .env files from git (but keep local copies)
git rm --cached .env 2>/dev/null || true
git rm --cached client/.env 2>/dev/null || true
git rm --cached server/.env 2>/dev/null || true
```

### Step 4: Move untracked .env file
```bash
# Move the root .env file if it exists
if [ -f .env ]; then
  mv .env .env.local
fi
```

### Step 5: Pull the latest changes
```bash
git pull
```

### Step 6: Restore your .env files
```bash
# Restore your environment files
if [ -f .env.backup ]; then
  mv .env.backup .env
fi
if [ -f client/.env.backup ]; then
  mv client/.env.backup client/.env
fi
if [ -f server/.env.backup ]; then
  mv server/.env.backup server/.env
fi
```

### Step 7: Check if you need to reapply server.js changes
```bash
# Check what was stashed
git stash list

# If you had important changes in server.js, you can view them:
git stash show -p

# If you need to reapply (be careful - may have conflicts):
# git stash pop
```

## Quick One-Liner Solution (if you don't care about local changes)

**⚠️ WARNING: This will discard local changes to server.js!**

```bash
# Backup .env files first!
cp .env .env.backup 2>/dev/null || true
cp client/.env client/.env.backup 2>/dev/null || true
cp server/.env server/.env.backup 2>/dev/null || true

# Discard changes and pull
git reset --hard HEAD
git clean -fd
git pull

# Restore .env files
mv .env.backup .env 2>/dev/null || true
mv client/.env.backup client/.env 2>/dev/null || true
mv server/.env.backup server/.env 2>/dev/null || true
```

## Prevention

To prevent this in the future, ensure `.env` files are in `.gitignore`:

```bash
# Check if .env is ignored
git check-ignore -v .env client/.env server/.env

# If not ignored, add to .gitignore (already done in the repo)
```

## Notes

- `.env` files should NEVER be committed to git (they contain secrets)
- Always backup your `.env` files before pulling
- If `server/server.js` has local changes you need, review them before stashing
- The `.gitignore` file has been updated to ignore all `.env` files

