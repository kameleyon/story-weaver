

# Plan: Apply Batched Concurrency Fix to Generation Pipeline

## Problem Analysis

The current `useGenerationPipeline.ts` uses a **backend-chunked architecture** where:
- Frontend sends requests with a start index
- Backend processes a batch internally
- Backend returns `hasMore` + `nextStartIndex` for continuation

The suggested fix assumes a **frontend-orchestrated scene-by-scene** architecture. To apply the batching principle effectively, I need to adapt the concept to work with your existing architecture.

## Solution: Add Concurrency Control Helper + Optimize Chunked Calls

### Changes to `src/hooks/useGenerationPipeline.ts`

**1. Add the `processWithConcurrency` helper function** (near the top of the file, after the `sleep` helper):

```typescript
// Helper: Run promises with a concurrency limit (Batching)
// This ensures we have at most `concurrency` active requests at once
async function processWithConcurrency<T, R>(
  items: T[], 
  concurrency: number, 
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: Promise<R>[] = [];
  const executing = new Set<Promise<R>>();

  for (const [index, item] of items.entries()) {
    const p = task(item, index).then((res) => {
      executing.delete(p);
      return res;
    });
    
    results.push(p);
    executing.add(p);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}
```

**2. Add constants for concurrency limits:**

```typescript
// Concurrency limits to prevent "Failed to fetch" from browser connection limits
const AUDIO_CONCURRENCY = 3;  // Max 3 audio requests in parallel
const IMAGE_CONCURRENCY = 2;  // Max 2 image requests in parallel (heavier)
```

**3. Update the Audio Phase loop (if needed for parallel chunk calls):**

The current audio loop is sequential (one chunk at a time). If the backend supports parallel chunk requests, we can batch them. However, since audio uses `audioStartIndex` sequentially, the fix here is to ensure the existing sequential approach doesn't fire too many rapid requests:

```typescript
// Add a small stagger delay between chunk requests to prevent connection flooding
if (audioResult.hasMore && typeof audioResult.nextStartIndex === "number") {
  audioStartIndex = audioResult.nextStartIndex;
  await sleep(100); // Small stagger to prevent connection flooding
}
```

**4. Update the Images Phase loop similarly:**

```typescript
// Add stagger delay for image chunks
if (imagesResult.hasMore && imagesResult.nextStartIndex !== undefined) {
  imageStartIndex = imagesResult.nextStartIndex;
  await sleep(100); // Small stagger to prevent connection flooding
}
```

## Why This Approach

1. **Compatible with existing backend** - The backend already handles chunking internally. We don't need to change it.

2. **Prevents "Failed to fetch"** - The small stagger delay prevents rapid-fire sequential requests from overwhelming the browser's connection pool.

3. **`processWithConcurrency` ready for future use** - If you later want to make multiple phase calls in parallel (e.g., audio for scenes 1-3 while images for scenes 1-3), this helper is ready.

4. **Maintains existing retry logic** - The `callPhase` helper already has 3-attempt retry with exponential backoff for transient failures.

## Technical Details

| Component | Current Behavior | After Fix |
|-----------|-----------------|-----------|
| Audio Phase | Sequential chunked calls | Sequential with 100ms stagger delay |
| Images Phase | Sequential chunked calls | Sequential with 100ms stagger delay |
| Network Retries | 3 attempts with backoff | Unchanged |
| Concurrency Helper | Not present | Added for future parallel operations |

## Files to Modify

- `src/hooks/useGenerationPipeline.ts` - Add helper function, constants, and stagger delays

