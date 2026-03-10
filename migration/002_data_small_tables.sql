-- ============================================================
-- DATA EXPORT — Small/Medium Tables
-- Run AFTER 001_full_schema.sql on your target Supabase project
-- ============================================================

-- ==================== profiles ====================
INSERT INTO public.profiles (id, user_id, display_name, avatar_url, created_at, updated_at) VALUES
('5b533bb7-0c1d-452a-8ddd-1ba2aa5ae1b2', '339143e2-38a1-4e25-b134-1a209990b1a3', 'tavonia', NULL, '2026-01-14 13:46:15.714883+00', '2026-01-14 13:46:15.714883+00'),
('9a001204-1c98-4b27-881d-b73b7b08f47a', '3fceb518-fa61-453b-a856-70353828d9ac', 'Jomama', NULL, '2026-01-28 00:07:29.294844+00', '2026-01-28 00:07:29.169+00'),
('a96a3c23-23c3-4099-9629-37908fc97cb4', '06e5e352-c055-4baa-9ceb-9e48a5b69ad8', 'tbijou', NULL, '2026-01-29 22:35:13.666831+00', '2026-01-29 22:35:13.666831+00'),
('c4535fb2-4066-4728-af50-f4e8316b62bd', 'ce695137-9517-409d-bfc1-d51ad61db1db', 'urbanbrujetta4ever', NULL, '2026-01-30 01:55:35.152637+00', '2026-01-30 01:55:35.152637+00'),
('7c5c52e1-86c8-4425-a53d-973dea07367b', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Prof David', NULL, '2026-01-16 21:04:26.494282+00', '2026-02-03 17:18:12.83702+00'),
('f657fd39-887b-44ef-8986-b3c0335491cf', '72e05143-f16a-4d9b-a609-cb7a8aeed120', 'minecoreanalytics', NULL, '2026-02-13 19:08:24.20131+00', '2026-02-13 19:08:24.20131+00'),
('69b290e9-05a7-4f4f-85fb-ac91d1de3171', 'ad8a77fe-1012-4f7e-b028-a5b25f0e8fbf', 'blacklilithempire', NULL, '2026-02-16 23:07:26.53097+00', '2026-02-16 23:07:26.53097+00'),
('f4f6d631-bd6d-468a-bfa1-0a17e1fb8948', '4617a571-7b19-4527-bf76-a9870d8b69ce', 'lilwolfpackpod', NULL, '2026-03-09 04:37:07.723371+00', '2026-03-09 04:37:07.723371+00')
ON CONFLICT DO NOTHING;

-- ==================== user_roles ====================
INSERT INTO public.user_roles (id, user_id, role, created_at, updated_at) VALUES
('60c78177-fa0c-451e-8f72-56606ae28fa5', '3fceb518-fa61-453b-a856-70353828d9ac', 'admin', '2026-02-01 16:35:44.562862+00', '2026-02-01 16:35:44.562862+00')
ON CONFLICT DO NOTHING;

-- ==================== subscriptions ====================
INSERT INTO public.subscriptions (id, user_id, plan_name, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at) VALUES
('0e88f3d1-de23-4c7e-a79a-145a04a27651', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'professional', 'active', 'manual_enterprise_david', 'manual_enterprise_david', '2026-01-27 19:35:11.401481+00', '2099-12-31 00:00:00+00', false, '2026-01-27 19:35:11.401481+00', '2026-01-27 19:35:11.401481+00'),
('0d9f0ad9-0e28-4ac4-b5ab-9dc611af37ae', '339143e2-38a1-4e25-b134-1a209990b1a3', 'professional', 'active', 'manual_enterprise_tavonia', 'manual_enterprise_tavonia', '2026-01-27 19:35:11.401481+00', '2099-12-31 00:00:00+00', false, '2026-01-27 19:35:11.401481+00', '2026-01-27 19:35:11.401481+00'),
('e70713f0-9b90-4863-893c-eefb93ab0ba8', '3fceb518-fa61-453b-a856-70353828d9ac', 'professional', 'active', 'manual_enterprise_arcana', 'manual_enterprise_arcana', '2026-01-27 19:35:11.401481+00', '2099-12-31 00:00:00+00', false, '2026-01-27 19:35:11.401481+00', '2026-01-27 19:35:11.401481+00'),
('202c8803-a59d-40ee-b9e4-0609bb43df1b', 'ce695137-9517-409d-bfc1-d51ad61db1db', 'creator', 'active', 'manual_urbanbrujetta4ever', 'manual_creator_urbanbrujetta4ever', '2026-02-05 19:45:15.067723+00', '2026-03-05 19:45:15.067723+00', false, '2026-02-05 19:45:15.067723+00', '2026-02-05 20:06:25.854828+00'),
('81e48da7-6d36-48e2-9bea-5faf81ae9673', '72e05143-f16a-4d9b-a609-cb7a8aeed120', 'professional', 'active', 'manual_minecoreanalytics', 'manual_professional_minecoreanalytics', '2026-02-13 19:16:04.194457+00', '2026-03-13 19:16:04.194457+00', false, '2026-02-13 19:16:04.194457+00', '2026-02-13 19:16:04.194457+00')
ON CONFLICT DO NOTHING;

-- ==================== user_credits ====================
INSERT INTO public.user_credits (id, user_id, credits_balance, total_purchased, total_used, created_at, updated_at) VALUES
('b7543f21-7446-4bf0-8c32-4abb3cc51846', '72e05143-f16a-4d9b-a609-cb7a8aeed120', 298, 300, 2, '2026-02-13 19:16:05.167103+00', '2026-02-13 19:39:20.746523+00'),
('6f7a6a05-ae39-4b84-9d19-7d8ae1b6bb35', 'd53d98fb-e712-4160-b170-12539c5a23d0', 999713, 999999, 286, '2026-01-17 02:14:00.744532+00', '2026-03-09 22:01:07.973674+00'),
('f94fc278-6cb7-49fb-a0c7-23d5c75c8df3', '3fceb518-fa61-453b-a856-70353828d9ac', 999768, 999999, 230, '2026-01-17 02:29:32.758547+00', '2026-03-09 22:28:38.335706+00'),
('4d298563-a721-4eba-9a57-cf68cdea5382', '339143e2-38a1-4e25-b134-1a209990b1a3', 999992, 999999, 7, '2026-01-27 19:35:22.805447+00', '2026-02-25 15:16:22.048302+00'),
('6b32d67c-3269-4c3d-a401-010532da6663', 'ce695137-9517-409d-bfc1-d51ad61db1db', 33, 100, 67, '2026-02-05 19:45:14.61479+00', '2026-03-07 19:35:50.618105+00')
ON CONFLICT DO NOTHING;

-- ==================== user_api_keys ====================
INSERT INTO public.user_api_keys (id, user_id, gemini_api_key, replicate_api_token, created_at, updated_at) VALUES
('f8fe96d4-e496-4bd4-91cf-9cce7d95c87f', '4c93b662-7d2c-496f-9fc5-951a66363b12', 'AIzaSyCEXzwrar4THe2JtK_mijJm3AuBMX-ARIY', NULL, '2026-01-12 04:13:47.652935+00', '2026-01-12 04:13:47.652935+00'),
('36d6060c-0b47-48b3-90c2-dd0e16bb8abc', '3fceb518-fa61-453b-a856-70353828d9ac', 'AIzaSyAOA4RiqTZGEdeb53A9bTYvMnWq5shtT38', 'r8_Z0MGHBFtScQzW0jim9GXxWjwLgAEgYX0ekoA1', '2026-01-11 23:28:36.119579+00', '2026-01-13 02:39:21.025628+00')
ON CONFLICT DO NOTHING;

-- ==================== user_voices ====================
INSERT INTO public.user_voices (id, user_id, voice_name, voice_id, sample_url, description, created_at) VALUES
('12397fa7-0e6d-4f7f-a3e5-644d4a082c5c', '3fceb518-fa61-453b-a856-70353828d9ac', 'jOjo', 'i1bpXBTVJB73MXMV1m2k', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/sign/voice_samples/3fceb518-fa61-453b-a856-70353828d9ac/1770567288631-sample.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8yYWQ5NzM5MC01NmM2LTQ1ZmItYWU4My1iNjhhNzZlYjIxYTMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2b2ljZV9zYW1wbGVzLzNmY2ViNTE4LWZhNjEtNDUzYi1hODU2LTcwMzUzODI4ZDlhYy8xNzcwNTY3Mjg4NjMxLXNhbXBsZS5tcDMiLCJpYXQiOjE3NzA1NjcyODksImV4cCI6MTgwMjEwMzI4OX0.8h0AHW3izZ3hhXstxXD2CZyWyzed_Lgw3pSZqQVpTdw', 'Created via file upload', '2026-02-08 16:14:49.230138+00'),
('2686265b-eeeb-4402-8e07-b519de71d616', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'tida', 'I4L683ZkftssN83wEBrG', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/sign/voice_samples/d53d98fb-e712-4160-b170-12539c5a23d0/1771789897287-sample.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8yYWQ5NzM5MC01NmM2LTQ1ZmItYWU4My1iNjhhNzZlYjIxYTMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2b2ljZV9zYW1wbGVzL2Q1M2Q5OGZiLWU3MTItNDE2MC1iMTcwLTEyNTM5YzVhMjNkMC8xNzcxNzg5ODk3Mjg3LXNhbXBsZS5tcDMiLCJpYXQiOjE3NzE3ODk4OTgsImV4cCI6MTgwMzMyNTg5OH0.u31bCjwMBMhUVTWJl8Fo6SFOpJMamh1TwFjrRD17zcc', 'Created via file upload', '2026-02-22 19:51:38.180668+00'),
('caaeb254-0fb2-4acb-831b-763141130ef8', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'BonKreyol', 'FFORuIUhYjgj1e2LltUG', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/sign/voice_samples/d53d98fb-e712-4160-b170-12539c5a23d0/1771795385098-sample.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8yYWQ5NzM5MC01NmM2LTQ1ZmItYWU4My1iNjhhNzZlYjIxYTMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2b2ljZV9zYW1wbGVzL2Q1M2Q5OGZiLWU3MTItNDE2MC1iMTcwLTEyNTM5YzVhMjNkMC8xNzcxNzk1Mzg1MDk4LXNhbXBsZS5tcDMiLCJpYXQiOjE3NzE3OTUzODUsImV4cCI6MTgwMzMzMTM4NX0.4AAe9E5p5KEWwiUlyorWxLm-Y6EaKbVitN4147Rktak', 'Created via file upload', '2026-02-22 21:23:06.014065+00'),
('01bd0a8e-2bd7-45d7-9bb0-a52a38b6cd6e', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Dakreyol', 'eJrI5xqF0ZpaRhH5NIm1', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/sign/voice_samples/d53d98fb-e712-4160-b170-12539c5a23d0/1771798085355-sample.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8yYWQ5NzM5MC01NmM2LTQ1ZmItYWU4My1iNjhhNzZlYjIxYTMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ2b2ljZV9zYW1wbGVzL2Q1M2Q5OGZiLWU3MTItNDE2MC1iMTcwLTEyNTM5YzVhMjNkMC8xNzcxNzk4MDg1MzU1LXNhbXBsZS5tcDMiLCJpYXQiOjE3NzE3OTgwODUsImV4cCI6MTgwMzMzNDA4NX0.j6k68XcOl4KuA7_dPWU5kMZQkBPqQfjv874cgPlhwVs', 'Created via file upload', '2026-02-22 22:08:06.045869+00')
ON CONFLICT DO NOTHING;

-- ==================== user_flags ====================
INSERT INTO public.user_flags (id, user_id, flag_type, reason, details, flagged_by, resolved_at, resolved_by, resolution_notes, created_at, updated_at) VALUES
('90c934e2-2b12-47c2-9464-e6eb8e3c2680', '3fceb518-fa61-453b-a856-70353828d9ac', 'warning', 'Content policy violation', 'Attempted to generate content that violated content policy. Auto-detected.', '3fceb518-fa61-453b-a856-70353828d9ac', '2026-03-04 20:17:12.288+00', '3fceb518-fa61-453b-a856-70353828d9ac', '', '2026-02-21 19:40:49.68965+00', '2026-03-04 20:17:12.580431+00'),
('789352b9-e7ce-4663-a9e4-18f7d73284d2', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'warning', 'Content policy violation', 'Attempted to generate content that violated content policy. Auto-detected.', 'd53d98fb-e712-4160-b170-12539c5a23d0', '2026-03-04 20:17:19.445+00', '3fceb518-fa61-453b-a856-70353828d9ac', '', '2026-02-13 23:19:53.518648+00', '2026-03-04 20:17:19.535391+00'),
('09d10cc2-6056-418e-a888-3eb270e3ee32', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'warning', 'Content policy violation', 'Attempted to generate content that violated content policy. Auto-detected.', 'd53d98fb-e712-4160-b170-12539c5a23d0', '2026-03-04 20:17:26.016+00', '3fceb518-fa61-453b-a856-70353828d9ac', '', '2026-02-13 23:19:49.345886+00', '2026-03-04 20:17:26.098105+00'),
('d75e95bc-ca25-43f2-b776-84fbbb7437b5', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'warning', 'Content policy violation', 'Attempted to generate content that violated content policy. Auto-detected.', 'd53d98fb-e712-4160-b170-12539c5a23d0', '2026-03-04 20:17:30.539+00', '3fceb518-fa61-453b-a856-70353828d9ac', '', '2026-02-13 23:19:36.417359+00', '2026-03-04 20:17:30.625472+00')
ON CONFLICT DO NOTHING;

-- ==================== webhook_events ====================
INSERT INTO public.webhook_events (id, event_id, event_type, processed_at) VALUES
('f8584879-ab85-49dc-9840-af6001ca9ac1', 'evt_1T64cN6hfVkBDzkSq4RzYA0K', 'checkout.session.completed', '2026-03-01 07:40:48.083984+00')
ON CONFLICT DO NOTHING;

-- ==================== project_characters ====================
INSERT INTO public.project_characters (id, project_id, user_id, character_name, description, reference_image_url, created_at) VALUES
('aef5228f-7964-445c-a990-f91b2aed0ea7', '706fc129-e158-4514-8fc9-afee94a7bac8', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Melvin_Sylvester_42', 'A 42-year-old British male referee, mild-mannered school caretaker appearance. He has a receding hairline with messy hair, a thick bushy mustache, and weary expressive eyes. He wears a classic 1998 all-black referee uniform with a white collar and a whistle around his neck. In this caricature style, he has an oversized head, a bulbous red nose, and a skinny body.', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/public/scene-images/d53d98fb-e712-4160-b170-12539c5a23d0/temp-project/char-ref-melvin_sylvester_42-1771804723460.png', '2026-02-22 23:59:24.376263+00'),
('c2e14f32-2700-4a8a-beaa-361d84a60a79', '706fc129-e158-4514-8fc9-afee94a7bac8', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Richard_Curd_Player', 'A tough British amateur football player in his 20s. He has a buzz cut, an aggressive jawline, and is covered in mud. He wears a generic vertical-striped Sunday League football kit (red and white). In caricature style, he has a massive chin, bulging neck veins, and tiny legs.', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/public/scene-images/d53d98fb-e712-4160-b170-12539c5a23d0/temp-project/char-ref-richard_curd_player-1771804762860.png', '2026-02-22 23:59:24.376263+00'),
('55563009-3784-4509-ad8d-cd807bfbed91', '706fc129-e158-4514-8fc9-afee94a7bac8', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Sunday_League_Players', 'A group of motley amateur footballers with 1990s hairstyles (curtains, mullets), wearing mismatched, muddy kits, with exaggerated angry expressions and missing teeth.', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/public/scene-images/d53d98fb-e712-4160-b170-12539c5a23d0/temp-project/char-ref-sunday_league_players-1771804686633.png', '2026-02-22 23:59:24.376263+00'),
('14baa3cf-1c7f-4ffa-8027-94323d2390ca', 'f7cb2b27-bb66-46b6-8da3-3442cfc5b430', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Gianluca_Prestianni', 'A young Argentine football player with a caricature-style oversized head, dark messy hair, expressive large eyes showing shock, a tiny body wearing a red Benfica football kit with white details, exaggerated nose and rubbery lips', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/public/scene-images/d53d98fb-e712-4160-b170-12539c5a23d0/temp-project/char-ref-gianluca_prestianni-1771859646954.png', '2026-02-23 15:14:09.024556+00'),
('155ba758-f2ec-43cf-be37-98e7c7d50e18', 'f7cb2b27-bb66-46b6-8da3-3442cfc5b430', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Vinicius_Junior', 'A Brazilian football player with a caricature-style oversized head, distinctive dreadlocks hairstyle, a giant expressive face showing frustration, a tiny body wearing a white Real Madrid football kit, exaggerated facial features', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/public/scene-images/d53d98fb-e712-4160-b170-12539c5a23d0/temp-project/char-ref-vinicius_junior-1771859648345.png', '2026-02-23 15:14:09.024556+00'),
('4a5675f9-d8a5-4aab-8edf-3f846d9ae554', 'f7cb2b27-bb66-46b6-8da3-3442cfc5b430', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Francois_Letexier', 'A football referee with a caricature-style oversized head, stern expression, huge eyes watching closely, a tiny body wearing a neon yellow and black referee uniform, holding a whistle', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/public/scene-images/d53d98fb-e712-4160-b170-12539c5a23d0/temp-project/char-ref-francois_letexier-1771859638294.png', '2026-02-23 15:14:09.024556+00'),
('9d3ef403-1501-45eb-b95f-524b9e0f1eb6', 'f7cb2b27-bb66-46b6-8da3-3442cfc5b430', 'd53d98fb-e712-4160-b170-12539c5a23d0', 'Kylian_Mbappe', 'A French football player with a caricature-style oversized head, short hair, a wide confident smile or serious expression depending on context, a tiny body wearing a white Real Madrid football kit', 'https://hesnceozbedzrgvylqrm.supabase.co/storage/v1/object/public/scene-images/d53d98fb-e712-4160-b170-12539c5a23d0/temp-project/char-ref-kylian_mbappe-1771859626437.png', '2026-02-23 15:14:09.024556+00')
ON CONFLICT DO NOTHING;

-- ==================== generation_archives ====================
-- (empty — no rows)

-- ==================== admin_logs ====================
-- (empty — no rows)
