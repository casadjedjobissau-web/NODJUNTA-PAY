insert into public.accounts (owner_id, type, currency, allow_negative)
values
  (null, 'settlement', 'XOF', true),
  (null, 'fee_revenue', 'XOF', false),
  (null, 'suspense', 'XOF', true)
on conflict (type, currency) where owner_id is null do nothing;
