
# Lovable AI Gateway REMOVED from Project

## Summary
ALL usage of Lovable AI Gateway has been removed from this project. The app now exclusively uses direct API calls to external providers for all functionality.

## Provider Architecture (After Removal)

### Script Generation
- **Provider**: OpenRouter ONLY
- **Model**: `google/gemini-3-pro-preview`
- **Fallback**: None - OpenRouter is required

### Image Generation & Editing
- **Primary**: Hypereal `nano-banana-pro-t2i` (Pro/Enterprise) or `nano-banana-t2i` (Standard)
- **Fallback**: Replicate `google/nano-banana-pro` or `google/nano-banana`
- **"Apply Edit"**: Uses text-to-image regeneration via Hypereal/Replicate (NOT Lovable AI Gateway)

### TTS (Text-to-Speech)
- **Haitian Creole**: Direct Gemini TTS API (`gemini-2.5-pro-preview-tts` → `gemini-2.5-flash-preview-tts`)
  - NO Lovable AI Gateway fallback
  - Up to 5 retries with text variations
- **Custom/Cloned Voice (non-HC)**: ElevenLabs TTS directly
- **Custom Voice + HC**: Gemini TTS → ElevenLabs Speech-to-Speech transformation
- **English/Other Languages**: Replicate Chatterbox with Chunk & Stitch

## Cost Tracking
All API calls are now logged with explicit provider names:
- `openrouter` - Script generation
- `hypereal` - Primary image generation
- `replicate` or `replicate_fallback` - Image generation fallback
- `google_tts` - Haitian Creole TTS
- `elevenlabs` - Custom voice TTS and Speech-to-Speech

## Files Changed
- `supabase/functions/generate-video/index.ts`:
  - Removed Lovable AI Gateway from `callLLMWithFallback()` - OpenRouter only now
  - Removed `generateSceneAudioLovableAI()` - stubbed to return error
  - Removed Gateway fallback from HC TTS in `generateSceneAudio()`
  - Updated `ApiCallLogParams` to remove `lovable_ai` provider option
  - Updated `LLMCallResult` to only include `openrouter` provider
