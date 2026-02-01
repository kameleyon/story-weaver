

# Bot Proxy Implementation for Dynamic Social Previews

## Problem
When users share `motionmax.io/share/[token]` links on social media (Twitter, Facebook, LinkedIn, iMessage), the social platforms see the static `index.html` with generic MotionMax branding instead of project-specific thumbnails and titles.

## Solution: Bot Proxy Architecture
Create an edge function that detects social media bots and serves them dynamic OG meta tags, while humans get redirected to the actual app.

```text
                    motionmax.io/share/abc123
                              |
                              v
                    +-------------------+
                    |    Bot Proxy      |
                    |  Edge Function    |
                    +-------------------+
                              |
              +---------------+---------------+
              |                               |
         Is it a bot?                   Is it human?
              |                               |
              v                               v
    +-------------------+           +-------------------+
    | Return HTML with  |           | 302 Redirect to   |
    | Dynamic OG Tags   |           | motionmax.io/     |
    | (og:image, etc)   |           | share/abc123      |
    +-------------------+           +-------------------+
```

## Implementation Steps

### 1. Update the `share-meta` Edge Function
Enhance it to detect bot User-Agents and serve appropriate content:

**Bot Detection Logic:**
- Check for known bot User-Agents: `Twitterbot`, `facebookexternalhit`, `LinkedInBot`, `WhatsApp`, `TelegramBot`, `Slackbot`, `Discordbot`, `iMessageLinkPreview`, etc.
- If bot detected: Serve full HTML with dynamic OG meta tags (no redirect)
- If human: Use meta refresh to redirect to the React app

**Key changes:**
- Add comprehensive bot User-Agent detection list
- Remove the instant meta refresh for bots
- Keep the meta refresh only for humans
- Ensure proper caching headers for bots

### 2. Update the Share URL in ResultActionBar
Change `handleCopyLink` to copy a **specially formatted URL** that routes through the bot proxy:

**Option A (Recommended for motionmax.io custom domain):**
Copy `https://motionmax.io/s/[token]` and set up DNS to route `/s/*` through the edge function

**Option B (Works without DNS changes):**
Copy the edge function URL but make it look cleaner using path-based routing:
`https://hesnceozbedzrgvylqrm.supabase.co/functions/v1/share-meta/[token]`

### 3. Edge Function Code Changes

```typescript
// Bot User-Agent patterns to detect
const BOT_PATTERNS = [
  'Twitterbot',
  'facebookexternalhit',
  'LinkedInBot',
  'WhatsApp',
  'TelegramBot',
  'Slackbot',
  'Discordbot',
  'Pinterest',
  'Googlebot',
  'bingbot',
  'iMessageLinkPreview',
  'Applebot',
  'Embedly',
  'Quora Link Preview',
  'Redditbot',
  'SkypeUri',
];

function isBot(userAgent: string): boolean {
  return BOT_PATTERNS.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
}
```

**For bots:** Return HTML WITHOUT meta refresh
**For humans:** Return HTML WITH meta refresh (instant redirect)

### 4. Frontend Share Dialog Update
Update `ResultActionBar.tsx` to copy the edge function URL for social sharing while displaying the branded URL for user clarity:

```typescript
const handleCopyLink = async () => {
  try {
    // Copy the edge function URL which handles bot detection
    await navigator.clipboard.writeText(shareUrl);
    // ...
  }
};
```

## Technical Details

### Bot-Friendly HTML Response
```html
<!-- For Bots (NO meta refresh) -->
<html>
<head>
  <meta property="og:title" content="Project Title | MotionMax">
  <meta property="og:image" content="[dynamic-thumbnail-url]">
  <meta property="og:url" content="https://motionmax.io/share/[token]">
  <!-- NO meta refresh - let bot see the meta tags -->
  <link rel="canonical" href="https://motionmax.io/share/[token]">
</head>
<body>
  <p>View on MotionMax</p>
  <a href="https://motionmax.io/share/[token]">Click here</a>
</body>
</html>
```

### Human-Friendly HTML Response
```html
<!-- For Humans (WITH instant meta refresh) -->
<html>
<head>
  <meta http-equiv="refresh" content="0;url=https://motionmax.io/share/[token]">
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>
```

## Files to Modify

1. **`supabase/functions/share-meta/index.ts`**
   - Add bot User-Agent detection
   - Conditionally include/exclude meta refresh based on bot detection
   - Add logging for debugging

2. **`src/components/workspace/ResultActionBar.tsx`**
   - Change `handleCopyLink` to copy `shareUrl` (edge function URL) instead of `displayUrl`
   - Update UI text to explain the link works on social media

## Expected Outcome
- When sharing on Twitter/Facebook/LinkedIn: Correct project thumbnail and title appear
- When clicking the link: User is instantly redirected to the MotionMax app
- Branded `motionmax.io` URL still shown in the share dialog for clarity

## Notes
- The edge function URL will be copied to clipboard (not the branded URL)
- This is the same approach used by menlifoot.ca
- No external services (like Cloudflare) are required
- Works entirely within Lovable Cloud capabilities

