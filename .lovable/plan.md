
# Fix Desktop Browser Crash During Long Video Export

## Problem Analysis

The user is experiencing complete browser crashes (Chrome) when exporting long videos (2-5 minutes). This is caused by **memory exhaustion** and **main thread blocking** during the export process.

### Root Causes Identified

1. **Insufficient yielding frequency**: The current code only yields to the UI every 10 frames. For a 2-minute video at 30fps (3,600 frames), that's only 360 yield points - not enough to prevent browser lockup.

2. **No encoder queue backpressure**: The VideoEncoder can queue frames faster than it can process them. Without monitoring `encodeQueueSize`, frames pile up in memory.

3. **No audio encoder backpressure**: Audio chunks are being added without waiting for the encoder to catch up.

4. **Large temporary arrays**: The interleaved audio `rawData` arrays for each scene are created but not explicitly cleaned up, accumulating memory.

5. **No memory release during processing**: VideoFrame objects and AudioData objects are closed but garbage collection may lag behind creation rate.

---

## Solution Overview

Implement a **memory-safe export pipeline** with:
- Aggressive yielding and backpressure management
- Encoder queue monitoring to pause frame creation when queues are full
- Explicit garbage collection hints
- Chunked processing with memory checkpoints
- Progress-based memory warnings

---

## Implementation Details

### 1. Add Backpressure Control for Video Encoder

```text
Before encoding each frame, check if the encoder queue is backing up:
- If encodeQueueSize > 10, pause and wait for the queue to drain
- This prevents memory from accumulating with pending frames
```

### 2. Add Backpressure Control for Audio Encoder  

```text
After encoding audio chunks for each scene:
- Flush the audio encoder before moving to the next scene
- This ensures audio data doesn't pile up in memory
```

### 3. Increase Yielding Frequency

```text
Current: Yield every 10 frames
New: Yield every 5 frames AND add longer yields (16ms) every 30 frames
This allows the browser to run garbage collection and update UI
```

### 4. Add Explicit Memory Cleanup Between Scenes

```text
After processing each scene:
- Clear references to loaded images
- Force a longer yield (50ms) to allow garbage collection
- Log memory usage if available
```

### 5. Chunk Audio Processing

```text
Current: Process all audio for a scene at once
New: Process audio in smaller chunks with yields between them
```

### 6. Add Export Memory Warning

```text
Monitor export progress and show warnings if:
- Export is taking unusually long (suggest browser refresh)
- Memory pressure is detected (if Performance API available)
```

---

## Technical Changes

### File: `src/hooks/useVideoExport.ts`

**A. Enhanced yield helper with longer pauses:**
```typescript
const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const longYield = () => new Promise<void>((resolve) => setTimeout(resolve, 16)); // One frame
const gcYield = () => new Promise<void>((resolve) => setTimeout(resolve, 50)); // Allow GC
```

**B. Backpressure helper for video encoder:**
```typescript
const waitForEncoderDrain = async (encoder: VideoEncoder, maxQueue = 10) => {
  while (encoder.encodeQueueSize > maxQueue) {
    await longYield();
  }
};
```

**C. Modified frame encoding loop:**
```typescript
// Inside the frame loop (line ~363-435)
for (let f = 0; f < sceneFrames; f++) {
  // ... existing frame rendering code ...
  
  // Wait for encoder to catch up if queue is backing up
  await waitForEncoderDrain(videoEncoder, 10);
  
  const frame = new VideoFrame(canvas, { timestamp, duration });
  videoEncoder.encode(frame, { keyFrame });
  frame.close();
  
  globalFrameCount++;

  // More aggressive yielding for long videos
  if (globalFrameCount % 5 === 0) await yieldToUI();
  if (globalFrameCount % 30 === 0) await longYield();
}
```

**D. Scene-level cleanup and audio flushing:**
```typescript
// After processing each scene (after the frame loop)
if (audioEncoder) {
  // Flush audio for this scene to prevent memory buildup
  await audioEncoder.flush();
}

// Clear image references
loadedImages.length = 0;
nextSceneFirstImage = null;

// Allow garbage collection between scenes
await gcYield();

log("Run", runId, `Scene ${i + 1} complete, memory checkpoint`);
```

**E. Add memory warning state:**
```typescript
interface ExportState {
  status: ExportStatus;
  progress: number;
  error?: string;
  warning?: string;  // Already exists - use for memory warnings
  videoUrl?: string;
}

// In the export loop, after processing half the scenes:
if (i === Math.floor(scenes.length / 2)) {
  setState(prev => ({
    ...prev,
    warning: scenes.length > 10 
      ? "Long video export in progress. If browser becomes slow, save your work first."
      : prev.warning
  }));
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useVideoExport.ts` | Add backpressure control, increase yielding, add memory cleanup between scenes |

---

## Testing Recommendations

After implementation:
1. Test with a short video (30 seconds) to ensure no regressions
2. Test with a medium video (1-2 minutes) to verify smooth export
3. Test with a long video (3+ minutes) to confirm the crash is fixed
4. Monitor browser memory usage during export (Chrome DevTools > Performance Monitor)

---

## Expected Outcome

- Long video exports will complete without crashing
- Export may take slightly longer due to backpressure management
- Browser remains responsive during export
- Progress bar updates smoothly throughout
