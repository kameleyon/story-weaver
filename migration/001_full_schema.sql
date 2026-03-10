-- ============================================================
-- FULL SCHEMA MIGRATION for MotionMax / AudioMax
-- Run this in your target Supabase project via SQL Editor
-- ============================================================

-- ==================== ENUMS ====================

CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TYPE public.subscription_status AS ENUM (
  'active', 'canceled', 'past_due', 'trialing',
  'incomplete', 'incomplete_expired', 'unpaid'
);

-- ==================== TABLES ====================

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User Roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text,
  plan_name text NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User Credits
CREATE TABLE public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  credits_balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  total_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Credit Transactions
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  transaction_type text NOT NULL,
  description text,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  content text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'landscape',
  length text NOT NULL DEFAULT 'short',
  style text NOT NULL DEFAULT 'modern-minimalist',
  status text NOT NULL DEFAULT 'draft',
  project_type text NOT NULL DEFAULT 'doc2video',
  is_favorite boolean NOT NULL DEFAULT false,
  disable_expressions boolean NOT NULL DEFAULT false,
  brand_mark text,
  presenter_focus text,
  character_description text,
  character_consistency_enabled boolean DEFAULT false,
  inspiration_style text,
  story_tone text,
  story_genre text,
  voice_inclination text,
  voice_type text DEFAULT 'standard',
  voice_id text,
  voice_name text,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Generations
CREATE TABLE public.generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  script text,
  scenes jsonb,
  audio_url text,
  video_url text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Generation Archives
CREATE TABLE public.generation_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  script text,
  scenes jsonb,
  audio_url text,
  video_url text,
  error_message text,
  original_created_at timestamptz NOT NULL,
  original_completed_at timestamptz,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

-- Generation Costs
CREATE TABLE public.generation_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  openrouter_cost numeric DEFAULT 0,
  replicate_cost numeric DEFAULT 0,
  hypereal_cost numeric DEFAULT 0,
  google_tts_cost numeric DEFAULT 0,
  total_cost numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- API Call Logs
CREATE TABLE public.api_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  generation_id uuid,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  queue_time_ms integer,
  running_time_ms integer,
  total_duration_ms integer,
  cost numeric DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Project Characters
CREATE TABLE public.project_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  character_name text NOT NULL,
  description text NOT NULL,
  reference_image_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Project Shares
CREATE TABLE public.project_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  user_id uuid NOT NULL,
  share_token text NOT NULL,
  view_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User API Keys
CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  gemini_api_key text,
  replicate_api_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User Voices
CREATE TABLE public.user_voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  voice_name text NOT NULL,
  voice_id text NOT NULL,
  sample_url text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- System Logs
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  generation_id uuid,
  project_id uuid,
  event_type text NOT NULL,
  category text NOT NULL,
  message text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Admin Logs
CREATE TABLE public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User Flags
CREATE TABLE public.user_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flag_type text NOT NULL,
  reason text NOT NULL,
  details text,
  flagged_by uuid NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Video Generation Jobs
CREATE TABLE public.video_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  user_id uuid NOT NULL,
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  progress integer DEFAULT 0,
  payload jsonb NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Webhook Events
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable realtime for video_generation_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_generation_jobs;

-- ==================== FUNCTIONS ====================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.increment_user_credits(p_user_id uuid, p_credits integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.user_credits
  SET credits_balance = credits_balance + p_credits,
      total_purchased = total_purchased + p_credits,
      updated_at = now()
  WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits_securely(p_user_id uuid, p_amount integer, p_transaction_type text, p_description text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE current_balance INT;
BEGIN
  SELECT credits_balance INTO current_balance FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF current_balance IS NULL OR current_balance < p_amount THEN RETURN FALSE; END IF;
  UPDATE user_credits SET credits_balance = credits_balance - p_amount, total_used = total_used + p_amount, updated_at = NOW() WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, transaction_type, description) VALUES (p_user_id, -p_amount, p_transaction_type, p_description);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_scene_at_index(p_generation_id uuid, p_scene_index integer, p_scene_data jsonb, p_progress integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE generations SET scenes = jsonb_set(scenes, ARRAY[p_scene_index::text], p_scene_data), progress = COALESCE(p_progress, progress) WHERE id = p_generation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_project(share_token_param text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  share_record record; project_record record; generation_record record; result json;
BEGIN
  SELECT * INTO share_record FROM project_shares WHERE share_token = share_token_param;
  IF share_record IS NULL THEN RETURN NULL; END IF;
  IF share_record.expires_at IS NOT NULL AND share_record.expires_at < now() THEN RETURN NULL; END IF;
  SELECT id, title, format, style, description INTO project_record FROM projects WHERE id = share_record.project_id;
  IF project_record IS NULL THEN RETURN NULL; END IF;
  SELECT scenes, audio_url INTO generation_record FROM generations WHERE project_id = share_record.project_id AND status = 'complete' ORDER BY created_at DESC LIMIT 1;
  UPDATE project_shares SET view_count = view_count + 1 WHERE id = share_record.id;
  result := json_build_object(
    'project', json_build_object('id', project_record.id, 'title', project_record.title, 'format', project_record.format, 'style', project_record.style, 'description', project_record.description),
    'scenes', COALESCE(generation_record.scenes, '[]'::jsonb),
    'share', json_build_object('id', share_record.id, 'view_count', share_record.view_count + 1)
  );
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE safe_display_name TEXT;
BEGIN
  safe_display_name := COALESCE(substring(NEW.raw_user_meta_data->>'full_name', 1, 100), split_part(NEW.email, '@', 1));
  safe_display_name := regexp_replace(safe_display_name, '[^a-zA-Z0-9 ''._-]', '', 'g');
  IF safe_display_name IS NULL OR length(trim(safe_display_name)) = 0 THEN safe_display_name := 'User'; END IF;
  safe_display_name := trim(safe_display_name);
  BEGIN
    INSERT INTO public.profiles (user_id, display_name) VALUES (NEW.id, safe_display_name);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Trigger: auto-create profile on new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==================== ENABLE RLS ====================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ==================== RLS POLICIES ====================
-- Correct syntax: CREATE POLICY "name" ON table AS RESTRICTIVE FOR command TO role USING (...) WITH CHECK (...);

-- profiles
CREATE POLICY "profiles_select" ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert" ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_delete" ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- user_roles
CREATE POLICY "user_roles_select" ON public.user_roles AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "user_roles_insert" ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "user_roles_update" ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "user_roles_delete" ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "user_roles_deny_anon" ON public.user_roles AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- subscriptions
CREATE POLICY "subscriptions_select" ON public.subscriptions AS RESTRICTIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "subscriptions_deny_anon" ON public.subscriptions AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "subscriptions_deny_insert" ON public.subscriptions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "subscriptions_deny_update" ON public.subscriptions AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

-- user_credits
CREATE POLICY "user_credits_select" ON public.user_credits AS RESTRICTIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_credits_deny_insert" ON public.user_credits AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "user_credits_deny_update" ON public.user_credits AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "user_credits_deny_delete" ON public.user_credits AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY "user_credits_deny_anon" ON public.user_credits AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "user_credits_sr_insert" ON public.user_credits AS RESTRICTIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "user_credits_sr_update" ON public.user_credits AS RESTRICTIVE FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "user_credits_sr_delete" ON public.user_credits AS RESTRICTIVE FOR DELETE TO service_role USING (true);

-- credit_transactions
CREATE POLICY "credit_tx_select" ON public.credit_transactions AS RESTRICTIVE FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "credit_tx_deny_insert" ON public.credit_transactions AS RESTRICTIVE FOR INSERT WITH CHECK (false);
CREATE POLICY "credit_tx_deny_anon" ON public.credit_transactions AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- projects
CREATE POLICY "projects_select" ON public.projects AS RESTRICTIVE FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "projects_insert" ON public.projects AS RESTRICTIVE FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_update" ON public.projects AS RESTRICTIVE FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "projects_delete" ON public.projects AS RESTRICTIVE FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "projects_deny_anon" ON public.projects AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- generations
CREATE POLICY "generations_select" ON public.generations AS RESTRICTIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "generations_insert" ON public.generations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "generations_update" ON public.generations AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "generations_delete" ON public.generations AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- generation_archives
CREATE POLICY "gen_archives_select" ON public.generation_archives AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "gen_archives_deny_anon" ON public.generation_archives AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- generation_costs
CREATE POLICY "gen_costs_select" ON public.generation_costs AS RESTRICTIVE FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "gen_costs_deny_all" ON public.generation_costs AS RESTRICTIVE FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "gen_costs_sr_insert" ON public.generation_costs AS RESTRICTIVE FOR INSERT TO service_role WITH CHECK (true);

-- api_call_logs
CREATE POLICY "api_logs_select" ON public.api_call_logs AS RESTRICTIVE FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "api_logs_deny_anon" ON public.api_call_logs AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "api_logs_sr_insert" ON public.api_call_logs AS RESTRICTIVE FOR INSERT TO service_role WITH CHECK (true);

-- project_characters
CREATE POLICY "chars_select" ON public.project_characters AS RESTRICTIVE FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "chars_insert" ON public.project_characters AS RESTRICTIVE FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chars_update" ON public.project_characters AS RESTRICTIVE FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "chars_delete" ON public.project_characters AS RESTRICTIVE FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "chars_deny_anon" ON public.project_characters AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- project_shares
CREATE POLICY "shares_select" ON public.project_shares AS RESTRICTIVE FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "shares_insert" ON public.project_shares AS RESTRICTIVE FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shares_delete" ON public.project_shares AS RESTRICTIVE FOR DELETE USING (auth.uid() = user_id);

-- user_api_keys
CREATE POLICY "api_keys_select" ON public.user_api_keys AS RESTRICTIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "api_keys_insert" ON public.user_api_keys AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "api_keys_update" ON public.user_api_keys AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "api_keys_delete" ON public.user_api_keys AS RESTRICTIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "api_keys_deny_anon" ON public.user_api_keys AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- user_voices
CREATE POLICY "voices_select" ON public.user_voices AS RESTRICTIVE FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "voices_insert" ON public.user_voices AS RESTRICTIVE FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "voices_update" ON public.user_voices AS RESTRICTIVE FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "voices_delete" ON public.user_voices AS RESTRICTIVE FOR DELETE USING (auth.uid() = user_id);

-- system_logs
CREATE POLICY "sys_logs_admin_select" ON public.system_logs AS RESTRICTIVE FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "sys_logs_deny_anon_select" ON public.system_logs AS RESTRICTIVE FOR SELECT TO anon USING (false);
CREATE POLICY "sys_logs_deny_anon_insert" ON public.system_logs AS RESTRICTIVE FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "sys_logs_deny_anon_update" ON public.system_logs AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "sys_logs_deny_anon_delete" ON public.system_logs AS RESTRICTIVE FOR DELETE TO anon USING (false);

-- admin_logs
CREATE POLICY "admin_logs_select" ON public.admin_logs AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "admin_logs_insert" ON public.admin_logs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "admin_logs_deny_anon" ON public.admin_logs AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- user_flags
CREATE POLICY "flags_select" ON public.user_flags AS RESTRICTIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "flags_insert" ON public.user_flags AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "flags_update" ON public.user_flags AS RESTRICTIVE FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "flags_delete" ON public.user_flags AS RESTRICTIVE FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "flags_deny_anon" ON public.user_flags AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- video_generation_jobs
CREATE POLICY "vgj_select" ON public.video_generation_jobs AS RESTRICTIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vgj_insert" ON public.video_generation_jobs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vgj_update" ON public.video_generation_jobs AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "vgj_deny_anon" ON public.video_generation_jobs AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "vgj_worker_read" ON public.video_generation_jobs FOR SELECT USING (true);
CREATE POLICY "vgj_worker_insert" ON public.video_generation_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "vgj_worker_update" ON public.video_generation_jobs FOR UPDATE USING (true);
CREATE POLICY "vgj_worker_delete" ON public.video_generation_jobs FOR DELETE USING (true);

-- webhook_events
CREATE POLICY "webhook_deny_all" ON public.webhook_events AS RESTRICTIVE FOR ALL USING (false) WITH CHECK (false);

-- ==================== STORAGE BUCKETS ====================

INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('source_uploads', 'source_uploads', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('voice_samples', 'voice_samples', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('scene-images', 'scene-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-files', 'audio-files', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('scene-videos', 'scene-videos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('project-thumbnails', 'project-thumbnails', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('style-references', 'style-references', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT DO NOTHING;

-- Storage policies for public buckets
CREATE POLICY "pub_read_scene_images" ON storage.objects FOR SELECT USING (bucket_id = 'scene-images');
CREATE POLICY "auth_upload_scene_images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scene-images');
CREATE POLICY "pub_read_audio_files" ON storage.objects FOR SELECT USING (bucket_id = 'audio-files');
CREATE POLICY "auth_upload_audio_files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio-files');
CREATE POLICY "pub_read_scene_videos" ON storage.objects FOR SELECT USING (bucket_id = 'scene-videos');
CREATE POLICY "auth_upload_scene_videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scene-videos');
CREATE POLICY "pub_read_thumbnails" ON storage.objects FOR SELECT USING (bucket_id = 'project-thumbnails');
CREATE POLICY "auth_upload_thumbnails" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-thumbnails');
CREATE POLICY "pub_read_style_refs" ON storage.objects FOR SELECT USING (bucket_id = 'style-references');
CREATE POLICY "auth_upload_style_refs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'style-references');
CREATE POLICY "pub_read_videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY "auth_upload_videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'videos');

-- Private buckets: only owner can read/write
CREATE POLICY "owner_read_audio" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_upload_audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_read_voice_samples" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'voice_samples' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_upload_voice_samples" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voice_samples' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_read_source_uploads" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'source_uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_upload_source_uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'source_uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
