

# Fix: Resilient Video Generation Pipeline

## Root Cause

The video generation phase (Phase 4) uses `Promise.all` to process scenes in batches of 3. **If any single scene fails or times out, `Promise.all` rejects immediately**, killing all other scenes in that batch and skipping all remaining batches entirely. This is why you see scattered missing videos (scenes 3, 5, 6, 8-12) -- they span multiple batches, and one failure per batch killed the rest.

The pattern:
- Batch 1: scenes 0, 1, 2 -- scene 2 (scene 3) failed, killed batch
- Batch 2: scenes 3, 4, 5 -- scene 4 (scene 5) failed, killed batch
- ...and so on

## Fix: Replace `Promise.all` with `Promise.allSettled`

### File: `src/hooks/useGenerationPipeline.ts`

**Change 1: Initial generation video phase (lines ~453-461)**

Replace `Promise.all` with `Promise.allSettled` so that one scene's failure doesn't abort the others. After all batches complete, check if any scenes still lack video and retry them individually (up to 2 full retry rounds). Only fail the entire generation if scenes are still missing after retries.

```
// Process in concurrent batches (fault-tolerant)
for (let batchStart = 0; batchStart < cSceneCount; batchStart += VIDEO_CONCURRENCY) {
  const batch = [];
  for (let i = batchStart; i < Math.min(batchStart + VIDEO_CONCURRENCY, cSceneCount); i++) {
    batch.push(generateVideoForScene(i));
  }
  await Promise.allSettled(batch); // NOT Promise.all
}

// Retry pass: re-attempt any scenes that failed
const MAX_RETRY_ROUNDS = 2;
for (let round = 0; round < MAX_RETRY_ROUNDS; round++) {
  // Re-fetch latest scene data from DB to check actual state
  const { data: latestGen } = await supabase
    .from("generations")
    .select("scenes")
    .eq("id", cGenerationId)
    .maybeSingle();
  const latestScenes = normalizeScenes(latestGen?.scenes) ?? [];
  const missing = latestScenes
    .map((s, i) => (!s.videoUrl && s.imageUrl ? i : -1))
    .filter((i) => i >= 0);
  if (missing.length === 0) break;

  // Retry missing scenes one at a time
  for (const idx of missing) {
    await generateVideoForScene(idx).catch(() => {});
  }
}
```

**Change 2: `generateVideoForScene` -- catch errors instead of throwing (lines ~421-443)**

Wrap the function body so a single scene failure logs a warning but doesn't kill the batch. The retry pass above handles recovery.

```
const generateVideoForScene = async (sceneIdx: number) => {
  try {
    // ... existing polling logic, but on timeout:
    // log warning instead of throwing
  } catch (err) {
    console.warn(`[VIDEO] Scene ${sceneIdx + 1} failed: ${err}`);
    // Don't throw -- let other scenes in batch continue
  }
};
```

**Change 3: Resume video phase (lines ~774-803)**

Apply the same `Promise.allSettled` + retry pattern to the `resumeCinematic` function's video phase, so resumed generations are equally resilient.

**Change 4: After all retries, re-fetch scenes from DB before finalize**

Currently the pipeline uses locally-tracked scene data for the finalize step. After retries, it should re-fetch the latest generation record from the database to pick up any `videoUrl`s that were written by completed predictions, ensuring the finalize step has the most up-to-date data.

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| Batch error handling | `Promise.all` -- 1 failure kills all | `Promise.allSettled` -- failures isolated |
| Scene timeout | Hard throw, aborts pipeline | Caught, logged, scene retried later |
| Retry mechanism | None (auto-recovery on next page load) | 2 automatic retry rounds in same session |
| DB re-fetch before finalize | No | Yes -- picks up async completions |

## Files Modified

- `src/hooks/useGenerationPipeline.ts` -- Both the initial cinematic pipeline and `resumeCinematic` function

No backend changes needed. The edge function already handles re-polling correctly.

