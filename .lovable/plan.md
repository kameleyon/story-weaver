

## Replace Hailuo Video Generation with Replicate Grok Imagine Video

### Overview
Comment out all Hailuo (Hypereal) video generation code and implement `xai/grok-imagine-video` via Replicate API for all video generation paths (bulk, image-edit, image-regen). Audio will be explicitly set to OFF in the Grok request.

### Changes

**File: `supabase/functions/generate-cinematic/index.ts`**

1. **Add a new `startGrokVideo` helper function** that uses the existing `createReplicatePrediction` + `getLatestModelVersion` helpers (already present at lines 284-340) to start a Grok video prediction:
   - Model: `xai/grok-imagine-video`
   - Input: `{ prompt: scene.visualPrompt, image: imageUrl, duration: 5, resolution: "720p", aspect_ratio: based on format }`
   - Audio: NOT included (Grok schema has no audio param -- by not providing a `video` input, it runs in image-to-video mode which has no audio)
   - Returns the Replicate prediction ID

2. **Add a `pollGrokVideo` helper** that wraps `getReplicatePrediction` and returns status + output URL when succeeded/failed/processing. Maps Replicate statuses (`succeeded`, `failed`, `canceled`, `processing`, `starting`) to our internal format.

3. **Update PHASE 4 (video, lines 1102-1192):**
   - Comment out the Hailuo `startHailuo`/`pollHailuo` calls
   - Replace with `startGrokVideo` / `pollGrokVideo` using `replicateToken` (already available in scope)
   - Set `videoProvider: "replicate"` on the scene
   - Keep the same download-and-upload-to-storage pattern

4. **Update IMAGE-EDIT phase (lines 1194-1357):**
   - Comment out the Hailuo video regeneration loop (lines 1319-1351)
   - Replace with Grok video: start prediction, poll in loop, download + upload

5. **Update IMAGE-REGEN phase (lines 1359-1419):**
   - Comment out Hailuo video regeneration loop (lines 1382-1413)
   - Replace with Grok video: start prediction, poll in loop, download + upload

6. **Comment out (not delete) the Hailuo helper functions** (`startHailuo`, `pollHailuo`, lines 124-224) so they can be re-enabled later if needed.

### Technical Details

- **Replicate API flow**: `POST /v1/models/xai/grok-imagine-video/predictions` with model-specific input, then poll `GET /v1/predictions/{id}` until status is `succeeded`
- **Grok input schema** (from user-provided spec):
  - `prompt` (required): scene visual prompt
  - `image` (optional, uri): source image for i2v mode
  - `duration` (int, 1-15, default 5): video length in seconds -- we'll use 5
  - `resolution` ("720p" | "480p", default "720p"): we'll use "720p"
  - `aspect_ratio`: ignored when image is provided
  - No audio parameter exists, so output will naturally have no audio
- **Existing helpers reused**: `getLatestModelVersion`, `createReplicatePrediction`, `getReplicatePrediction` (lines 284-340)
- **Retry logic**: exponential backoff for 422 (queue full) errors, same pattern as was previously used
- **Output**: Replicate returns output as a URL (or FileOutput); we'll extract the URL string and download + upload to `scene-videos` storage bucket

