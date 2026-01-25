
# Smart Flow Result: Feature Parity Implementation

## Problem
The Smart Flow output view (`SmartFlowResult.tsx`) is completely different from the Explainer and Visual Stories result view (`GenerationResult.tsx`). Users expect a consistent experience across all products.

## Key Missing Features

| Feature | GenerationResult | SmartFlowResult |
|---------|------------------|-----------------|
| "Generation Complete" badge | Yes | No |
| Stats panel (time, cost) | Yes | Partial (different layout) |
| Edit button → SceneEditModal | Yes | No |
| Image regeneration with prompt | Yes | No |
| Audio regeneration | Yes | No |
| Export Video (useVideoExport) | Yes | Broken (non-functional button) |
| Download Images (zip) | Yes | Simple image download only |
| Export Logs modal | Yes | No |
| Script hidden when no audio | No (always shown) | Shows always |
| Play Preview button | Yes | Simple audio play |

## Solution

**Replace SmartFlowResult.tsx** with a streamlined version of GenerationResult that:
1. Uses the exact same layout and components
2. Handles the single-scene case elegantly (no scene navigation arrows, simplified "All Scenes" grid)
3. Conditionally hides script/audio sections when voice is disabled
4. Integrates all existing hooks: `useVideoExport`, `useSceneRegeneration`, `useImagesZipDownload`

---

## Implementation Steps

### Step 1: Rewrite SmartFlowResult.tsx

Replace the current implementation with one that mirrors GenerationResult:

**Structure:**
```
Header Section
├── "Generation Complete" badge (animated)
├── Stats panel (time + cost badges)
├── Title
├── "1 scene • 1 image generated"
└── Play Preview button (only if audio exists)

Image Preview Card
├── Aspect-ratio image container
├── No scene navigation (single scene)
├── Edit button → opens SceneEditModal
└── Script display (only if audio enabled)
    └── Audio player (only if audio exists)

Action Buttons
├── Export Video (if audio enabled)
├── Export Logs
├── Download Image (single file, not zip since only 1 image)
└── Create Another

Export Modal (from useVideoExport)
├── Progress display
├── Download to Files button
└── Share / Save to Photos button (iOS)

Scene Edit Modal
├── Image with edit prompt textarea
├── Apply Edit / Regenerate New Image
├── Script textarea with Save & Regenerate Audio
└── Visual prompt reference
```

### Step 2: Import Required Hooks

Add these to SmartFlowResult:
```typescript
import { useVideoExport } from "@/hooks/useVideoExport";
import { useSceneRegeneration } from "@/hooks/useSceneRegeneration";
import { SceneEditModal } from "./SceneEditModal";
```

### Step 3: Conditional Script/Audio Display

When `enableVoice === false`:
- Hide the script section entirely
- Hide the Play Preview button
- Hide the Export Video button (only Download Image available)
- Change subtitle to "1 scene • 1 image generated • No audio"

When `enableVoice === true` but no audio URL yet:
- Show "Generating audio..." state

### Step 4: Update SmartFlowWorkspace Integration

Pass required props to SmartFlowResult:
- `onScenesUpdate` callback for regeneration
- Ensure `generationId` and `projectId` are passed correctly

### Step 5: Single Image Download

Since Smart Flow produces exactly 1 image:
- Keep simple "Download Image" button (not zip)
- Direct download via anchor element

---

## Visual Comparison

**Before (Current SmartFlowResult):**
```
┌─────────────────────────────────────────┐
│ Title               [New Infographic]   │
│ "Generated in X:XX • 1 credit used"     │
├─────────────────────────────────────────┤
│  ┌─────────┐  │  Audio Player (card)    │
│  │         │  │  ─────────────────────  │
│  │  IMAGE  │  │  Narration Script       │
│  │         │  │  ┌─────────────────┐    │
│  └─────────┘  │  │ Script text...  │    │
│  [Download]   │  └─────────────────┘    │
│               │  [Export Video]         │
└─────────────────────────────────────────┘
```

**After (Matching GenerationResult):**
```
┌─────────────────────────────────────────┐
│     ● Generation Complete               │
│     ┌────────┐  ┌────────┐              │
│     │ 2m 15s │  │ $0.12  │              │
│     └────────┘  └────────┘              │
│           Infographic Title             │
│     1 scene • 1 image generated         │
│         [▶ Play Preview]                │
├─────────────────────────────────────────┤
│  ┌──────────────────────────────────┐   │
│  │                                  │   │
│  │         IMAGE PREVIEW            │   │
│  │    (with Edit overlay button)    │   │
│  │                                  │   │
│  └──────────────────────────────────┘   │
│  Scene 1                    10s [Edit]  │
│  🔊 Script text here...                 │
│  [Audio player controls]                │
├─────────────────────────────────────────┤
│ [Export Video] [Logs] [Download] [New]  │
└─────────────────────────────────────────┘
```

---

## Technical Details

### Props Update
```typescript
interface SmartFlowResultProps {
  title: string;
  scenes: Scene[];
  format: VideoFormat;
  enableVoice: boolean;  // Controls audio/script visibility
  onNewProject: () => void;
  totalTimeMs?: number;
  costTracking?: CostTracking;
  generationId?: string;
  projectId?: string;
  onScenesUpdate?: (scenes: Scene[]) => void;  // NEW: for regeneration
}
```

### Key Conditional Logic
```typescript
// Only show audio-related UI if voice is enabled
const hasAudio = enableVoice && scene?.audioUrl;

// Stats subtitle adapts
const subtitle = enableVoice 
  ? "1 scene • 1 image generated"
  : "1 scene • 1 image generated • No audio";

// Hide Play Preview, Export Video when no audio
{hasAudio && (
  <Button>Play Preview</Button>
)}

// Hide entire script section when voice disabled
{enableVoice && (
  <ScriptSection />
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/workspace/SmartFlowResult.tsx` | Complete rewrite to match GenerationResult pattern |
| `src/components/workspace/SmartFlowWorkspace.tsx` | Pass `onScenesUpdate` prop to SmartFlowResult |

## Credits
- Remains fixed at 1 credit per Smart Flow generation
- Displayed as "$X.XX" in cost badge (consistent with other products)
