-- ============================================================
-- La Casa del Profit — Portal de Facilitadores (roles + RLS)
-- SQL Editor → New query → pegar todo → Run
--
-- IMPORTANTE — ORDEN DE EJECUCIÓN:
-- Este script reemplaza las políticas "cualquier autenticado
-- tiene acceso total" por políticas basadas en rol (admin /
-- facilitador). Si lo corrés sin hacer el PASO 0 primero,
-- el admin se queda AFUERA del sistema hasta que insertes su
-- fila en profiles.
--
-- PASO 0 (hacer ANTES de correr el resto de este archivo):
-- 1. Supabase → Authentication → Users → copiar el UUID del
--    usuario admin que hoy usa 1_ADMINISTRACION/index.html.
-- 2. Reemplazar '<UUID-ADMIN>' abajo y correr solo ese insert:
--
--    insert into profiles (id, rol) values ('<UUID-ADMIN>', 'admin')
--    on conflict (id) do update set rol='admin';
--
-- (la tabla profiles se crea más abajo — correr esa parte primero,
--  después el insert del admin, y recién después el resto)
-- ============================================================

-- 1) Tabla de perfiles: vincula cada usuario de Supabase Auth
--    con un rol y, si es facilitador, con su fila en facilitadores.
create table if not exists profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  rol            text not null check (rol in ('admin','facilitador')),
  facilitador_id text references facilitadores(id),
  updated_at     timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles: leer propio perfil" on profiles;
create policy "profiles: leer propio perfil"
  on profiles for select to authenticated using (id = auth.uid());

-- ============================================================
-- 2) Reemplazo de las políticas "acceso total a cualquier
--    autenticado" por políticas admin-only en las 8 tablas.
-- ============================================================

drop policy if exists "rw seres"         on seres;
drop policy if exists "rw sessions"      on sessions;
drop policy if exists "rw facilitadores" on facilitadores;
drop policy if exists "rw facturas"      on facturas;
drop policy if exists "rw herramientas"  on herramientas;
drop policy if exists "rw programas"     on programas;
drop policy if exists "rw campanas"      on campanas;
drop policy if exists "rw inscripciones" on inscripciones;

create policy "admin: seres"         on seres         for all to authenticated using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin'));
create policy "admin: sessions"      on sessions      for all to authenticated using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin'));
create policy "admin: facilitadores" on facilitadores for all to authenticated using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin'));
create policy "admin: facturas"      on facturas      for all to authenticated using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin'));
create policy "admin: herramientas"  on herramientas  for all to authenticated using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin'));
create policy "admin: programas"     on programas     for all to authenticated using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin'));
create policy "admin: campanas"      on campanas      for all to authenticated using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin'));
create policy "admin: inscripciones" on inscripciones for all to authenticated using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin')) with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='admin'));

-- ============================================================
-- 3) Facilitador: solo puede leer/actualizar su propia fila
--    en facilitadores (no ve seres, sessions, facturas, etc.)
-- ============================================================

drop policy if exists "facilitador: leer propia fila" on facilitadores;
create policy "facilitador: leer propia fila"
  on facilitadores for select to authenticated
  using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='facilitador' and p.facilitador_id=facilitadores.id));

drop policy if exists "facilitador: actualizar propia fila" on facilitadores;
create policy "facilitador: actualizar propia fila"
  on facilitadores for update to authenticated
  using (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='facilitador' and p.facilitador_id=facilitadores.id))
  with check (exists (select 1 from profiles p where p.id=auth.uid() and p.rol='facilitador' and p.facilitador_id=facilitadores.id));

-- ============================================================
-- 4) Público (anon, sin login): solo puede leer facilitadores
--    marcados como activos, para la página equipo.html
-- ============================================================

drop policy if exists "anon leer facilitadores activos" on facilitadores;
create policy "anon leer facilitadores activos"
  on facilitadores for select to anon
  using ((data->>'activo') is distinct from 'false');

-- ============================================================
-- ALTA DE UN FACILITADOR (hacer a mano, por cada uno):
-- 1. Supabase → Authentication → Users → Add user / Invite
--    (con el mismo email que tiene cargado en el admin).
-- 2. Copiar su UUID y correr:
--
--    insert into profiles (id, rol, facilitador_id)
--    values ('<UUID-FACILITADOR>', 'facilitador', '<ID-FACILITADOR-EN-ADMIN>')
--    on conflict (id) do update set rol='facilitador', facilitador_id=excluded.facilitador_id;
--
-- El "ID-FACILITADOR-EN-ADMIN" es el que muestra el botón
-- "Copiar ID" en la ficha del facilitador dentro del admin.
-- ============================================================
