-- Create storage bucket for custom style reference images
INSERT INTO storage.buckets (id, name, public) VALUES ('style-references', 'style-references', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload style reference images
CREATE POLICY "Users can upload style references"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'style-references' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to view their own style references
CREATE POLICY "Users can view their style references"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'style-references' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their style references
CREATE POLICY "Users can delete their style references"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'style-references' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read access for style references (needed for edge functions to access)
CREATE POLICY "Public read access for style references"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'style-references');
