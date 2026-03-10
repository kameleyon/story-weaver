# Storage File Migration Guide

Your source project has **1,753 scene images** in the `audio` bucket (1,687 with signed tokens).

## Step 1: Get File Manifests

Use the `migrate-storage` edge function (admin-only) to generate signed download URLs.

### List all buckets with file counts:
```javascript
const { data: { session } } = await supabase.auth.getSession();
const headers = { 'Authorization': `Bearer ${session.access_token}` };

const res = await fetch(
  'https://hesnceozbedzrgvylqrm.supabase.co/functions/v1/migrate-storage?action=list',
  { headers }
);
console.log(await res.json());
```

### Generate manifest for a specific bucket:
```javascript
const res = await fetch(
  'https://hesnceozbedzrgvylqrm.supabase.co/functions/v1/migrate-storage?action=manifest&bucket=audio',
  { headers }
);
const manifest = await res.json();
// Download the manifest JSON
const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'audio_manifest.json';
a.click();
```

Repeat for each bucket: `scene-images`, `audio-files`, `scene-videos`, `project-thumbnails`, `style-references`, `videos`, `voice_samples`, `source_uploads`.

## Step 2: Run Migration Script

Save the following as `migrate-storage.mjs` and run with Node.js:

```javascript
// migrate-storage.mjs
// Usage: node migrate-storage.mjs <manifest.json> <bucket_name>
//
// Env vars needed:
//   SOURCE_SUPABASE_URL     — old project URL
//   SOURCE_SERVICE_KEY      — old project service role key
//   TARGET_SUPABASE_URL     — new project URL
//   TARGET_SERVICE_KEY      — new project service role key

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const sourceKey = process.env.SOURCE_SERVICE_KEY;
const targetUrl = process.env.TARGET_SUPABASE_URL;
const targetKey = process.env.TARGET_SERVICE_KEY;

if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
  console.error('Set SOURCE_SUPABASE_URL, SOURCE_SERVICE_KEY, TARGET_SUPABASE_URL, TARGET_SERVICE_KEY');
  process.exit(1);
}

const [,, manifestPath, bucketName] = process.argv;
if (!manifestPath || !bucketName) {
  console.error('Usage: node migrate-storage.mjs <manifest.json> <bucket_name>');
  process.exit(1);
}

const source = createClient(sourceUrl, sourceKey);
const target = createClient(targetUrl, targetKey);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const files = manifest.files || [];

console.log(`Migrating ${files.length} files from bucket "${bucketName}"...`);

let success = 0;
let failed = 0;

for (const file of files) {
  try {
    // Download from source
    const { data, error: dlError } = await source.storage
      .from(bucketName)
      .download(file.path);
    
    if (dlError || !data) {
      console.error(`  SKIP ${file.path}: ${dlError?.message || 'no data'}`);
      failed++;
      continue;
    }

    // Upload to target (upsert to avoid conflicts)
    const { error: upError } = await target.storage
      .from(bucketName)
      .upload(file.path, data, { upsert: true, contentType: data.type });

    if (upError) {
      console.error(`  FAIL ${file.path}: ${upError.message}`);
      failed++;
    } else {
      success++;
      if (success % 50 === 0) console.log(`  Progress: ${success}/${files.length}`);
    }
  } catch (e) {
    console.error(`  ERROR ${file.path}: ${e.message}`);
    failed++;
  }
}

console.log(`\nDone! ${success} migrated, ${failed} failed out of ${files.length} total.`);
```

### Run it:
```bash
npm install @supabase/supabase-js

export SOURCE_SUPABASE_URL="https://OLD_PROJECT.supabase.co"
export SOURCE_SERVICE_KEY="your-old-service-role-key"
export TARGET_SUPABASE_URL="https://NEW_PROJECT.supabase.co"
export TARGET_SERVICE_KEY="your-new-service-role-key"

# Migrate each bucket
node migrate-storage.mjs audio_manifest.json audio
node migrate-storage.mjs scene-images_manifest.json scene-images
node migrate-storage.mjs audio-files_manifest.json audio-files
node migrate-storage.mjs scene-videos_manifest.json scene-videos
node migrate-storage.mjs project-thumbnails_manifest.json project-thumbnails
node migrate-storage.mjs videos_manifest.json videos
node migrate-storage.mjs voice_samples_manifest.json voice_samples
```

## Step 3: Verify

After migration, verify file counts match:
```sql
-- In the new project's SQL editor, check storage objects
SELECT bucket_id, count(*) 
FROM storage.objects 
GROUP BY bucket_id 
ORDER BY count DESC;
```

## ⚠️ Important Notes

1. **Signed URLs in DB records** will still point to the OLD project. After migrating storage files, the `get-shared-project` edge function's URL refresh logic will automatically generate new signed URLs pointing to the new project's storage.

2. **Public bucket files** (`scene-images`, `audio-files`, etc.) will have new public URLs on the target project. Database records referencing old public URLs will need updating — but signed URL refresh handles this for scenes.

3. **The `audio` bucket** is private, so all URLs are signed and will be refreshed automatically by the edge functions.

4. **Large files** (videos) may time out. For the `videos` and `scene-videos` buckets, consider running the migration script in smaller batches or increasing Node.js timeout.
