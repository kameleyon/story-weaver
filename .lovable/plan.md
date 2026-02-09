
# Add Crossfade Transitions Between Cinematic Scenes

## What Changes

Smooth 0.5-second crossfade transitions will be added between scenes, replacing the current hard cuts. The last frame of each scene will blend into the first frame of the next scene using canvas alpha compositing.

## How It Works

```text
Scene 1                          Scene 2
[... normal frames ... FADE OUT] [FADE IN ... normal frames ...]
                       |---------|
                       ~0.5s crossfade
                       Previous scene's last frame: opacity 1 -> 0
                       Current scene's first frame:  opacity 0 -> 1
```

The crossfade happens within the existing scene duration (not added on top), so audio sync is preserved.

## Technical Details

**File: `src/hooks/useCinematicExport.ts`**

1. **Track the previous scene's last frame**: Before cleaning up cached frames at the end of each scene, save the last `ImageBitmap` as `prevSceneLastFrame` for use in the next scene's crossfade.

2. **Update `encodeSlowMotionFrames` signature** to accept:
   - `fadeInBitmap: ImageBitmap | null` -- the previous scene's last frame
   - `canvas: HTMLCanvasElement` and `ctx: CanvasRenderingContext2D` -- needed for compositing

3. **Crossfade rendering logic** inside `encodeSlowMotionFrames`:
   - Calculate `crossfadeFrames = Math.ceil(fps * 0.5)` (~15 frames at 30fps)
   - For the first `crossfadeFrames` of each scene (except scene 1):
     - Clear canvas to black
     - Draw `fadeInBitmap` (outgoing scene) with `globalAlpha = 1 - (frame / crossfadeFrames)`
     - Draw current scene's frame with `globalAlpha = frame / crossfadeFrames`
     - Reset `globalAlpha = 1.0`
     - Create `VideoFrame` from the composited canvas instead of directly from the bitmap
   - For all other frames, encode normally from the cached bitmap as before

4. **Cleanup**: Close the saved `prevSceneLastFrame` bitmap after it's used (or at the end of export).
