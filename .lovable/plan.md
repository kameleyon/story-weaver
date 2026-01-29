
# Plan: Reduce Images to 3 Per Scene and Optimize Generation Speed

## Problem Summary
The current system generates **4 images per scene** (1 primary + 3 sub-visuals), resulting in 24 images for a 6-scene "short" video. This takes 5+ minutes with Hypereal Pro.

## Your Questions Answered
| Question | Answer |
|----------|--------|
| Haitian Creole + Google TTS? | ✅ Yes - Gemini TTS with 2-model fallback chain |
| Voice being used? | Replicate Chatterbox (Ethan/Marisol) for standard; ElevenLabs for custom |
| Hypereal fallback? | ✅ Yes - Falls back to Replicate nano-banana automatically |
| Subscription checking? | Every 60s in background - does NOT affect generation |

## Solution: Change from 4 to 3 Images Per Scene

### What Changes
Reduce `maxSub` from **3** to **2** sub-visuals per scene:
- Before: 1 primary + 3 sub-visuals = 4 images/scene
- After: 1 primary + 2 sub-visuals = **3 images/scene**

### Expected Results
| Length | Before (4 img/scene) | After (3 img/scene) | Time Saved |
|--------|---------------------|---------------------|------------|
| Short (6 scenes) | 24 images | 18 images | ~25% faster |
| Brief (8 scenes) | 32 images | 24 images | ~25% faster |
| Presentation (16 scenes) | 64 images | 48 images | ~25% faster |

Estimated generation time for "short": **3-4 minutes** (down from 5-6 minutes)

## Technical Implementation

### File: `supabase/functions/generate-video/index.ts`

**Change 1: Script Phase (Doc2Video)** - Around line 2519
```text
// Before
const maxSub = Math.min(scene.subVisuals.length, 3);

// After
const maxSub = Math.min(scene.subVisuals.length, 2);
```

**Change 2: Script Phase (Storytelling)** - Similar location
```text
// Before
const maxSub = Math.min(scene.subVisuals.length, 3);

// After
const maxSub = Math.min(scene.subVisuals.length, 2);
```

**Change 3: Images Phase** - Around line 3416
```text
// Before
const maxSub = Math.min(scene.subVisuals.length, 3);

// After
const maxSub = Math.min(scene.subVisuals.length, 2);
```

**Change 4: Update the comment** - Lines 2513, 3414
```text
// Before
// Calculate total images needed (3-4 images per scene for dynamic visuals)
// Always generate up to 3 sub-visuals for variety (total 4 images per scene max)

// After
// Calculate total images needed (2-3 images per scene for dynamic visuals)
// Generate up to 2 sub-visuals for variety (total 3 images per scene max)
```

## Subscription Checking - No Changes Needed

The 60-second polling is background-only and doesn't block generation. However, to reduce noise:
- Current: `setInterval(checkSubscription, 60000)` (every 60s)
- Keep as-is: This only runs when user is on the page, not during generation

The edge function logs you saw are from the **page reloading/rebuilding** during development, not from the generation pipeline. Once the app is stable, these won't appear during generation.

## Files Modified

1. **supabase/functions/generate-video/index.ts**
   - Line ~2519: Reduce maxSub from 3 to 2 in Doc2Video script phase
   - Line ~2817: Reduce maxSub from 3 to 2 in Storytelling script phase
   - Line ~3416: Reduce maxSub from 3 to 2 in images phase
   - Update comments to reflect the change

## Testing Checklist

After implementation:
- [ ] Generate a new "short" video - should have 18 images instead of 24
- [ ] Verify generation completes in under 4 minutes
- [ ] Check video export still has smooth transitions with 3 images per scene
- [ ] Verify Haitian Creole content still uses Gemini TTS correctly
