# OpenClaw Fork - Enhanced Memory Search

This is our fork of [openclaw/openclaw](https://github.com/openclaw/openclaw) with enhanced memory search capabilities.

## What's Changed

Our `feature/enhanced-memory-search` branch adds four enhancements to the built-in hybrid memory search:

### 1. Temporal Routing

Extracts date references from queries ("yesterday", "Feb 8th", "last Monday", ISO dates) and applies a configurable boost (default 3x) to results from files matching those dates.

### 2. Filepath Scoring

Boosts results whose file paths contain query terms. E.g., searching for "timesheet" will boost results from `memory/topics/adb-timesheet.md`.

### 3. Header Scoring

Boosts results whose markdown section headers match query terms.

### 4. Adaptive Weighting

When keyword overlap is very low (< 0.1 threshold), automatically shifts to vector-heavy weights (85% vector) instead of the normal mix. Prevents garbage results on novel/abstract queries.

## Configuration

All new options go under `memorySearch.query.hybrid` in `openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "query": {
          "hybrid": {
            "filepathWeight": 0.25,
            "headerWeight": 0.1,
            "temporalBoost": 3.0,
            "adaptiveEnabled": true,
            "adaptiveKeywordThreshold": 0.1
          }
        }
      }
    }
  }
}
```

## Keeping in Sync with Upstream

```bash
cd /path/to/openclaw-fork

# Add upstream remote (one-time)
git remote add upstream https://github.com/openclaw/openclaw.git

# Fetch upstream changes
git fetch upstream

# Merge upstream main into our branch
git checkout feature/enhanced-memory-search
git merge upstream/main

# Resolve any conflicts in:
#   src/memory/hybrid.ts
#   src/memory/manager.ts
#   src/agents/memory-search.ts

# Push updated fork
git push origin feature/enhanced-memory-search
```

## Building from Source

```bash
npm install
npm run build   # or: npx tsdown
```

## Running from Fork (instead of npm package)

Option 1 - npm link:

```bash
cd /path/to/openclaw-fork
npm run build
npm link
# Now `openclaw` CLI uses fork code
```

Option 2 - direct path in package.json:

```bash
npm install -g /path/to/openclaw-fork
```

## Files Modified

- `src/memory/hybrid.ts` — Core scoring functions (temporal, filepath, header, adaptive)
- `src/memory/manager.ts` — Passes query string and enhanced config to merge
- `src/agents/memory-search.ts` — Config resolution for new options

All changes are backward compatible. Existing configs work unchanged.
