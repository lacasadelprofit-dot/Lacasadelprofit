-- ============================================================
-- La Casa del Profit — Storage para fotos de facilitadores
-- SQL Editor → New query → pegar todo → Run
-- Requiere haber corrido antes 11_facilitadores_portal.sql
-- (usa la tabla profiles).
-- ============================================================

-- Bucket público de solo fotos: cualquiera puede VER las fotos
-- (se muestran en la web pública), pero solo el propio
-- facilitador puede subir/reemplazar la suya.
insert into storage.buckets (id, name, public)
values ('facilitadores', 'facilitadores', true)
on conflict (id) do nothing;

drop policy if exists "fotos: lectura publica" on storage.objects;
create policy "fotos: lectura publica"
  on storage.objects for select to public
  using (bucket_id = 'facilitadores');

drop policy if exists "fotos: facilitador sube su propia foto" on storage.objects;
create policy "fotos: facilitador sube su propia foto"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'facilitadores'
    and (storage.foldername(name))[1] = (select facilitador_id from profiles where id = auth.uid())
  );

drop policy if exists "fotos: facilitador actualiza su propia foto" on storage.objects;
create policy "fotos: facilitador actualiza su propia foto"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'facilitadores'
    and (storage.foldername(name))[1] = (select facilitador_id from profiles where id = auth.uid())
  );

-- ============================================================
-- Las fotos se guardan como: facilitadores/{facilitador_id}/foto.jpg
-- El portal_facilitador.html sube el archivo con ese path y
-- guarda la URL pública resultante en facilitadores.data.foto
-- ============================================================
