
CREATE TABLE public.video_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  task_type TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  payload JSONB NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.video_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Block anonymous access
CREATE POLICY "Deny anonymous access to video_generation_jobs"
ON public.video_generation_jobs AS RESTRICTIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

-- Users can insert their own jobs
CREATE POLICY "Users can insert their own jobs"
ON public.video_generation_jobs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own jobs
CREATE POLICY "Users can view their own jobs"
ON public.video_generation_jobs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Users can update their own jobs
CREATE POLICY "Users can update their own jobs"
ON public.video_generation_jobs FOR UPDATE TO authenticated
USING (auth.uid() = user_id);
