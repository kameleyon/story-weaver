

# Plan: Update Landing Page Video Thumbnail

## Overview
Replace the current video poster/thumbnail on the landing page with the new "Own the Screen" illustration you've provided.

## Implementation Details

### Step 1: Copy the New Image
- Copy the uploaded image to `src/assets/hero-video-poster.png` (replacing the existing file)
- This maintains the same filename so no code changes are needed in Landing.tsx

### File Changes
**`src/assets/hero-video-poster.png`**
- Replace with the new uploaded image featuring the "Own the Screen" illustration with the character holding a video play trophy

## Technical Notes

- The Landing.tsx already imports this file:
  ```tsx
  import heroVideoPoster from "@/assets/hero-video-poster.png";
  ```
  
- The video element uses it as the poster:
  ```tsx
  <video
    src={heroPromoVideo}
    poster={heroVideoPoster}
    ...
  />
  ```

- Since we're replacing the file with the same name, no code changes are required

## Result
The landing page hero video will display the new "Own the Screen - The future is visual" illustration as its thumbnail before the user clicks play.

