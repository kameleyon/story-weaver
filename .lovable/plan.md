
# Fix Dead Space/Pauses Between Scenes

## Problem Analysis
The video export has noticeable pauses between scenes caused by:
- A 0.5-second buffer added to each scene's duration after audio generation
- Math.ceil rounding adding additional padding (up to 0.9s more)
- No visual transition between scenes (only between images within a scene)

For a 6-scene video, this creates approximately **3-8 seconds of total dead time**.

## Solution

### 1. Reduce Backend Duration Buffer
**File:** `supabase/functions/generate-video/index.ts`

Change the duration calculation to use minimal padding:
- Remove the 0.5s buffer
- Use `Math.round` instead of `Math.ceil` for tighter timing

```text
Before:
scenes[index].duration = Math.ceil(result.durationSeconds + 0.5);

After:
scenes[index].duration = Math.round(result.durationSeconds * 10) / 10; // Round to 0.1s precision
```

### 2. Use Actual Audio Duration in Video Export
**File:** `src/hooks/useVideoExport.ts`

Update the scene duration calculation to prefer the actual decoded audio length over the stored duration:

```text
Before:
const sceneDuration = Math.max(audioDur, scene.duration || 3);

After:
// Use actual audio duration if available, otherwise fall back to scene duration
const sceneDuration = audioDur > 0 ? audioDur : (scene.duration || 3);
```

### 3. Add Crossfade Between Scenes
**File:** `src/hooks/useVideoExport.ts`

Add a visual crossfade between the last frame of one scene and the first frame of the next:

- Pre-load the first image of the next scene
- During the last 0.3-0.5 seconds of the current scene, fade in the next scene's first image
- This creates seamless visual transitions between scenes

## Technical Details

### Duration Fix
- Removes artificial padding that creates silence
- Keeps audio-to-video sync tight
- Falls back to minimal duration (3s) only when no audio exists

### Scene Crossfade Implementation
- Fade window: 0.3 seconds (9-12 frames depending on FPS)
- During fade: blend current scene's last image with next scene's first image
- Maintains existing intra-scene image transitions

## Files to Modify
1. `supabase/functions/generate-video/index.ts` - Reduce duration padding
2. `src/hooks/useVideoExport.ts` - Use actual audio duration and add scene crossfades

## Expected Outcome
- Eliminates 0.5-1.4 seconds of dead space per scene
- Smooth visual transitions between all scenes
- Total video length reduced by ~3-8 seconds for a typical project
- More professional, broadcast-quality output
