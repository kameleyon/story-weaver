

# Fix: Hypereal Video Rate Limit Death Spiral + Concurrency Reduction

## What's happening

The video phase polls Hypereal for status on **3 scenes simultaneously**, each every **2 seconds**. That's ~1.5 requests/second to their API, which triggers 429 rate limits. The backend treats 429 as "still processing" (returns `null`), so the client immediately retries -- creating an infinite loop of rejected requests. The logs show continuous 429 errors for all active job IDs.

Your current generation has 17 scenes with images, but only 7 have videos -- the other 10 are stuck in this 429 loop.

The "duplicate" thumbnails you circled are not actual duplicates in the data -- each scene has exactly 1 unique image. The similar-looking scenes (Melvin's rage, whistle, red card) just look alike because they have similar visual descriptions.

## The Fix (3 changes)

### 1. Frontend: Reduce video concurrency and increase poll interval

**File: `src/hooks/generation/cinematicPipeline.ts`**

- Change `VIDEO_CONCURRENCY` from **3 to 1** (both in initial generation and resume paths)
- Change video poll sleep from **2000ms to 8000ms** (video generation takes minutes, fast polling adds zero value)
- Respect `retryAfterMs` from backend response when present

### 2. Backend: Add server-side throttle and return backoff hints on 429

**File: `supabase/functions/generate-cinematic/index.ts`**

In `resolveHyperealVideo` function (~line 994):
- Add a 1-second delay before each Hypereal poll fetch (server-side throttle)
- On 429 response, instead of just returning `null`, return a special marker so the video phase handler can tell the client to wait longer

In the video phase handler (~line 1782-1840):
- When 429 is detected, respond with `retryAfterMs: 15000` to tell the client to wait 15 seconds
- When `null` (still processing), respond with `retryAfterMs: 8000`

### 3. Backend: Don't clear videoPredictionId on SEEDANCE_TIMEOUT_RETRY

Currently line 1828 clears `videoPredictionId` on retry, which causes a **new** video job to be created on the next poll -- wasting credits and creating orphan jobs on Hypereal's side. Instead, keep the prediction ID and just increment the retry counter so the same job keeps being polled.

## Summary

| What | Before | After |
|------|--------|-------|
| Video concurrency | 3 scenes at once | 1 scene at a time |
| Poll interval | 2 seconds | 8 seconds (15s on 429) |
| Server throttle | None | 1s delay before each Hypereal poll |
| Retry behavior | Clears prediction, starts new job | Keeps polling same job with backoff |
| API load | ~1.5 req/s | ~0.12 req/s (12x reduction) |

## Files Modified

- `src/hooks/generation/cinematicPipeline.ts` -- concurrency and poll timing
- `supabase/functions/generate-cinematic/index.ts` -- server throttle, backoff hints, retry logic

## Technical Details

### `src/hooks/generation/cinematicPipeline.ts`

**`runCinematicVideo` (line 156):**
```text
VIDEO_CONCURRENCY = 3  -->  VIDEO_CONCURRENCY = 1
await sleep(2000)      -->  await sleep(vidRes.retryAfterMs || 8000)
```

**`resumeCinematicPipeline` video section (line 357):**
Same changes: concurrency 1, dynamic sleep with backoff.

### `supabase/functions/generate-cinematic/index.ts`

**`resolveHyperealVideo` (line 994):**
```text
// Add before the fetch call:
await new Promise(r => setTimeout(r, 1000));

// On 429, return "RATE_LIMITED" constant instead of null
if (response.status === 429) return "RATE_LIMITED";
```

**Video phase handler (line 1833):**
```text
// When resolveHyperealVideo returns null:
return { success: true, status: "processing", retryAfterMs: 8000 }

// When it returns "RATE_LIMITED":
return { success: true, status: "processing", retryAfterMs: 15000 }
```

**SEEDANCE_TIMEOUT_RETRY handler (line 1828):**
```text
// STOP clearing videoPredictionId -- keep polling the same job
// Only increment videoRetryCount for tracking
scenes[idx] = { ...scene, videoRetryCount: retryCount };
```
