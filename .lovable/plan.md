

## Remove Client-Side Export Fallback from CinematicResult

### Problem
`CinematicResult.tsx` currently falls back to `useCinematicExport` (client-side frame rendering via `VideoEncoder`) when `finalVideoUrl` is missing. This fallback is the exact code path that causes mobile crashes due to thermal throttling and memory exhaustion.

### Solution
Remove the `useCinematicExport` fallback entirely. If `finalVideoUrl` is not available, the Export button should be disabled with a "Processing..." tooltip instead of silently triggering the crash-prone client-side renderer.

### Changes

**File: `src/components/workspace/CinematicResult.tsx`**

1. Remove the `import { useCinematicExport }` line and the `useCinematicExport()` hook call (lines ~53, 138-147).
2. Remove all references to `exportState`, `exportVideo`, `downloadVideo`, `shareVideo`, `resetExport`.
3. Simplify `handleExportVideo`:
   - If `finalVideoUrl` exists: download it directly (keep current direct download logic).
   - If `finalVideoUrl` is missing: do nothing (button will be disabled).
4. Update the Export button:
   - Disable it when `!finalVideoUrl` (in addition to existing conditions).
   - Show spinner only during `isDirectDownloading`.
   - Tooltip: show "Download Video" when ready, "Video processing..." when not available.
5. Remove the export progress bar UI that displays `exportState.progress` (since client-side export is no longer used).

**File: `src/hooks/useCinematicExport.ts`**

- No deletion yet (other code may still import it), but it becomes unused by `CinematicResult`. Can be cleaned up in a follow-up pass.

### Result
The Export button becomes a simple, safe download button -- identical in behavior to the Explainer/Doc2Video export. No client-side video rendering will ever run on mobile.

