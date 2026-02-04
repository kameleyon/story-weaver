
# Fix Haitian Creole TTS Fallback Chain

## Summary
Remove the invalid `gemini-2.0-flash-live-001` model from the TTS fallback chain and ensure the correct model order as you specified.

## Changes

### 1. Update GEMINI_TTS_MODELS array
**File:** `supabase/functions/generate-video/index.ts` (lines 1364-1368)

**Before:**
```typescript
const GEMINI_TTS_MODELS = [
  { name: "gemini-2.5-pro-preview-tts", label: "2.5 Pro Preview TTS" },
  { name: "gemini-2.5-flash-preview-tts", label: "2.5 Flash Preview TTS" },
  { name: "gemini-2.0-flash-live-001", label: "2.0 Flash Live TTS" },  // INVALID
];
```

**After:**
```typescript
const GEMINI_TTS_MODELS = [
  { name: "gemini-2.5-pro-preview-tts", label: "2.5 Pro Preview TTS" },
  { name: "gemini-2.5-flash-preview-tts", label: "2.5 Flash Preview TTS" },
];
```

### 2. Update the Lovable AI fallback chain order
**File:** `supabase/functions/generate-video/index.ts` (lines 1621-1624)

The Lovable AI fallback currently tries Flash first, then Pro. This should match your intended order where the preview TTS models are primary, then fallback to non-TTS models in the same order (Pro quality first for the non-TTS fallbacks).

**After:**
```typescript
const LOVABLE_TTS_MODELS = [
  { model: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },  // Faster fallback
  { model: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },       // Higher quality fallback
];
```

This order is already correct (Flash first for speed, Pro as final resort).

### 3. Update the memory documentation comment
Update the comment at line 1361-1363 to accurately reflect the new chain:

```typescript
// ============= GEMINI TTS MODELS (Haitian Creole only) =============
// Primary: 2.5 Pro Preview TTS (best quality for HC)
// Fallback: 2.5 Flash Preview TTS → Lovable AI Gateway (2.5 Flash → 2.5 Pro)
```

## Resulting Fallback Chain

```text
Haitian Creole TTS Fallback Order:
┌─────────────────────────────────────────────────────────────┐
│ 1. gemini-2.5-pro-preview-tts    (Direct Google API)        │
│ 2. gemini-2.5-flash-preview-tts  (Direct Google API)        │
│ 3. google/gemini-2.5-flash       (Lovable AI Gateway)       │
│ 4. google/gemini-2.5-pro         (Lovable AI Gateway)       │
└─────────────────────────────────────────────────────────────┘
```

## Technical Details

- Each model gets up to 5 retries with text variations to bypass content filters
- Total attempts: 2 models × 5 retries = 10 attempts via Direct Google API
- Then 2 more models × standard retries via Lovable AI Gateway
- The invalid `gemini-2.0-flash-live-001` was causing wasted 404 errors on every generation

## Deployment
After approval, the `generate-video` Edge Function will be redeployed to apply the fix.
