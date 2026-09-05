-- BrandSight — demo seed data: "Northstar Coffee"
--
-- Populates one completed Quick Audit for a fictional local coffee shop,
-- so a fresh environment has something realistic to look at (dashboard,
-- report, 8 dimension pages, action plan, PDF export, sharing, lead
-- capture) without waiting on a live OpenAI call.
--
-- This script needs a real auth.users row to attach the demo data to.
-- Create one first (either sign up through the app's /signup page, or
-- via the Supabase dashboard's Auth > Users > "Add user"), then run this
-- file with that user's UUID:
--
--   psql "$DATABASE_URL" -v demo_user_id="'00000000-0000-0000-0000-000000000000'" \
--     -f supabase/seed/northstar_coffee.sql
--
-- (The extra single-quotes around the UUID in -v are required by psql's
-- variable interpolation — :demo_user_id below expands to exactly what
-- you pass.) If you don't pass -v, the DEFAULT_DEMO_USER placeholder
-- below is used and this script will fail with a foreign-key violation
-- until you replace it with a real user id.
\if :{?demo_user_id}
\else
  \set demo_user_id '''00000000-0000-0000-0000-000000000000'''
\endif

begin;

with new_brand as (
  insert into public.brands (
    owner_id, name, industry, country, city, description,
    website_url, business_model, primary_product_service, years_operating
  ) values (
    :demo_user_id, 'Northstar Coffee', 'Coffee & Café', 'United States', 'Portland',
    'A neighborhood specialty coffee shop roasting its own beans and serving a small food menu.',
    'https://example.com/northstar-coffee', 'B2C retail', 'Specialty coffee and pastries', 6
  )
  returning id
),
brand_audience as (
  insert into public.brand_audience (
    brand_id, ideal_customer, customer_problem, customer_reason_to_choose,
    differentiator, market_segment, age_range, location, customer_type
  )
  select id, 'Local professionals and students who value quality coffee and a place to work',
    'Convenient, high-quality coffee near work or school without chain-store blandness',
    'Better quality and a more welcoming space than the nearby chain locations',
    'In-house roasting and a genuine loyalty program', 'Local urban professionals',
    '22-45', 'Within 2 miles of the Pearl District', 'Individual consumers'
  from new_brand
),
brand_objectives as (
  insert into public.brand_objectives (brand_id, primary_objective, biggest_marketing_challenge)
  select id, 'more_leads', 'Low foot traffic on weekdays outside the morning rush'
  from new_brand
),
marketing_profile as (
  insert into public.marketing_profiles (
    brand_id, channels, posting_frequency, advertising_active,
    content_creation_process, marketing_team_size, marketing_budget_range
  )
  select id, '["instagram","email","seo"]'::jsonb, '2-3 times per week', false,
    'Owner takes phone photos of drinks and pastries, posts inconsistently', 'solo_founder', 'under_500'
  from new_brand
),
competitor_rows as (
  insert into public.competitors (brand_id, name, url, notes)
  select id, 'Big Roast Coffee Co.', 'https://example.com/big-roast', 'Regional chain, three blocks away'
  from new_brand
),
new_audit as (
  insert into public.audits (
    brand_id, owner_id, audit_type, status, overall_score, overall_confidence,
    executive_summary, started_at, completed_at
  )
  select
    new_brand.id, :demo_user_id, 'quick', 'completed', 58, 'medium',
    'Northstar Coffee has a strong, well-differentiated product and a loyal but small in-person audience. The biggest gap is digital consistency: an inactive Instagram, no email list despite a founder-run loyalty program, and a website that doesn''t convert first-time visitors into weekday regulars. Fixing posting consistency and adding a simple email capture at checkout are the two highest-leverage moves in the next 30 days.',
    now() - interval '2 days', now() - interval '2 days' + interval '4 minutes'
  from new_brand
  returning id, brand_id
)
insert into public.audit_responses (audit_id, section, question_key, answer)
select new_audit.id, v.section, v.question_key, v.answer
from new_audit,
  (values
    ('business', 'business_name', '"Northstar Coffee"'::jsonb),
    ('business', 'industry', '"Coffee & Café"'::jsonb),
    ('business', 'country', '"United States"'::jsonb),
    ('business', 'business_description', '"A neighborhood specialty coffee shop roasting its own beans."'::jsonb),
    ('business', 'primary_product_service', '"Specialty coffee and pastries"'::jsonb),
    ('business', 'business_model', '"B2C retail"'::jsonb),
    ('objectives', 'primary_objective', '"more_leads"'::jsonb),
    ('objectives', 'biggest_marketing_challenge', '"Low foot traffic on weekdays outside the morning rush"'::jsonb),
    ('audience', 'ideal_customer', '"Local professionals and students who value quality coffee"'::jsonb),
    ('audience', 'customer_problem', '"Convenient, high-quality coffee near work/school"'::jsonb),
    ('audience', 'customer_reason_to_choose', '"Better quality and a welcoming space than nearby chains"'::jsonb),
    ('audience', 'differentiator', '"In-house roasting and a loyalty program"'::jsonb),
    ('marketing', 'channels', '["instagram","email","seo"]'::jsonb),
    ('marketing', 'posting_frequency', '"2-3 times per week"'::jsonb),
    ('marketing', 'advertising_active', 'false'::jsonb),
    ('marketing', 'marketing_team_size', '"solo_founder"'::jsonb),
    ('marketing', 'content_creation_process', '"Owner takes phone photos, posts inconsistently"'::jsonb)
  ) as v(section, question_key, answer);

-- Dimension scores (deterministic scoring engine output).
-- Uses "most recently created completed audit for this owner" to locate
-- the audit inserted above — reliable for a single seed run, and still
-- correct on a repeat run since the newest audit is always the one just
-- inserted (used consistently below for findings/recommendations/plan too).
with target_audit as (
  select a.id from public.audits a
  join public.brands b on b.id = a.brand_id
  where b.owner_id = :demo_user_id and a.status = 'completed'
  order by a.created_at desc limit 1
)
insert into public.audit_dimensions (audit_id, dimension_key, score, confidence, summary, subcriteria)
select target_audit.id, v.dimension_key, v.score, v.confidence, v.summary, v.subcriteria
from target_audit
cross join (
  values
    ('positioning', 68, 'medium', 'Clear differentiation (in-house roasting, loyalty program) but not consistently communicated across channels.', '[{"key":"clarity","score":72,"rationale":"Value prop is clear in person, less so online"},{"key":"differentiation","score":75,"rationale":"Roasting + loyalty program are genuine differentiators"},{"key":"consistency","score":55,"rationale":"Messaging varies between website and Instagram bio"}]'::jsonb),
    ('audience', 62, 'medium', 'A clear ideal customer was described, but there is no evidence of audience research or segmentation beyond intuition.', '[{"key":"definition","score":70,"rationale":"Founder can describe the ideal customer clearly"},{"key":"validation","score":40,"rationale":"No surveys, interviews, or data cited"},{"key":"segmentation","score":null,"rationale":"Not enough evidence to assess"}]'::jsonb),
    ('messaging', 55, 'medium', 'Messaging is friendly but generic; it does not consistently mention the two real differentiators.', '[{"key":"clarity","score":60,"rationale":"Easy to understand, low information density"},{"key":"value_communication","score":50,"rationale":"Rarely mentions in-house roasting explicitly"},{"key":"call_to_action","score":55,"rationale":"Weak or missing CTAs on most posts"}]'::jsonb),
    ('content', 48, 'low', 'Inconsistent posting cadence and no discernible content plan or themes.', '[{"key":"consistency","score":40,"rationale":"Gaps of 1-2 weeks between posts observed"},{"key":"variety","score":55,"rationale":"Mostly product photos, little educational or behind-the-scenes content"}]'::jsonb),
    ('social', 45, 'medium', 'Instagram exists but is infrequently updated; no other platforms in active use.', '[{"key":"presence","score":60,"rationale":"Instagram account exists and is claimed"},{"key":"engagement","score":35,"rationale":"Low likes/comments relative to follower count"},{"key":"activity","score":40,"rationale":"Last post over a week old at time of audit"}]'::jsonb),
    ('visual', 70, 'medium', 'Photography quality is good; logo and in-store branding are consistent, though the website lags behind.', '[{"key":"consistency","score":75,"rationale":"Logo and color palette consistent in-store and on packaging"},{"key":"quality","score":68,"rationale":"Good phone photography, no professional shoot"},{"key":"website_alignment","score":65,"rationale":"Website uses an older logo version"}]'::jsonb),
    ('digital', 52, 'high', 'Website loads and describes the business but has no clear conversion path (no email capture, no online ordering, no directions CTA above the fold).', '[{"key":"usability","score":65,"rationale":"Site is simple and loads fast"},{"key":"conversion_path","score":30,"rationale":"No email capture or clear next action"},{"key":"seo_basics","score":60,"rationale":"Title/meta present but thin content"}]'::jsonb),
    ('competition', 65, 'low', 'One competitor identified; genuine differentiators exist but are not leveraged in messaging against that competitor.', '[{"key":"awareness","score":70,"rationale":"Founder is aware of the main nearby competitor"},{"key":"differentiation_use","score":55,"rationale":"Differentiators exist but aren''t used competitively in messaging"}]'::jsonb)
) as v(dimension_key, score, confidence, summary, subcriteria);

-- Findings (strengths/weaknesses/opportunities).
with target_audit as (
  select a.id from public.audits a
  join public.brands b on b.id = a.brand_id
  where b.owner_id = :demo_user_id and a.status = 'completed'
  order by a.created_at desc limit 1
)
insert into public.audit_findings (audit_id, dimension_key, type, title, description, severity, impact, difficulty, priority_score, confidence)
select target_audit.id, v.dimension_key, v.type, v.title, v.description, v.severity, v.impact, v.difficulty, v.priority_score, v.confidence
from target_audit,
(values
  ('digital', 'weakness', 'No email capture on the website', 'The website has no way to collect a visitor''s email, so first-time visitors who aren''t ready to walk in immediately are lost entirely.', 'high', 'high', 'low', 85.0, 'high'),
  ('social', 'weakness', 'Inconsistent Instagram posting', 'Gaps of over a week between posts make the account look inactive to new visitors checking before their first visit.', 'medium', 'medium', 'low', 62.0, 'medium'),
  ('positioning', 'strength', 'Genuine, defensible differentiators', 'In-house roasting and an active loyalty program are real advantages most nearby competitors don''t have.', null, 'high', null, 0, 'medium'),
  ('messaging', 'opportunity', 'Differentiators are underused in messaging', 'Neither the website nor recent social posts mention in-house roasting explicitly, leaving a strong selling point unused.', 'medium', 'high', 'low', 70.0, 'medium')
) as v(dimension_key, type, title, description, severity, impact, difficulty, priority_score, confidence);

-- Recommendations, linked back to the two actionable findings above.
with target_audit as (
  select a.id from public.audits a
  join public.brands b on b.id = a.brand_id
  where b.owner_id = :demo_user_id and a.status = 'completed'
  order by a.created_at desc limit 1
),
findings as (
  select id, title from public.audit_findings where audit_id = (select id from target_audit)
)
insert into public.audit_recommendations (audit_id, dimension_key, finding_id, title, description, why_it_matters, action_steps, impact, difficulty, timeframe, priority_score)
select
  (select id from target_audit), v.dimension_key,
  (select id from findings where title = v.finding_title),
  v.title, v.description, v.why_it_matters, v.action_steps::jsonb, v.impact, v.difficulty, v.timeframe, v.priority_score
from (values
  ('digital', 'No email capture on the website', 'Add a simple email signup to the website', 'A one-field email signup (with a small incentive like "10% off your next bag of beans") turns anonymous visitors into a list you can actually market to.', 'This is the single highest-leverage fix available — it costs nothing and directly addresses the biggest gap in the digital dimension.', '["Add an email field to the homepage above the fold","Offer a small first-visit or first-order incentive","Connect signups to a simple weekly email (new roasts, weekday specials)"]', 'high', 'low', 'This week', 88.0),
  ('social', 'Inconsistent Instagram posting', 'Set a fixed, sustainable posting cadence', 'Three short, low-effort posts a week (a drink, a pastry, a customer or staff moment) is enough to look active without becoming a burden.', 'Consistency matters more than volume for how active an account looks to a new visitor.', '["Batch-shoot 6-9 photos every Sunday","Use a recurring weekly theme (Monday roast, Wednesday customer feature, Friday specials)","Schedule posts in advance using Instagram''s native scheduler"]', 'medium', 'low', 'Weeks 1-2', 60.0)
) as v(dimension_key, finding_title, title, description, why_it_matters, action_steps, impact, difficulty, timeframe, priority_score);

-- 30-day action plan (Stage 8 output shape — see ActionPlanSchema).
with target_audit as (
  select a.id from public.audits a
  join public.brands b on b.id = a.brand_id
  where b.owner_id = :demo_user_id and a.status = 'completed'
  order by a.created_at desc limit 1
)
insert into public.audit_action_plans (audit_id, plan_30_day, plan_60_day, plan_90_day)
select target_audit.id,
  '{
    "fixFirst": [
      {"title":"Add an email signup to the website","whyItMatters":"Costs nothing and stops losing every visitor who is not ready to walk in immediately.","actionSteps":["Add an email field above the fold","Offer a small first-order incentive","Send a weekly email"],"expectedImpact":"high","difficulty":"low"}
    ],
    "week1": [
      {"title":"Batch-shoot a week of Instagram content","whyItMatters":"Removes the daily friction that causes posting gaps.","actionSteps":["Shoot 6-9 photos on Sunday","Write captions in one sitting","Schedule the week''s posts"],"expectedImpact":"medium","difficulty":"low"}
    ],
    "week2": [
      {"title":"Mention in-house roasting on the homepage","whyItMatters":"A genuine differentiator that visitors currently never hear about.","actionSteps":["Add one paragraph about the roasting process","Add a photo of the roaster"],"expectedImpact":"medium","difficulty":"low"}
    ],
    "week3": [],
    "week4": []
  }'::jsonb,
  '[]'::jsonb, '[]'::jsonb
from target_audit;

commit;
