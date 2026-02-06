

# Plan: Remove Hypereal and Lovable AI Gateway Only

## Summary
Remove **Hypereal** and **Lovable AI Gateway** (ai.gateway.lovable.dev) from the codebase, while keeping:
- ✅ OpenRouter for LLM/script generation
- ✅ Direct Gemini TTS for Haitian Creole
- ✅ Replicate Chatterbox for English/standard voices
- ✅ ElevenLabs for custom/cloned voices

Pro/Enterprise users will use **Replicate nano-banana-pro** for images instead of Hypereal.

## What Gets Removed

### 1. Lovable AI Gateway (ai.gateway.lovable.dev)
Used in 3 places:
- **LLM fallback** in `callLLMWithFallback()` - line ~444
- **TTS fallback** in `generateSceneAudioLovableAI()` - line ~1630
- **Image editing** in `editImageWithNanoBanana()` - line ~2487

### 2. Hypereal
- `generateImageWithHypereal()` function
- `generateCharacterReferenceWithHypereal()` function
- Hypereal API calls for Pro/Enterprise image generation
- Hypereal fallback chains

## What Stays (Unchanged)

| Component | Provider | Status |
|-----------|----------|--------|
| Script Generation | OpenRouter (google/gemini-3-pro-preview) | ✅ Keep |
| Haitian Creole TTS | Direct Gemini API (gemini-2.5-pro-preview-tts) | ✅ Keep |
| English TTS | Replicate Chatterbox | ✅ Keep |
| Custom Voice TTS | ElevenLabs | ✅ Keep |
| Free/Starter/Creator Images | Replicate nano-banana | ✅ Keep |

## Changes Required

### 1. LLM Script Generation
**File:** `supabase/functions/generate-video/index.ts`

**Current:** OpenRouter → Lovable AI Gateway fallback
**After:** OpenRouter only (error if fails)

```typescript
// Remove Lovable AI fallback section (~lines 436-475)
// Keep only OpenRouter call
```

### 2. TTS Generation
**File:** `supabase/functions/generate-video/index.ts`

**Remove:**
- `generateSceneAudioLovableAI()` function entirely (~115 lines)
- Lovable AI fallback calls in Haitian Creole TTS chain

**Keep:**
- `generateSceneAudioGemini()` and `generateSceneAudioGeminiWithModel()` for Haitian Creole
- `generateSceneAudioReplicate()` for Chatterbox
- `generateSceneAudioElevenLabs()` for custom voices

### 3. Image Generation  
**File:** `supabase/functions/generate-video/index.ts`

**Remove:**
- `generateImageWithHypereal()` function entirely
- `generateCharacterReferenceWithHypereal()` function entirely
- All Hypereal API calls and fallback logic
- `PREMIUM_REQUIRED_STYLES` constant (was for Hypereal)
- Hypereal cost tracking

**Modify:**
- Pro/Enterprise: Use `replicate/google/nano-banana-pro` at 1K resolution
- Keep Free/Starter/Creator on `replicate/google/nano-banana`

### 4. Image Editing
**File:** `supabase/functions/generate-video/index.ts`

**Remove:**
- `editImageWithNanoBanana()` function (uses Lovable AI Gateway)

**Replace with:**
- Full image regeneration via Replicate with modified prompt

### 5. Cost Tracking & Logging
- Remove `hypereal` provider type
- Remove `PRICING.imageHypereal` constant
- Remove `hyperealSuccessCount` and `replicateFallbackCount` tracking
- Keep tracking for replicate, openrouter, google_tts, elevenlabs

## New Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                    generate-video Edge Function                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SCRIPT GENERATION:                                              │
│    OpenRouter (google/gemini-3-pro-preview) - NO FALLBACK        │
│                                                                  │
│  VOICE/TTS:                                                      │
│    Haitian Creole: Direct Gemini API (2.5-pro-preview-tts)       │
│    English/Other: Replicate Chatterbox                           │
│    Custom Voice: ElevenLabs                                      │
│    HC + Custom: ElevenLabs Speech-to-Speech                      │
│                                                                  │
│  IMAGE GENERATION:                                               │
│    Pro/Enterprise: Replicate google/nano-banana-pro (1K)         │
│    Free/Starter/Creator: Replicate google/nano-banana            │
│                                                                  │
│  IMAGE EDITING:                                                  │
│    Full regeneration via Replicate (no Lovable AI edit)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Functions to Remove
1. `generateSceneAudioLovableAI()` - Lovable AI TTS fallback
2. `generateImageWithHypereal()` - Hypereal image generation
3. `generateCharacterReferenceWithHypereal()` - Hypereal character refs
4. `editImageWithNanoBanana()` - Lovable AI image editing

## Functions to Modify
1. `callLLMWithFallback()` - Remove Lovable AI fallback, keep OpenRouter only
2. `generateSceneAudio()` - Remove Lovable AI fallback from HC chain
3. `handleImagesPhase()` - Remove Hypereal, use Replicate only with tiered models
4. `handleRegenerateImagePhase()` - Remove Hypereal and Lovable AI

## Estimated Impact
- ~500 lines of code removed
- Simpler architecture with fewer providers
- Pro/Enterprise image quality maintained via nano-banana-pro

