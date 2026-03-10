# Large Table Data Export Guide

The following tables are too large to export as inline SQL INSERT statements through Lovable. You need to export them directly from your **source Supabase project**.

## Tables That Need Manual Export

| Table | Row Count | Why It's Large |
|---|---|---|
| `projects` | ~50+ | Huge `content` text fields (full scripts) |
| `generations` | ~50+ | Massive `scenes` JSONB (images, audio URLs, metadata) |
| `credit_transactions` | ~100+ | Many transaction records |
| `generation_costs` | ~50+ | Cost tracking per generation |
| `api_call_logs` | **8,628** | Every API call logged |
| `system_logs` | **7,412** | System event logs |
| `video_generation_jobs` | ~100+ | Large JSONB payloads |
| `project_shares` | ~20 | Manageable but has signed URLs |

## How to Export (Two Options)

### Option A: Supabase Dashboard CSV Export (Easiest)

1. Go to your **source** Supabase Dashboard → **Table Editor**
2. For each table above, click the table name
3. Click **Export** → **CSV**
4. In your **target** Supabase Dashboard → **Table Editor**
5. Click the table → **Import** → upload the CSV

### Option B: pg_dump (Most Reliable for Large Data)

```bash
# Get your source database connection string from:
# Supabase Dashboard → Settings → Database → Connection string (URI)

# Export specific tables as INSERT statements
pg_dump "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres" \
  --data-only \
  --inserts \
  --table=public.projects \
  --table=public.generations \
  --table=public.credit_transactions \
  --table=public.generation_costs \
  --table=public.api_call_logs \
  --table=public.system_logs \
  --table=public.video_generation_jobs \
  --table=public.project_shares \
  -f migration_data_large.sql

# Then import into your target database
psql "postgresql://postgres.[TARGET_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres" \
  -f migration_data_large.sql
```

## ⚠️ Important Notes

1. **Signed URLs will expire**: Many `audio_url`, `image_url`, `sample_url` fields contain signed URLs from the source project. These will expire and won't work on the new project. You'll need to either:
   - Re-generate the content on the new project
   - Copy the actual files from the source storage buckets to the target

2. **Storage files are NOT included**: The SQL migration only covers database records. To migrate the actual files (images, audio, videos), you need to download them from the source storage buckets and re-upload to the target project's buckets.

3. **Auth users**: `auth.users` is managed by Supabase Auth. Users will need to re-register on the new project, OR you can use the [Supabase Management API](https://supabase.com/docs/reference/api/introduction) to programmatically create users with their existing UUIDs.

4. **Run order**: 
   1. `001_full_schema.sql` (creates tables, functions, policies)
   2. `002_data_small_tables.sql` (inserts small table data)
   3. Large table data (via pg_dump or CSV import)

## Edge Functions

All 14 edge functions are already in your repo at `supabase/functions/`. Deploy them with:

```bash
cd your-project-root
supabase link --project-ref YOUR_TARGET_PROJECT_REF

# Deploy all at once
supabase functions deploy generate-video
supabase functions deploy generate-cinematic
supabase functions deploy check-subscription
supabase functions deploy create-checkout
supabase functions deploy customer-portal
supabase functions deploy stripe-webhook
supabase functions deploy manage-api-keys
supabase functions deploy clone-voice
supabase functions deploy delete-voice
supabase functions deploy get-shared-project
supabase functions deploy share-meta
supabase functions deploy admin-stats
supabase functions deploy refresh-project-thumbnails
```

Then set all secrets (see MIGRATION_GUIDE.md Step 4).
