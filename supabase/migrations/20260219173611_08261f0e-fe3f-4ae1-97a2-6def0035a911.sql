-- Fix project_type inconsistency: normalize all 'smart-flow' to 'smartflow'
UPDATE public.projects
SET project_type = 'smartflow'
WHERE project_type = 'smart-flow';

-- Fix generation status inconsistency: normalize all 'completed' to 'complete'
UPDATE public.generations
SET status = 'complete'
WHERE status = 'completed';

-- Also fix in generation_archives if any
UPDATE public.generation_archives
SET status = 'complete'
WHERE status = 'completed';