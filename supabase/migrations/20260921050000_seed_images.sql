-- Pictures for the demo catalog, so testing does not happen against a wall of
-- grey placeholders. These are stock photographs under the Unsplash licence
-- (free for commercial use, no attribution required), committed to
-- public/assets/seed and referenced by path rather than hotlinked.
--
-- They illustrate seeded demo rows only. Real providers and vendors upload
-- their own through the app, and those go to Supabase storage.
--
-- "Palm oil, 5 litres" is deliberately left without a photo: the stock
-- libraries had nothing that honestly depicts Nigerian red palm oil, and a
-- picture of olive oil on a product called palm oil is a small lie that
-- teaches customers not to trust the pictures.

update public.products set image_url = '/assets/seed/product-ankara.jpg' where id = 'ankara-wax-print';
update public.products set image_url = '/assets/seed/product-lace.jpg' where id = 'lace-cream';
update public.products set image_url = '/assets/seed/product-screen-protector.jpg' where id = 'screen-protector';

-- The first photo doubles as the cover image in search results.
update public.provider_profiles set photo_urls = array['/assets/seed/ada-1.jpg', '/assets/seed/ada-2.jpg']
  where business_name = 'Ada''s Tailoring';
update public.provider_profiles set photo_urls = array['/assets/seed/chidi-1.jpg', '/assets/seed/chidi-2.jpg']
  where business_name = 'Chidi Plumbing Works';
update public.provider_profiles set photo_urls = array['/assets/seed/bisi-1.jpg']
  where business_name = 'Bisi Couture';
update public.provider_profiles set photo_urls = array['/assets/seed/mama-1.jpg']
  where business_name = 'Mama Nkechi Styles';

update public.classifieds set photo_urls = array['/assets/seed/ad-apartment.jpg', '/assets/seed/ad-apartment-2.jpg']
  where title = 'Self-contain apartment, Yaba';
update public.classifieds set photo_urls = array['/assets/seed/ad-aircon.jpg']
  where title = '1.5HP split AC, barely used';
update public.classifieds set photo_urls = array['/assets/seed/ad-shop.jpg']
  where title = 'Shop space along Herbert Macaulay';
update public.classifieds set photo_urls = array['/assets/seed/ad-generator.jpg']
  where title = '3.5KVA generator, tank included';

-- Courses had no picture at all, only a striped placeholder.
alter table public.courses add column image_url text;

update public.courses set image_url = '/assets/seed/course-pattern.jpg' where id = 'pattern-cutting-basics';
update public.courses set image_url = '/assets/seed/course-bookkeeping.jpg' where id = 'small-business-bookkeeping';
update public.courses set image_url = '/assets/seed/course-plumbing.jpg' where id = 'plumbing-safety-cert';
update public.courses set image_url = '/assets/seed/course-fashion.jpg' where id = 'internship-fashion-house';
update public.courses set image_url = '/assets/seed/course-logistics.jpg' where id = 'internship-logistics';
