-- Test accounts for walking through every role on the hosted DEMO project.
-- Never run this against a project with real users or real money.
--
--   supabase db query --linked --file supabase/test-accounts.sql
--
-- Safe to run again: it adds only what is missing. Every account uses the
-- demo password from seed.sql (findwork-demo-2026); see TESTING.md. Delete
-- these accounts, and the seed's, before launch.
--
-- Everything is done through the app's own functions, as the person who
-- would do it, so the same rules, notifications and audit trail apply.

do $$
declare
  v_admin    uuid := '00000000-0000-0000-0000-000000000010';  -- FindWork Support (seed)
  v_customer uuid := '00000000-0000-0000-0000-000000000001';  -- Adaeze Okoro (seed)
  v_seller   uuid := '00000000-0000-0000-0000-000000000005';  -- Mama Nkechi Styles (seed provider)
  v_tunde    uuid := '00000000-0000-0000-0000-000000000006';  -- Tunde A. (seed)
  v_mod      uuid := '00000000-0000-0000-0000-0000000000b1';
  v_finance  uuid := '00000000-0000-0000-0000-0000000000b2';
  v_support  uuid := '00000000-0000-0000-0000-0000000000b3';
  v_rider    uuid := '00000000-0000-0000-0000-0000000000b4';
  v_buyer    uuid := '00000000-0000-0000-0000-0000000000b5';
  v_password text := extensions.crypt('findwork-demo-2026', extensions.gen_salt('bf'));
  v_org uuid;
  u record;
begin
  -- 1. The new accounts, signed up and confirmed.
  for u in select * from (values
    (v_mod, 'moderator@findwork.africa', 'Test Moderator'),
    (v_finance, 'finance@findwork.africa', 'Test Finance'),
    (v_support, 'support@findwork.africa', 'Test Support'),
    (v_rider, 'rider@findwork.africa', 'Emeka (test rider)'),
    (v_buyer, 'buyer@findwork.africa', 'Bola (test business buyer)')
  ) as t(id, email, full_name)
  loop
    if not exists(select 1 from auth.users where id = u.id or email = u.email) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, v_password, now(), null,
        '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name, 'phone', ''),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', null, now(), now());
    end if;
  end loop;

  -- 2. Staff roles, given by the admin.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  if (select staff_role from public.profiles where id = v_mod) is null then perform public.admin_set_staff_role(v_mod, 'moderator'); end if;
  if (select staff_role from public.profiles where id = v_finance) is null then perform public.admin_set_staff_role(v_finance, 'finance'); end if;
  if (select staff_role from public.profiles where id = v_support) is null then perform public.admin_set_staff_role(v_support, 'support'); end if;

  -- 3. A rider who has applied and been approved.
  if not exists(select 1 from public.rider_profiles where id = v_rider) then
    perform set_config('request.jwt.claim.sub', v_rider::text, true);
    perform public.apply_as_rider('motorcycle', 'LAG 123 XY', 'Yaba');
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform public.admin_review_rider(v_rider, true, 'Test rider for walk-throughs; ID not checked.');
  end if;

  -- 4. A business buyer who owns an organisation, with Tunde as a buyer who
  --    needs approval above ₦50,000.
  select id into v_org from public.organizations where owner_id = v_buyer limit 1;
  if v_org is null then
    perform set_config('request.jwt.claim.sub', v_buyer::text, true);
    v_org := public.create_organization('Okoro Foods Ltd (test)', 50000);
    perform public.set_organization_member(v_org, v_tunde, 'buyer');
  end if;

  -- 5. A seller with goods: Mama Nkechi Styles, a tailor who also sells fabric.
  perform set_config('request.jwt.claim.sub', v_seller::text, true);
  insert into public.products (seller_id, name, price, vendor, stock, status, description)
  select v_seller, p.name, p.price, 'Mama Nkechi Styles', p.stock, 'live', p.description
  from (values
    ('Ankara fabric, 6 yards', 12500, 20, 'Cotton wax print, 6 yards. Test product for walk-throughs.'),
    ('Aso-oke headtie', 8000, 15, 'Hand-woven, ready to tie. Test product for walk-throughs.'),
    ('Made-to-measure kaftan', 35000, null, 'Sewn to your measurements in 7 days. Test product for walk-throughs.')
  ) as p(name, price, stock, description)
  where not exists(select 1 from public.products x where x.seller_id = v_seller and x.name = p.name);

  -- 6. Wallet money to test with, since cards are off until Paystack is set up.
  --    Recorded as staff adjustments; no real money.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  if not exists(select 1 from public.wallet_transactions where profile_id = v_customer and label like '%Test funds for walk-throughs%') then
    perform public.admin_adjust_balance(v_customer, 200000, 'Test funds for walk-throughs (not real money)');
  end if;
  if not exists(select 1 from public.wallet_transactions where profile_id = v_buyer and label like '%Test funds for walk-throughs%') then
    perform public.admin_adjust_balance(v_buyer, 500000, 'Test funds for walk-throughs (not real money)');
  end if;
  if not exists(select 1 from public.wallet_transactions where profile_id = v_tunde and label like '%Test funds for walk-throughs%') then
    perform public.admin_adjust_balance(v_tunde, 100000, 'Test funds for walk-throughs (not real money)');
  end if;
end;
$$;
