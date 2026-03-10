
-- Make audio bucket public (idempotent)
UPDATE storage.buckets SET public = true WHERE id = 'audio';
