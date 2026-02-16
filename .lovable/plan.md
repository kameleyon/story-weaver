
# Force Hypereal nano-banana-pro for All Image Regeneration

## Problem
The `regenerate-image` handler in `generate-video/index.ts` still uses Replicate as a fallback when Hypereal fails. You want Hypereal `nano-banana-pro` to be the only provider for both "Regenerate New Image" (T2I) and "Apply Edit" (img2img) — no Replicate fallback.

## Changes

**File: `supabase/functions/generate-video/index.ts`**

### 1. Force `useProModel = true` always (~line 4658)
Change from `isPremiumRequiredStyle` to `true` so `nano-banana-pro` is always used.

### 2. Remove Replicate fallback from T2I regeneration (~lines 4717-4738)
- Remove the `else` branch that calls `generateImageWithReplicate`
- Remove the Replicate fallback when Hypereal fails (line 4733)
- If Hypereal fails, throw an error instead of falling back

### 3. Remove Replicate fallback from Apply Edit (~lines 4801-4814)
- Remove the Replicate `editImageWithReplicatePro` fallback block
- If Hypereal img2img fails, fall through to T2I via Hypereal only (not Replicate)

### 4. Reduce batch size and increase stagger (bulk generation, ~line 4002/4039)
- Batch size: change to `2` for all models
- Stagger delay: change from `1500ms` to `3000ms`

### 5. Redeploy `generate-video` edge function

## Summary Table

| Setting | Before | After |
|---------|--------|-------|
| Regenerate model | nano-banana-pro (premium) / nano-banana (standard) | nano-banana-pro (always) |
| T2I fallback | Replicate | None (error if Hypereal fails) |
| Apply Edit fallback | Replicate img2img | None (falls to Hypereal T2I only) |
| Batch size | 3-5 | 2 |
| Stagger delay | 1.5s | 3s |
