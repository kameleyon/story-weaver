# Full Motion Video Feature - Implementation Plan

## Status: Phase 1 Complete ✓

The admin-only UI for Full Motion has been implemented. Next steps require the GLIF_API_KEY to enable actual video generation.

---

## What's Been Implemented

### ✓ Frontend Components
- `FullMotionWorkspace.tsx` - Main workspace with script input, animation style, avatar, motion intensity
- `AnimationStyleSelector.tsx` - Choose between talking avatar, character animation, motion graphics, cinematic
- `AvatarSelector.tsx` - Select avatar type (realistic male/female, stylized, custom)
- `MotionIntensitySlider.tsx` - Control animation intensity (subtle, moderate, expressive)
- `FullMotionResult.tsx` - Video player with scene navigation

### ✓ Routing & Navigation
- Updated `WorkspaceRouter.tsx` to handle `?mode=fullmotion`
- Added Full Motion to `products.ts` with `adminOnly: true` flag
- Added sidebar navigation visible only to admins

### ✓ Admin-Only Access
- Workspace checks `useAdminAuth()` and redirects non-admins
- Sidebar entry only shows for admin users

---

## What's Next (Requires GLIF_API_KEY)

### Phase 2: Backend Integration
1. Add `GLIF_API_KEY` secret to Supabase
2. Update `generate-video` edge function:
   - Add "fullmotion" to `ALLOWED_PROJECT_TYPES`
   - Create `handleGlifAnimationPhase()` for video generation
   - Implement Glif API calls with polling for completion

### Phase 3: Full Pipeline
1. Connect workspace to `useGenerationPipeline`
2. Store fullmotion projects in database
3. Implement video stitching in finalize phase
4. Add export/download functionality

---

## Glif API Integration (for Phase 2)

```typescript
// Edge function helper
async function callGlifWorkflow(glifId: string, inputs: string[]): Promise<any> {
  const GLIF_API_KEY = Deno.env.get("GLIF_API_KEY");
  
  const response = await fetch("https://simple-api.glif.app", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GLIF_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: glifId,
      inputs: inputs
    })
  });
  
  return response.json();
}
```

---

## Files Created
- `src/components/workspace/FullMotionWorkspace.tsx`
- `src/components/workspace/AnimationStyleSelector.tsx`
- `src/components/workspace/AvatarSelector.tsx`
- `src/components/workspace/MotionIntensitySlider.tsx`
- `src/components/workspace/FullMotionResult.tsx`

## Files Modified
- `src/config/products.ts` - Added fullmotion product type
- `src/components/workspace/WorkspaceRouter.tsx` - Added fullmotion routing
- `src/components/layout/AppSidebar.tsx` - Added admin-only nav item
