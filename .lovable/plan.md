

# Slow-Motion Stretch: Seamless Video-to-Audio Matching

## The Problem

When audio narration is longer than the video clip (e.g., 5s video vs 12s audio), the current forward-loop causes a visible **jump cut** when the video restarts from the beginning. Boomerang (reverse) looks unnatural. Both break immersion.

## The Solution: Cinematic Slow-Motion

Instead of looping or reversing, **slow the video down** to fill the audio duration naturally. A 5s clip stretched to 12s plays at ~0.4x speed -- which actually looks **more cinematic**, like a professional slow-motion shot.

```text
Current (Forward Loop - jumpy):
Video:  [1 2 3 4 5] [1 2 3 4 5] [1 2]
Audio:  [-------- narration continues --------]
                    ^ visible restart

New (Slow-Motion Stretch - smooth):
Video:  [1 . 1 . 2 . 2 . 3 . 3 . 4 . 4 . 5 . 5]
Audio:  [-------- narration continues -----------]
         No jumps, no reverse, just smooth slow-mo
```

If the stretch ratio is extreme (video would need to play at less than 0.25x, i.e., audio is 4x+ longer than the clip), the system caps slow-motion at 0.25x and **freezes the last frame** for the remaining time -- which looks like a deliberate cinematic hold.

## What Changes

**File: `src/hooks/useCinematicExport.ts`**

1. **Replace `encodeLoopedFrames`** with a new `encodeSlowMotionFrames` function:
   - Calculates playback rate: `videoLength / audioLength`
   - Maps each output frame to a source frame index using the slowed rate
   - Caps minimum speed at 0.25x; beyond that, holds the last frame
   - No loops, no reversals -- every frame moves forward or holds still

2. **Keep `preCacheVideoFrames` as-is** -- it already caches all unique source frames into memory, which is exactly what slow-motion needs (just indexes them differently)

3. **No other files change** -- the export API, UI, upload, and retry logic all remain identical

## Technical Detail

```text
Playback rate = min(1.0, videoLength / targetDuration)
Capped at: max(0.25, playbackRate)

For each output frame:
  sourceTime = outputFrame * playbackRate / fps
  sourceIndex = floor(sourceTime * fps)
  if sourceIndex >= cachedFrames.length:
    sourceIndex = cachedFrames.length - 1  // freeze last frame
```

## Performance Impact

No change to export speed -- the bottleneck (pre-caching via seeking) stays the same, and encoding from cached bitmaps is already near-instant. The only difference is the frame index mapping math, which is trivial.

