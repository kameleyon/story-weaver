

# Fix Plan: Glif API "Prompt is required" Error

## Problem Analysis

The generation **completed** but all 8 Glif video API calls **failed** with the error:
```
Glif API error: Prompt is required
```

**Root Cause**: The Glif Simple API expects inputs in a specific format. Looking at the documentation, there are two possible input formats:

1. **Array format** (simple): `inputs: ["value1", "value2"]` - for workflows with ordered inputs
2. **Object format** (keyed): `inputs: { "input_name": "value" }` - when workflows have named inputs

The workflow `cmlcrert2000204l8u8z1nysa` likely expects a **named input** called `prompt` (or similar), not a positional array.

---

## Solution

### Option A: Use Object-Based Inputs (Recommended)

Modify `callGlifApi` to send inputs as a keyed object instead of an array:

```typescript
async function callGlifApi(
  glifId: string, 
  inputs: Record<string, string>, // Changed from string[]
  apiToken: string
): Promise<any> {
  const response = await fetch(GLIF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: glifId,
      inputs,  // { "prompt": "...", "audio_url": "..." }
    }),
  });
  // ...
}
```

Then update the scene generation call:

```typescript
// For text-to-video workflow
const glifInputs = {
  prompt: `${scene.visualPrompt}. Cinematic quality, ${params.style} style, ${scene.duration} seconds.`,
};

if (scene.audioUrl) {
  glifInputs.audio_url = scene.audioUrl;
}

const glifResult = await callGlifApi(GLIF_TXT2VID_ID, glifInputs, glifToken);
```

---

## Technical Changes

| File | Change |
|------|--------|
| `supabase/functions/generate-cinematic/index.ts` | Update `callGlifApi` signature to use `Record<string, string>` instead of `string[]` |
| Same file | Update txt2vid call to use `{ prompt: "..." }` format |
| Same file | Update stitching call to use appropriate input names |
| Same file | Add better error logging to capture the full Glif response for debugging |

---

## Code Changes

### 1. Update `callGlifApi` Function

```typescript
async function callGlifApi(
  glifId: string, 
  inputs: Record<string, string> | string[],  // Support both formats
  apiToken: string
): Promise<any> {
  console.log(`Calling Glif API with id: ${glifId}, inputs:`, JSON.stringify(inputs));
  
  const response = await fetch(GLIF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: glifId,
      inputs,
    }),
  });

  const result = await response.json();
  
  // Log full response for debugging
  console.log("Full Glif response:", JSON.stringify(result));
  
  if (result.error) {
    console.error("Glif API error:", result.error);
    throw new Error(`Glif API error: ${result.error}`);
  }

  return result;
}
```

### 2. Update Video Generation Call (Line ~386-394)

```typescript
// Use object-based inputs for Glif txt2vid workflow
const glifInputs: Record<string, string> = {
  prompt: `${scene.visualPrompt}. Cinematic quality, ${params.style} style, ${scene.duration} seconds.`,
};

if (scene.audioUrl) {
  glifInputs.audio_url = scene.audioUrl;
}

const glifResult = await callGlifApi(GLIF_TXT2VID_ID, glifInputs, glifToken);
```

### 3. Update Stitching Call (Line ~425)

```typescript
// Glif stitch - may need different input format
const stitchResult = await callGlifApi(GLIF_STITCH_ID, { 
  videos: videoUrls.join(",")  // or whatever the workflow expects
}, glifToken);
```

---

## Verification

After deployment:
1. Trigger a new Cinematic generation
2. Check edge function logs for the full Glif response
3. If still failing, the logs will show the exact input format expected

---

## Alternative Investigation

If the object format doesn't work, we may need to:
1. Visit the Glif workflow page for `cmlcrert2000204l8u8z1nysa` to see the exact input node names
2. Test the API directly using curl to determine the correct format
3. Contact Glif support for clarification on the specific workflow inputs

