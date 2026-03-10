# Full Migration Guide — MotionMax/AudioMax

## Step 1: Run the Schema Migration

1. Open your target Supabase project dashboard → **SQL Editor**
2. Paste the contents of `001_full_schema.sql` and run it
3. This creates all tables, enums, functions, RLS policies, storage buckets, and the auth trigger

## Step 2: Export & Import Data

From the **source** Supabase project, export data for each table using the dashboard or `pg_dump`.

**Quick CSV export approach** (via Dashboard > Table Editor > Export):
- `profiles`
- `user_roles`
- `subscriptions`
- `user_credits`
- `credit_transactions`
- `projects`
- `generations`
- `generation_archives`
- `generation_costs`
- `api_call_logs`
- `project_characters`
- `project_shares`
- `user_api_keys`
- `user_voices`
- `system_logs`
- `admin_logs`
- `user_flags`
- `video_generation_jobs`
- `webhook_events`

Then import the CSVs into the target project via Table Editor > Import.

**⚠️ Important**: `auth.users` is managed by Supabase Auth. You cannot directly export/import it. Users will need to re-register, OR you can use the Supabase Management API to programmatically create users.

## Step 3: Deploy Edge Functions

Copy the entire `supabase/functions/` directory to your local Supabase CLI project, then deploy:

```bash
# From your project root (where supabase/ lives)
supabase functions deploy generate-video --project-ref YOUR_PROJECT_REF
supabase functions deploy generate-cinematic --project-ref YOUR_PROJECT_REF
supabase functions deploy check-subscription --project-ref YOUR_PROJECT_REF
supabase functions deploy create-checkout --project-ref YOUR_PROJECT_REF
supabase functions deploy customer-portal --project-ref YOUR_PROJECT_REF
supabase functions deploy stripe-webhook --project-ref YOUR_PROJECT_REF
supabase functions deploy manage-api-keys --project-ref YOUR_PROJECT_REF
supabase functions deploy clone-voice --project-ref YOUR_PROJECT_REF
supabase functions deploy delete-voice --project-ref YOUR_PROJECT_REF
supabase functions deploy get-shared-project --project-ref YOUR_PROJECT_REF
supabase functions deploy share-meta --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-stats --project-ref YOUR_PROJECT_REF
supabase functions deploy refresh-project-thumbnails --project-ref YOUR_PROJECT_REF
```

## Step 4: Set Edge Function Secrets

In your target Supabase dashboard → **Settings → Edge Functions → Secrets**, add:

| Secret Name | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → Signing secret |
| `HYPEREAL_API_KEY` | Hypereal account |
| `GOOGLE_TTS_API_KEY` | Google Cloud Console |
| `GOOGLE_TTS_API_KEY_2` | Google Cloud Console (backup) |
| `GOOGLE_TTS_API_KEY_3` | Google Cloud Console (backup) |
| `LEMONFOX_API_KEY` | Lemonfox account |
| `REPLICATE_API_TOKEN` | Replicate account |
| `REPLICATE_TTS_API_KEY` | Replicate account (TTS) |
| `OPENROUTER_API_KEY` | OpenRouter account |
| `ELEVENLABS_API_KEY` | ElevenLabs account |
| `GLIF_API_KEY` | Glif account |
| `GLIF_API_TOKEN` | Glif account |
| `POLLO_API_KEY` | Pollo account |
| `ENCRYPTION_KEY` | Generate a random 64-char hex string |

**Auto-provided by Supabase** (no need to set):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

## Step 5: Update Frontend Config

In your frontend `.env` (or environment variables):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_REF
```

## Step 6: Update `config.toml`

Replace the `project_id` in `supabase/config.toml`:

```toml
project_id = "YOUR_PROJECT_REF"
```

All `[functions.*]` entries should keep `verify_jwt = false` (auth is validated in code).

## Step 7: Configure Stripe Webhook

In Stripe Dashboard → Webhooks, create a new endpoint:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Subscribe to events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Step 8: Bootstrap Admin User

After your admin user signs up, manually insert their role:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('YOUR_ADMIN_USER_UUID', 'admin');
```

## Step 9: Storage Bucket Verification

Verify all 9 storage buckets were created (Dashboard → Storage):
- `audio` (private)
- `source_uploads` (private)
- `voice_samples` (private)
- `scene-images` (public)
- `audio-files` (public)
- `scene-videos` (public)
- `project-thumbnails` (public)
- `style-references` (public)
- `videos` (public)

---

## Troubleshooting

- **RLS errors on insert**: Ensure the user is authenticated and `user_id` matches `auth.uid()`
- **Edge function 500s**: Check that all secrets are set in the target project
- **Missing data**: Supabase queries default to 1000 rows max; use pagination for large exports
- **Auth trigger not firing**: Verify the `on_auth_user_created` trigger exists on `auth.users`
