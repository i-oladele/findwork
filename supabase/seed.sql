-- Seeds the catalog content that today lives in src/data/mock.ts: the four
-- providers, the demo customer, product/course/plan catalogs, and the
-- classifieds listings. Demo-flavor *user-generated* state (bookings,
-- orders, chat, jobs posted, disputes...) is intentionally NOT seeded here
-- — that's created live by using the app, same as any real user's data
-- would be. All demo accounts share the password below for local testing.

-- Hosted Supabase installs pgcrypto into the "extensions" schema, which is
-- not always on the search path of the connection running this file, so
-- crypt()/gen_salt() below would not resolve. Locally the extension lands in
-- public and the extra entry is simply ignored.
create extension if not exists pgcrypto;
set search_path = public, extensions;

do $$
declare
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000';
  v_password text := crypt('findwork-demo-2026', gen_salt('bf'));

  v_customer uuid := '00000000-0000-0000-0000-000000000001';
  v_ada uuid := '00000000-0000-0000-0000-000000000002';
  v_chidi uuid := '00000000-0000-0000-0000-000000000003';
  v_bisi uuid := '00000000-0000-0000-0000-000000000004';
  v_mama uuid := '00000000-0000-0000-0000-000000000005';
  v_tunde uuid := '00000000-0000-0000-0000-000000000006';
  v_ngozi uuid := '00000000-0000-0000-0000-000000000007';
  v_herbert uuid := '00000000-0000-0000-0000-000000000008';
  v_femi uuid := '00000000-0000-0000-0000-000000000009';
  v_admin uuid := '00000000-0000-0000-0000-000000000010';

  v_user record;
begin
  for v_user in
    select * from (values
      (v_customer, 'ada@findwork.africa', 'Adaeze Okoro', '+234 803 412 9087'),
      (v_ada, 'hello@adastailoring.ng', 'Ada''s Tailoring', '+234 802 000 0001'),
      (v_chidi, 'hello@chidiplumbing.ng', 'Chidi Plumbing Works', '+234 802 000 0002'),
      (v_bisi, 'hello@bisicouture.ng', 'Bisi Couture', '+234 802 000 0003'),
      (v_mama, 'hello@mamankechi.ng', 'Mama Nkechi Styles', '+234 802 000 0004'),
      (v_tunde, 'tunde.a@example.ng', 'Tunde A.', ''),
      (v_ngozi, 'ngozi.e@example.ng', 'Ngozi E.', ''),
      (v_herbert, 'contact@herbertmacaulayproperties.ng', 'Herbert Macaulay Properties', ''),
      (v_femi, 'femi.o@example.ng', 'Femi O.', ''),
      (v_admin, 'admin@findwork.africa', 'FindWork Support', '')
    ) as t(id, email, full_name, phone)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      v_instance_id, v_user.id, 'authenticated', 'authenticated', v_user.email, v_password,
      now(), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', v_user.full_name, 'phone', v_user.phone),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user.id, v_user.id::text,
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email),
      'email', now(), now(), now()
    );
  end loop;

  -- Location, used by the profiles trigger's defaults left blank — fill in
  -- for the demo customer to match the original mock profile.
  update public.profiles
  set location = 'Yaba, Lagos', address = '14 Herbert Macaulay Way, Yaba, Lagos'
  where id = v_customer;

  -- Resolves disputes, fulfils orders and processes withdrawals in /admin.
  update public.profiles set is_admin = true where id = v_admin;

  insert into public.provider_profiles
    (id, business_name, category, location, bio, price, price_unit, verified, rating, reviews, jobs_done, trust_score)
  values
    (v_ada, 'Ada''s Tailoring', 'Tailoring', 'Yaba', 'Eight years making aso-ebi, agbada and ready-to-wear for weddings and offices across Lagos. Home measurement available within Yaba and Surulere.', 12000, 'job', true, 4.9, 212, 486, 92),
    (v_chidi, 'Chidi Plumbing Works', 'Plumbing', 'Surulere', 'Licensed plumber covering Surulere and Yaba — sink and pipe repair, installations and full inspections, parts sourced same day where possible.', 8500, 'visit', true, 4.7, 96, 214, 78),
    (v_bisi, 'Bisi Couture', 'Tailoring', 'Ikeja', 'Verified provider on FindWork, taking bookings across Lagos.', 14000, 'job', true, 4.8, 96, 140, 80),
    (v_mama, 'Mama Nkechi Styles', 'Tailoring', 'Surulere', 'New on FindWork, taking bookings across Lagos.', 9500, 'job', false, 4.6, 48, 22, 0);

  insert into public.provider_packages (provider_id, name, price, detail) values
    (v_ada, 'Ready-to-wear, single piece', 12000, 'Fabric not included · 4–6 days'),
    (v_ada, 'Aso-ebi set, per person', 28500, 'Minimum six people · 2 weeks'),
    (v_chidi, 'Kitchen sink repair', 8500, 'Parts not included · same day'),
    (v_chidi, 'Full plumbing inspection', 15000, 'Up to 3 bathrooms · ~2 hours'),
    (v_bisi, 'Ready-to-wear, single piece', 14000, '2 weeks');

  -- Availability rows are created by the provider_profiles insert trigger.

  insert into public.classifieds (seller_id, title, price, category, location, description) values
    (v_tunde, 'Self-contain apartment, Yaba', 450000, 'Rentals', 'Yaba', 'Newly renovated self-contain, prepaid meter, water included. Annual rent, one year minimum.'),
    (v_ngozi, '1.5HP split AC, barely used', 145000, 'Used goods', 'Surulere', 'Used for one dry season, works perfectly. Buyer arranges pickup and installation.'),
    (v_herbert, 'Shop space along Herbert Macaulay', 900000, 'Rentals', 'Yaba', '18 sqm open-plan shop, roadside frontage, previously a phone accessories store.'),
    (v_femi, '3.5KVA generator, tank included', 210000, 'Used goods', 'Ikeja', 'Two years old, serviced last month. Selling because we moved to solar.');
end $$;

insert into public.products (id, name, price, vendor, variant) values
  ('ankara-wax-print', 'Ankara wax print, 6 yards', 9800, 'Balogun Fabrics', 'Red'),
  ('palm-oil', 'Palm oil, 5 litres', 11200, 'Mile 12 Foods', null),
  ('screen-protector', 'Phone screen protector', 2500, 'Computer Village', null),
  ('lace-cream', 'Lace, 5 yards, cream', 18000, 'Balogun Fabrics', 'Cream');

insert into public.courses (id, title, category, kind, price, instructor, rating, description) values
  ('pattern-cutting-basics', 'Pattern cutting for ready-to-wear', 'Tailoring', 'course', 8000, 'FindWork Learning', 4.8, 'Learn to draft and cut patterns for ready-to-wear pieces, from measurement to a finished block.'),
  ('small-business-bookkeeping', 'Bookkeeping for small businesses', 'Business', 'course', 5000, 'FindWork Learning', 4.6, 'Track income, expenses and profit without needing an accountant, using tools you already have.'),
  ('plumbing-safety-cert', 'Plumbing safety certification', 'Plumbing', 'course', 12000, 'FindWork Learning', 4.9, 'A recognised safety certificate that raises your trust score and unlocks larger jobs.'),
  ('internship-fashion-house', 'Junior tailor internship — Lagos fashion house', 'Tailoring', 'internship', 0, 'Adire & Co.', 4.7, 'Three-month paid internship assisting senior tailors on bridal and aso-ebi orders.'),
  ('internship-logistics', 'Logistics coordinator internship', 'Business', 'internship', 0, 'Yaba Logistics Hub', 4.5, 'Six-week internship coordinating same-day delivery riders across Lagos mainland.');

insert into public.course_lessons (course_id, title, minutes, position) values
  ('pattern-cutting-basics', 'Tools and measurements', 18, 1),
  ('pattern-cutting-basics', 'Drafting the bodice block', 32, 2),
  ('pattern-cutting-basics', 'Cutting without waste', 24, 3),
  ('pattern-cutting-basics', 'Finishing and quality checks', 20, 4),
  ('small-business-bookkeeping', 'Separating business and personal money', 15, 1),
  ('small-business-bookkeeping', 'Recording daily sales', 20, 2),
  ('small-business-bookkeeping', 'Simple profit and loss', 25, 3),
  ('plumbing-safety-cert', 'Site safety basics', 22, 1),
  ('plumbing-safety-cert', 'Handling gas and water lines', 28, 2),
  ('plumbing-safety-cert', 'Certification assessment', 15, 3),
  ('internship-fashion-house', 'Studio orientation', 30, 1),
  ('internship-fashion-house', 'Shadowing senior tailors', 0, 2),
  ('internship-logistics', 'Dispatch systems walkthrough', 25, 1);

-- commission_rate is what complete_booking takes from the provider's payout;
-- listing_limit caps live packages (null = unlimited); priority orders search.
insert into public.subscription_plans (id, name, price, features, commission_rate, listing_limit, priority) values
  ('free', 'Free', 0, array['3 active listings', 'Standard search placement', '6% platform fee'], 0.06, 3, 0),
  ('pro', 'Pro', 4500, array['Unlimited listings', 'Priority search placement', '4% platform fee', 'Verified Pro badge'], 0.04, null, 1),
  ('business', 'Business', 15000, array['Everything in Pro', '2% platform fee — our lowest', 'Top search placement', 'Priority support'], 0.02, null, 2);

-- Give the demo customer their original starting balance, as a real ledger
-- entry rather than a hardcoded column — this is also the seed's proof that
-- wallet_summary() correctly derives balance from wallet_transactions.
insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
values ('00000000-0000-0000-0000-000000000001', 'Starting balance', 'topup', 48200);
