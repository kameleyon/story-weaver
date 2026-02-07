
# Removed Lovable AI Fallbacks

## Summary
All Lovable AI Gateway fallbacks have been removed from the codebase. The system now uses:
- **LLM**: OpenRouter only (google/gemini-3-pro-preview)
- **TTS (Haitian Creole)**: Direct Gemini API only (2.5 Pro Preview TTS → 2.5 Flash Preview TTS)
- **TTS (Other languages)**: Replicate Chatterbox
- **Images**: Replicate nano-banana

## Changes Made

### 1. LLM Call Helper (lines 364-430)
- Removed Lovable AI Gateway fallback
- OpenRouter is now the only LLM provider
- Function throws error if OPENROUTER_API_KEY is not configured

### 2. API Call Logging (line 485)
- Removed `lovable_ai` from provider types
- Now only: `openrouter | replicate | google_tts | elevenlabs`

### 3. Removed Lovable AI TTS Function
- Deleted `generateSceneAudioLovableAI()` function entirely (was ~115 lines)

### 4. Haitian Creole TTS Routing
- Removed Lovable AI Gateway fallback for standard HC voice
- Now uses only: Gemini 2.5 Pro Preview TTS → Gemini 2.5 Flash Preview TTS
- Updated retry count comment: "2 models × 5 retries = up to 10 attempts"

### 5. HC + Cloned Voice Routing
- Removed Lovable AI Gateway fallback for voice transformation base audio
- Now uses only Direct Gemini TTS before ElevenLabs STS

## Current TTS Fallback Chain

```text
Haitian Creole (Standard Voice):
┌─────────────────────────────────────────────────────────────┐
│ 1. gemini-2.5-pro-preview-tts    (Direct Google API)        │
│ 2. gemini-2.5-flash-preview-tts  (Direct Google API)        │
└─────────────────────────────────────────────────────────────┘
Each model gets up to 5 retries with text variations.
Total: 2 models × 5 retries = 10 attempts max.

Other Languages:
┌─────────────────────────────────────────────────────────────┐
│ Replicate Chatterbox (Chunk & Stitch for long scripts)     │
└─────────────────────────────────────────────────────────────┘

Custom/Cloned Voices:
┌─────────────────────────────────────────────────────────────┐
│ ElevenLabs TTS (direct) or STS (for HC base audio)          │
└─────────────────────────────────────────────────────────────┘
```

## Deployment
Edge function `generate-video` deployed with Lovable AI references removed.
