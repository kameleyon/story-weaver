
# Image-First Character Consistency System

## Overview

Implement a premium character consistency feature for Visual Stories that generates character reference images first using Hypereal AI's nano-banana-pro model, then uses those references to ensure visual consistency across all scenes.

## Tier Gating Strategy

| Tier | Feature Access |
|------|----------------|
| Free | Toggle visible, upgrade prompt on click |
| Starter | Toggle visible, upgrade prompt on click |
| Creator | Toggle visible, upgrade prompt on click |
| **Professional** | ✅ Full access - Hypereal AI |
| **Enterprise** | ✅ Full access - Hypereal AI |

---

## Architecture Flow

```text
USER CLICKS "Enable Character Consistency"
            │
            ▼
┌──────────────────────────────┐
│  Is user Pro/Enterprise?     │
└──────────────────────────────┘
       │NO              │YES
       ▼                ▼
┌──────────────┐  ┌────────────────────────────────────┐
│ Show Upgrade │  │ NEW: Character Phase               │
│ Modal        │  │ 1. Analyze story for characters    │
└──────────────┘  │ 2. Generate reference portraits    │
                  │    via Hypereal AI (1k resolution) │
                  │ 3. Store URLs in project_characters│
                  └────────────────────────────────────┘
                               │
                               ▼
                  ┌────────────────────────────────────┐
                  │ Script Phase (enhanced)            │
                  │ - Include character ref URLs       │
                  │   in scene metadata                │
                  └────────────────────────────────────┘
                               │
                               ▼
                  ┌────────────────────────────────────┐
                  │ Image Phase (enhanced)             │
                  │ - Pass character ref images to     │
                  │   image generator for conditioning │
                  └────────────────────────────────────┘
```

---

## Implementation Components

### 1. Database Changes

**New table: `project_characters`**

```sql
CREATE TABLE project_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  character_name TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies for user-scoped access
ALTER TABLE project_characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own characters"
  ON project_characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own characters"  
  ON project_characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own characters"
  ON project_characters FOR DELETE
  USING (auth.uid() = user_id);
```

**Update `projects` table:**

```sql
ALTER TABLE projects ADD COLUMN character_consistency_enabled BOOLEAN DEFAULT false;
```

---

### 2. New Supabase Secret

**Required: `HYPEREAL_API_KEY`**

The user will need to add their Hypereal AI API key to Supabase secrets.

---

### 3. Backend Changes (`generate-video/index.ts`)

**A. New Character Generation Function**

```typescript
async function generateCharacterReference(
  characterName: string,
  description: string,
  aspectRatio: string,
  hyperealApiKey: string,
  supabase: any,
  userId: string,
  projectId: string
): Promise<{ url: string | null; error?: string }> {
  // Build portrait prompt
  const prompt = `Character reference portrait of ${characterName}:
${description}

REQUIREMENTS:
- Clean, neutral background (white or light gray)
- Upper body portrait showing head and shoulders
- Face clearly visible, neutral/slight smile expression
- High detail on facial features for recognition
- Professional character reference sheet quality`;

  const response = await fetch("https://api.hypereal.tech/v1/images/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${hyperealApiKey}`
    },
    body: JSON.stringify({
      prompt,
      model: "nano-banana-pro-t2i",
      resolution: "1k",
      aspect_ratio: "1:1", // Square for portraits
      output_format: "png"
    })
  });

  // Handle response, upload to storage, return URL
}
```

**B. New Character Phase Handler**

```typescript
async function handleCharacterPhase(
  supabase: any,
  user: any,
  projectId: string,
  generationId: string,
  storyIdea: string,
  characterDescription?: string
): Promise<Response> {
  // 1. Use LLM to analyze story and identify characters
  // 2. For each character, generate reference image via Hypereal
  // 3. Store in project_characters table
  // 4. Return character data with image URLs
}
```

**C. Modify Image Phase**

Update `buildImagePrompt()` to include character reference conditioning when available.

---

### 4. Frontend Changes

**A. New Component: `CharacterConsistencyToggle.tsx`**

```typescript
interface CharacterConsistencyToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  userPlan: "free" | "starter" | "creator" | "professional";
}

// Shows toggle with lock icon for non-pro users
// Clicking when locked triggers upgrade modal
```

**B. Update `StorytellingWorkspace.tsx`**

- Add `characterConsistencyEnabled` state
- Add `CharacterConsistencyToggle` component in settings
- Pass flag to generation pipeline
- Add character preview step before scene generation (pro users only)

**C. Update `useSubscription.ts`**

Add helper function:
```typescript
const canUseCharacterConsistency = plan === "professional" || plan === "enterprise";
```

**D. Update `useGenerationPipeline.ts`**

- Add new step: `"characters"` between analysis and scripting
- Store character reference URLs in state
- Pass to backend phases

**E. Update `GenerationProgress.tsx`**

Show "Generating character references..." step for pro users.

---

### 5. Hypereal API Integration Details

**Endpoint**: `https://api.hypereal.tech/v1/images/generate`

**Request Format**:
```json
{
  "prompt": "Character portrait description...",
  "model": "nano-banana-pro-t2i",
  "resolution": "1k",
  "aspect_ratio": "1:1",
  "output_format": "png"
}
```

**Aspect Ratio Mapping**:
| Video Format | Character Portrait | Scene Images |
|--------------|-------------------|--------------|
| portrait (9:16) | 1:1 | 9:16 |
| landscape (16:9) | 1:1 | 16:9 |
| square (1:1) | 1:1 | 1:1 |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/workspace/CharacterConsistencyToggle.tsx` | **Create** | Toggle with tier gating UI |
| `src/components/workspace/CharacterPreview.tsx` | **Create** | Preview generated characters |
| `src/components/workspace/StorytellingWorkspace.tsx` | **Modify** | Add toggle and preview |
| `src/hooks/useGenerationPipeline.ts` | **Modify** | Add character phase |
| `src/hooks/useSubscription.ts` | **Modify** | Add `canUseCharacterConsistency` helper |
| `supabase/functions/generate-video/index.ts` | **Modify** | Add Hypereal integration, character phase |
| **Migration** | **Create** | `project_characters` table + projects column |

---

## Cost Estimate

- **Per character reference**: ~$0.02-0.05 (Hypereal pricing)
- **Typical project**: 1-4 characters = $0.02-0.20 additional cost
- **Only charged to Pro/Enterprise users**

---

## Security Considerations

1. API key stored in Supabase secrets (never exposed client-side)
2. RLS on `project_characters` ensures user-scoped access
3. Tier check performed server-side before using Hypereal API
4. Input validation on character descriptions

---

## User Experience Flow

**For Free/Starter/Creator Users:**
1. See "Character Consistency" toggle in Storytelling workspace
2. Toggle shows lock icon indicating premium feature
3. Clicking opens upgrade modal highlighting Professional plan

**For Professional/Enterprise Users:**
1. Enable "Character Consistency" toggle
2. Generation starts with "Creating character references..." step
3. Character portraits appear in preview
4. Option to regenerate individual characters if unsatisfied
5. Scenes generate with consistent character appearances
