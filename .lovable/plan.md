

# Fix Cinematic Export: Mobile Download/Share + Dark Frames

## Problem Summary

The `useCinematicExport` hook has two critical gaps compared to the battle-tested `useVideoExport`:

1. **Download button broken on mobile** -- uses a naive `<a>` anchor click that fails on iOS Safari, iOS Chrome, and Android
2. **Dark frames for later scenes** -- insufficient yielding (every 200 frames vs every 5) and no per-scene audio flush causes memory pressure and decoder stalls on mobile

## Changes (single file: `src/hooks/useCinematicExport.ts`)

### 1. Port the mobile-aware `downloadVideo` from `useVideoExport`

Replace the current 5-line naive download with the full platform-aware logic:

- **iOS Safari**: Try Web Share API first, then data URL fallback, then manual save alert
- **iOS Chrome**: Try Web Share API, then navigate to blob URL (`window.location.href`)
- **Android**: Try Web Share API, then blob anchor with cleanup timeout
- **Desktop**: Standard anchor download

### 2. Increase yielding frequency during encoding

Change from yielding every 200 frames to every 5 frames (matching `useVideoExport`), plus a `longYield` (16ms) every 30 frames. This prevents the browser from killing the tab during long exports.

### 3. Add per-scene audio encoder flush

After encoding each scene's audio+video, flush the audio encoder (matching `useVideoExport`). This releases encoded audio buffers between scenes instead of accumulating them all in memory.

### 4. Add GC yield between scenes

Add a 50ms garbage collection yield between scenes (matching `useVideoExport`) to let the browser reclaim memory from the previous scene's video element and cached frames.

## Technical Details

```text
downloadVideo changes:
  BEFORE: Simple anchor click (5 lines)
  AFTER:  Platform-aware chain (65 lines, ported from useVideoExport)
    iOS -> Share API -> iOS Chrome blob nav -> Safari data URL -> alert
    Android -> Share API -> blob anchor -> alert
    Desktop -> anchor download -> window.open fallback

Yielding changes:
  BEFORE: yield every 200 frames
  AFTER:  yieldToUI every 5 frames, longYield every 30 frames

Memory management:
  BEFORE: No per-scene audio flush, no GC yield
  AFTER:  audioEncoder.flush() per scene + 50ms gcYield between scenes
```

## Files Modified

- `src/hooks/useCinematicExport.ts` -- All four changes above

