-- Add unique constraint on stripe_payment_intent_id for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_pi_unique
ON public.credit_transactions (stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;