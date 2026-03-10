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

-- profiles
CREATE POLICY "Authenticated users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can create their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can delete their own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;

-- user_roles
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to user_roles" ON public.user_roles FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- subscriptions
CREATE POLICY "Authenticated users can view their own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to subscriptions" ON public.subscriptions FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Deny direct subscription inserts" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Deny direct subscription updates" ON public.subscriptions FOR UPDATE TO authenticated USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- user_credits
CREATE POLICY "Authenticated users can view their own credits" ON public.user_credits FOR SELECT TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users cannot insert credits" ON public.user_credits FOR INSERT TO authenticated WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Authenticated users cannot update credits" ON public.user_credits FOR UPDATE TO authenticated USING (false) WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Authenticated users cannot delete credits" ON public.user_credits FOR DELETE TO authenticated USING (false) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to user_credits" ON public.user_credits FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Service role can insert credits" ON public.user_credits FOR INSERT TO service_role WITH CHECK (true) AS RESTRICTIVE;
CREATE POLICY "Service role can update credits" ON public.user_credits FOR UPDATE TO service_role USING (true) WITH CHECK (true) AS RESTRICTIVE;
CREATE POLICY "Service role can delete credits" ON public.user_credits FOR DELETE TO service_role USING (true) AS RESTRICTIVE;

-- credit_transactions
CREATE POLICY "Users can view their own credit transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Only service role can insert credit transactions" ON public.credit_transactions FOR INSERT WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to credit_transactions" ON public.credit_transactions FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- projects
CREATE POLICY "Users can view their own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can create their own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can delete their own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to projects" ON public.projects FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- generations
CREATE POLICY "Authenticated users can view their own generations" ON public.generations FOR SELECT TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can create their own generations" ON public.generations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can update their own generations" ON public.generations FOR UPDATE TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can delete their own generations" ON public.generations FOR DELETE TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;

-- generation_archives
CREATE POLICY "Admins can view all archives" ON public.generation_archives FOR SELECT TO authenticated USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to generation_archives" ON public.generation_archives FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- generation_costs
CREATE POLICY "Admins can view all costs" ON public.generation_costs FOR SELECT USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to generation_costs" ON public.generation_costs FOR ALL USING (false) WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Service role can insert costs" ON public.generation_costs FOR INSERT TO service_role WITH CHECK (true) AS RESTRICTIVE;

-- api_call_logs
CREATE POLICY "Admins can view all api_call_logs" ON public.api_call_logs FOR SELECT USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to api_call_logs" ON public.api_call_logs FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Service role can insert api_call_logs" ON public.api_call_logs FOR INSERT TO service_role WITH CHECK (true) AS RESTRICTIVE;

-- project_characters
CREATE POLICY "Users can view their own characters" ON public.project_characters FOR SELECT USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can create their own characters" ON public.project_characters FOR INSERT WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can update their own characters" ON public.project_characters FOR UPDATE USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can delete their own characters" ON public.project_characters FOR DELETE USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to project_characters" ON public.project_characters FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- project_shares
CREATE POLICY "Users can view their own shares" ON public.project_shares FOR SELECT USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can create their own shares" ON public.project_shares FOR INSERT WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can delete their own shares" ON public.project_shares FOR DELETE USING (auth.uid() = user_id) AS RESTRICTIVE;

-- user_api_keys
CREATE POLICY "Authenticated users can view their own API keys" ON public.user_api_keys FOR SELECT TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can insert their own API keys" ON public.user_api_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can update their own API keys" ON public.user_api_keys FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Authenticated users can delete their own API keys" ON public.user_api_keys FOR DELETE TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to user_api_keys" ON public.user_api_keys FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- user_voices
CREATE POLICY "Users can view their own voices" ON public.user_voices FOR SELECT USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can create their own voices" ON public.user_voices FOR INSERT WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can update their own voices" ON public.user_voices FOR UPDATE USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can delete their own voices" ON public.user_voices FOR DELETE USING (auth.uid() = user_id) AS RESTRICTIVE;

-- system_logs
CREATE POLICY "Admins can view all system_logs" ON public.system_logs FOR SELECT USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Deny anon select system_logs" ON public.system_logs FOR SELECT TO anon USING (false) AS RESTRICTIVE;
CREATE POLICY "Deny anon insert system_logs" ON public.system_logs FOR INSERT TO anon WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Deny anon update system_logs" ON public.system_logs FOR UPDATE TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;
CREATE POLICY "Deny anon delete system_logs" ON public.system_logs FOR DELETE TO anon USING (false) AS RESTRICTIVE;

-- admin_logs
CREATE POLICY "Admins can view all logs" ON public.admin_logs FOR SELECT TO authenticated USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Admins can insert logs" ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to admin_logs" ON public.admin_logs FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- user_flags
CREATE POLICY "Admins can view all flags" ON public.user_flags FOR SELECT TO authenticated USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Admins can create flags" ON public.user_flags FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Admins can update flags" ON public.user_flags FOR UPDATE TO authenticated USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Admins can delete flags" ON public.user_flags FOR DELETE TO authenticated USING (is_admin(auth.uid())) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to user_flags" ON public.user_flags FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- video_generation_jobs
CREATE POLICY "Users can view their own jobs" ON public.video_generation_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can insert their own jobs" ON public.video_generation_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Users can update their own jobs" ON public.video_generation_jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) AS RESTRICTIVE;
CREATE POLICY "Deny anonymous access to video_generation_jobs" ON public.video_generation_jobs FOR ALL TO anon USING (false) WITH CHECK (false) AS RESTRICTIVE;
-- Worker policies (permissive for service-role operations)
CREATE POLICY "worker_read_jobs" ON public.video_generation_jobs FOR SELECT USING (true) AS RESTRICTIVE;
CREATE POLICY "worker_insert_jobs" ON public.video_generation_jobs FOR INSERT WITH CHECK (true) AS RESTRICTIVE;
CREATE POLICY "worker_update_jobs" ON public.video_generation_jobs FOR UPDATE USING (true) AS RESTRICTIVE;
CREATE POLICY "worker_delete_jobs" ON public.video_generation_jobs FOR DELETE USING (true) AS RESTRICTIVE;

-- webhook_events
CREATE POLICY "Deny all access to webhook_events" ON public.webhook_events FOR ALL USING (false) WITH CHECK (false) AS RESTRICTIVE;

-- ==================== STORAGE BUCKETS ====================
-- Run these via Supabase Dashboard > Storage or SQL:

INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('source_uploads', 'source_uploads', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('voice_samples', 'voice_samples', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('scene-images', 'scene-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-files', 'audio-files', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('scene-videos', 'scene-videos', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('project-thumbnails', 'project-thumbnails', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('style-references', 'style-references', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT DO NOTHING;

-- Storage policies for public buckets (allow authenticated uploads, public reads)
CREATE POLICY "Public read scene-images" ON storage.objects FOR SELECT USING (bucket_id = 'scene-images');
CREATE POLICY "Auth upload scene-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scene-images');
CREATE POLICY "Public read audio-files" ON storage.objects FOR SELECT USING (bucket_id = 'audio-files');
CREATE POLICY "Auth upload audio-files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio-files');
CREATE POLICY "Public read scene-videos" ON storage.objects FOR SELECT USING (bucket_id = 'scene-videos');
CREATE POLICY "Auth upload scene-videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'scene-videos');
CREATE POLICY "Public read project-thumbnails" ON storage.objects FOR SELECT USING (bucket_id = 'project-thumbnails');
CREATE POLICY "Auth upload project-thumbnails" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-thumbnails');
CREATE POLICY "Public read style-references" ON storage.objects FOR SELECT USING (bucket_id = 'style-references');
CREATE POLICY "Auth upload style-references" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'style-references');
CREATE POLICY "Public read videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY "Auth upload videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'videos');

-- Private buckets: only owner can read/write
CREATE POLICY "Owner read audio" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner upload audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner read voice_samples" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'voice_samples' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner upload voice_samples" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voice_samples' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner read source_uploads" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'source_uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner upload source_uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'source_uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
