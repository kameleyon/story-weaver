-- Create webhook_events table for Stripe event idempotency tracking
CREATE TABLE public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Deny all access to webhook_events"
ON public.webhook_events
FOR ALL
USING (false)
WITH CHECK (false);

-- Auto-cleanup events older than 30 days (via index for efficient queries)
CREATE INDEX idx_webhook_events_processed_at ON public.webhook_events (processed_at);