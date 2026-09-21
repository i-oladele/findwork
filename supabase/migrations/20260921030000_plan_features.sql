-- The Business plan advertised "Team accounts (up to 5)", which does not
-- exist: a business is one login, and letting several people act for one
-- business would touch every rule that decides who may move money. Nobody
-- asked for it, so the promise goes rather than the feature getting built.
--
-- What is left is what the plan genuinely does: the lowest commission
-- (2% against 4% and 6%) and the highest search placement (priority 2).
--
-- The seed carries the same text for new projects; this updates the ones
-- already running.

update public.subscription_plans
set features = array[
  'Everything in Pro',
  '2% platform fee — our lowest',
  'Top search placement',
  'Priority support'
]
where id = 'business';
