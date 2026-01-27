

# Fix Stick Figure Style Prompt

## Problem
The current `stick` style prompt contains duplicate/redundant content that was accidentally concatenated. It needs to be replaced with the clean version you specified.

## Current vs Desired

**Current (line 262 - has duplicates):**
```
Hand-drawn stick figure comic style. Crude, expressive black marker lines on a pure white. Extremely simple character designs (circles for heads, single lines for limbs). No fill colors—strictly black and white line art. Focus on humor and clarity. Rough, sketchy aesthetic similar to 'XKCD' or 'Wait But Why'. Imperfect circles and wobbly lines to emphasize the handmade, napkin-sketch quality. The background MUST be solid pure white (#FFFFFF)—just clean solid white. Crude expressive black marker lines for the drawing only. Extremely simple character designs (circles for heads, single lines for limbs). Strictly black ink on pure white—NO SKIN COLOR, NO FLESH TONES. Rough sketchy aesthetic similar to 'XKCD' or 'Wait But Why'. Imperfect circles and wobbly lines. High resolution on completely blank white canvas.
```

**Your desired version (clean):**
```
Hand-drawn stick figure comic style. Crude, expressive black marker lines on a pure white. Extremely simple character designs (circles for heads, single lines for limbs). No fill colors—strictly black and white line art. Focus on humor and clarity. Rough, sketchy aesthetic similar to 'XKCD' or 'Wait But Why'. Imperfect circles and wobbly lines to emphasize the handmade, napkin-sketch quality. The background MUST be solid pure white (#FFFFFF)—just clean solid white.
```

## Changes

### File: `supabase/functions/generate-video/index.ts`

Update line 262 to replace the redundant prompt with your clean version.

## Technical Details

- The `STYLE_PROMPTS` object is the centralized source for all visual styles
- This change applies to Visual Stories, Smart Flow, and Explainer modules
- The edge function will be redeployed automatically after the update

