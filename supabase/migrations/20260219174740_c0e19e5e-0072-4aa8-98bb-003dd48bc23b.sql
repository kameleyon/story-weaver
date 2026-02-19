-- Create atomic credit increment function to avoid race conditions in webhook
-- This replaces the read-modify-write pattern with a single atomic DB operation
CREATE OR REPLACE FUNCTION public.increment_user_credits(
  p_user_id UUID,
  p_credits INTEGER
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_credits
  SET
    credits_balance = credits_balance + p_credits,
    total_purchased = total_purchased + p_credits,
    updated_at = now()
  WHERE user_id = p_user_id;
$$;