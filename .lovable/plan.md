
# Plan: Add Character Consistency to Explainers Workspace

## Overview
Add the "Character Consistency" Pro feature to the Explainers (Doc2Video) workspace, mirroring its implementation in Visual Stories. The feature will be visible to all users, but non-Pro users will see an upgrade prompt when they try to enable it.

## What This Feature Does
Character Consistency uses AI to generate reference portraits for each character, ensuring they look identical across all scenes in your video. This is currently a Pro-tier exclusive feature.

---

## Implementation Details

### File to Modify
**`src/components/workspace/Doc2VideoWorkspace.tsx`**

### Changes Required

1. **Add Import**
   - Import `CharacterConsistencyToggle` from `./CharacterConsistencyToggle`

2. **Add State Variable**
   - Add `characterConsistencyEnabled` state (boolean, default `false`)

3. **Add UI Component**
   - Place the `CharacterConsistencyToggle` component after the collapsible options section and before the Configuration section
   - This positioning matches the Visual Stories layout

4. **Update Generation Call**
   - Pass `characterConsistencyEnabled` parameter to `startGeneration()` in `runGeneration()`

5. **Reset State on New Project**
   - Add `setCharacterConsistencyEnabled(false)` to the `handleNewProject` function

---

## Technical Notes

- The `CharacterConsistencyToggle` component already handles:
  - Checking user subscription tier via `useSubscription` hook
  - Showing a lock icon for non-Pro users
  - Displaying an upgrade modal when non-Pro users click the toggle
  - Routing to Stripe checkout for the Pro plan
  
- The `useGenerationPipeline` hook already accepts `characterConsistencyEnabled` in its params and passes it to the backend

- No backend changes required; the `generate-video` edge function already supports this flag

---

## Visual Placement

The toggle will appear in the workspace form between the "Disable voice expressions" checkbox and the Configuration card (Format/Length/Style section), providing easy access without cluttering the main input area.
