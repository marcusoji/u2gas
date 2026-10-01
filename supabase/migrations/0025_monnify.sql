-- ============================================================================
-- 0025: Paystack -> Monnify.
--
-- The online gateway changes from Paystack to Monnify. Three things carry the
-- old name and all three are renamed here, so no row is left pointing at a
-- provider the Worker no longer talks to.
--
-- This is a *rename*, not an addition: `ALTER TYPE ... RENAME VALUE` rewrites
-- every row holding the old label in one statement, so there is no window in
-- which some rows say 'paystack' and some say 'monnify'. It is safe inside the
-- migration transaction — unlike ADD VALUE, which cannot run in a transaction
-- block before PostgreSQL 12.
--
-- Caveat worth knowing: payments genuinely taken through Paystack are also
-- relabelled. That is correct for this project (pre-launch, no live
-- transactions) and wrong for a system with real Paystack history, where the
-- right move would be ADD VALUE plus a backfill that leaves the old rows alone.
-- ============================================================================

-- 1. The enum the frontend and confirm_payment speak.
alter type payment_method rename value 'paystack' to 'monnify';

-- 2. `payment.provider` and `webhook_event.provider` are plain text, so they
--    need an explicit backfill. 'in_person' rows are untouched — that provider
--    never changed.
update payment       set provider = 'monnify' where provider = 'paystack';
update webhook_event set provider = 'monnify' where provider = 'paystack';

-- 3. Refunds default to the gateway that took the money.
alter table refund alter column provider set default 'monnify';
update refund set provider = 'monnify' where provider = 'paystack';

-- The webhook idempotency key is (provider, provider_event_id). Events already
-- recorded under the old provider name were backfilled above, so a re-delivery
-- of the same event still collides with its existing row and is recognised as a
-- duplicate rather than being processed twice.
