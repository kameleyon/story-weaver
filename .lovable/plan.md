
# Plan: Simplify Progress Bar and Add Retry Button

## Overview
This plan addresses two UI improvements to the GenerationProgress component:
1. Remove the scene/image count breakdown section
2. Add a retry button that appears when generation fails or appears stuck

## Changes Required

### 1. Update GenerationProgress Component
**File:** `src/components/workspace/GenerationProgress.tsx`

**Remove Scene/Image Breakdown:**
- Delete the grid section at lines 186-200 that displays "Total Scenes" and "Images Generated" counts
- This information is already shown inline in the status messages (e.g., "Creating visuals... (3/6 images)")

**Add Retry Button:**
- Accept a new `onRetry` callback prop
- Display a "Retry" button when:
  - `step === "error"` (generation failed)
  - OR when generation appears stuck (still showing as generating but no progress updates)
- Add a subtle timer-based "stuck detection" using the `isGenerating` state combined with checking if the step is not "complete"
- Style the retry button consistently with the existing error card pattern (bg-primary/10 with primary text)

**Props Update:**
```typescript
interface GenerationProgressProps {
  state: GenerationState;
  onRetry?: () => void;
}
```

**Retry Button UI:**
- Display below the status message area
- Show only when `step === "error"` OR when `isGenerating && step !== "complete"` (user can cancel/retry anytime during generation)
- Use a clear "Try Again" label with a refresh icon
- For error state: always visible
- For stuck/in-progress: always visible as a safety valve (allow users to restart if something feels wrong)

### 2. Update All Workspace Components
Pass the `onRetry` callback to GenerationProgress in each workspace:

**Files to update:**
- `src/components/workspace/StorytellingWorkspace.tsx`
- `src/components/workspace/Doc2VideoWorkspace.tsx`
- `src/components/workspace/SmartFlowWorkspace.tsx`
- `src/components/workspace/Workspace.tsx`

**Implementation:**
- Pass a retry handler that calls `reset()` followed by the workspace's `handleGenerate()` function
- This reuses the same pattern already used in GenerationResult for "Regenerate All"

---

## Technical Details

### GenerationProgress Component Changes

```text
Updated component structure:
+------------------------------------+
|  Header (icon + title)             |
+------------------------------------+
|  Progress bar with percentage      |
+------------------------------------+
|  Status message box                |
+------------------------------------+
|  [Retry button - conditional]      |
+------------------------------------+
```

The retry button appears:
- **Always during active generation** - as a "Cancel & Restart" option
- **Always on error** - to retry the failed generation
- **Never when complete** - the result page handles regeneration

### Workspace Integration Pattern

Each workspace will pass:
```typescript
<GenerationProgress 
  state={generationState} 
  onRetry={() => {
    reset();
    handleGenerate();
  }}
/>
```

This mirrors the existing `onRegenerateAll` pattern used in GenerationResult.
