
-- Block ALL access on every table by adding restrictive deny-all policies

-- profiles
CREATE POLICY "lockdown_profiles" ON public.profiles AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- projects
CREATE POLICY "lockdown_projects" ON public.projects AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- generations
CREATE POLICY "lockdown_generations" ON public.generations AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- subscriptions
CREATE POLICY "lockdown_subscriptions" ON public.subscriptions AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- user_credits
CREATE POLICY "lockdown_user_credits" ON public.user_credits AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- credit_transactions
CREATE POLICY "lockdown_credit_transactions" ON public.credit_transactions AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- user_roles
CREATE POLICY "lockdown_user_roles" ON public.user_roles AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- user_api_keys
CREATE POLICY "lockdown_user_api_keys" ON public.user_api_keys AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- user_voices
CREATE POLICY "lockdown_user_voices" ON public.user_voices AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- user_flags
CREATE POLICY "lockdown_user_flags" ON public.user_flags AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- project_characters
CREATE POLICY "lockdown_project_characters" ON public.project_characters AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- project_shares
CREATE POLICY "lockdown_project_shares" ON public.project_shares AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- generation_archives
CREATE POLICY "lockdown_generation_archives" ON public.generation_archives AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- generation_costs
CREATE POLICY "lockdown_generation_costs" ON public.generation_costs AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- api_call_logs
CREATE POLICY "lockdown_api_call_logs" ON public.api_call_logs AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- system_logs
CREATE POLICY "lockdown_system_logs" ON public.system_logs AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- admin_logs
CREATE POLICY "lockdown_admin_logs" ON public.admin_logs AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- video_generation_jobs
CREATE POLICY "lockdown_video_generation_jobs" ON public.video_generation_jobs AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);

-- webhook_events
CREATE POLICY "lockdown_webhook_events" ON public.webhook_events AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);
