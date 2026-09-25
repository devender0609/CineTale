-- CineTale v1.9.74 private final-video storage
-- Run once in the Supabase SQL Editor for the SAME project used by CineTale Auth.
-- Signed-in users can only read/write/delete final videos inside their own UID folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cinetale-final-videos',
  'cinetale-final-videos',
  false,
  314572800,
  array['video/webm','video/mp4','video/x-matroska']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "CineTale users upload own final videos" on storage.objects;
create policy "CineTale users upload own final videos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cinetale-final-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "CineTale users update own final videos" on storage.objects;
create policy "CineTale users update own final videos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'cinetale-final-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'cinetale-final-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "CineTale users read own final videos" on storage.objects;
create policy "CineTale users read own final videos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'cinetale-final-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "CineTale users delete own final videos" on storage.objects;
create policy "CineTale users delete own final videos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'cinetale-final-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
