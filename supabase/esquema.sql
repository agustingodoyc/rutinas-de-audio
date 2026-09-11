-- Esquema de Rutinas de audio en Supabase.
--
-- Se corre entero en el SQL Editor del proyecto. Es idempotente: se puede
-- volver a correr sin romper nada.
--
-- Tres tablas y una de perfiles. Los ids son los mismos que usa la app
-- ("propio:sentadilla", "mia:pecho-1"), no uuid generados acá: así lo que ya
-- está guardado en IndexedDB sube tal cual, sin traducir ids, y una rutina
-- exportada sigue siendo la misma de los dos lados. Como esos ids sólo son
-- únicos dentro de una persona, la clave primaria es (usuario_id, id).

-- ─────────────────────────────────────────────────────────────────────
-- Perfiles: el nombre visible de quien publica una rutina
-- ─────────────────────────────────────────────────────────────────────
-- auth.users no se puede leer desde el cliente, así que el nombre para
-- mostrar vive acá. Lo crea un trigger cuando alguien se registra: si hubiera
-- que crearlo desde la app, una fila que falla deja un usuario sin perfil.

create table if not exists public.perfiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text not null default '',
  avatar text not null default '',
  creado_en timestamptz not null default now()
);

create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- ─────────────────────────────────────────────────────────────────────
-- Ejercicios
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.ejercicios (
  usuario_id uuid not null references auth.users on delete cascade,
  id text not null,
  nombre text not null,
  grupo text not null default 'Otro',
  cambio_lado boolean not null default false,
  instrucciones text not null,
  actualizado_en timestamptz not null default now(),
  -- Lápida: borrar de verdad haría "revivir" la fila desde otro dispositivo.
  borrado boolean not null default false,
  primary key (usuario_id, id)
);

-- ─────────────────────────────────────────────────────────────────────
-- Rutinas
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.rutinas (
  usuario_id uuid not null references auth.users on delete cascade,
  id text not null,
  nombre text not null,
  descripcion text not null default '',
  publica boolean not null default false,
  actualizado_en timestamptz not null default now(),
  borrado boolean not null default false,
  primary key (usuario_id, id)
);

create index if not exists rutinas_publicas on public.rutinas (publica) where publica;

-- ─────────────────────────────────────────────────────────────────────
-- Los pasos de cada rutina
-- ─────────────────────────────────────────────────────────────────────
-- `orden` es parte de la clave: una rutina es una secuencia, y el orden no es
-- un adorno sino parte de la identidad del paso.
--
-- A propósito NO hay clave foránea contra `ejercicios`: un paso puede apuntar
-- a un ejercicio del catálogo, que viaja con la app y no está en esta base. La
-- app ya resuelve el caso de un id que no encuentra —lo saltea al generar— así
-- que la integridad acá sería una falsa promesa.

create table if not exists public.rutina_ejercicios (
  usuario_id uuid not null,
  rutina_id text not null,
  orden smallint not null,
  ejercicio_id text not null,
  seg smallint not null check (seg > 0 and seg <= 3600),
  primary key (usuario_id, rutina_id, orden),
  foreign key (usuario_id, rutina_id)
    references public.rutinas (usuario_id, id) on delete cascade
);

-- ─────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────
-- Sin esto, la anon key —que es pública y viaja en el JavaScript— deja leer
-- todas las filas de todo el mundo. Las políticas son la seguridad real de
-- este proyecto, no un extra.

alter table public.perfiles enable row level security;
alter table public.ejercicios enable row level security;
alter table public.rutinas enable row level security;
alter table public.rutina_ejercicios enable row level security;

-- Cada quien manda sobre lo suyo.
drop policy if exists "ejercicios propios" on public.ejercicios;
create policy "ejercicios propios" on public.ejercicios
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

drop policy if exists "rutinas propias" on public.rutinas;
create policy "rutinas propias" on public.rutinas
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

drop policy if exists "pasos propios" on public.rutina_ejercicios;
create policy "pasos propios" on public.rutina_ejercicios
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

drop policy if exists "perfil propio" on public.perfiles;
create policy "perfil propio" on public.perfiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Lo público, para cualquiera: incluso sin iniciar sesión.
drop policy if exists "rutinas públicas" on public.rutinas;
create policy "rutinas públicas" on public.rutinas
  for select using (publica and not borrado);

drop policy if exists "perfiles visibles" on public.perfiles;
create policy "perfiles visibles" on public.perfiles
  for select using (true);

-- Un paso es visible si su rutina es pública.
drop policy if exists "pasos de rutinas públicas" on public.rutina_ejercicios;
create policy "pasos de rutinas públicas" on public.rutina_ejercicios
  for select using (
    exists (
      select 1 from public.rutinas r
      where r.usuario_id = rutina_ejercicios.usuario_id
        and r.id = rutina_ejercicios.rutina_id
        and r.publica
    )
  );

-- Y un ejercicio propio se vuelve visible sólo si alguna rutina pública lo
-- usa. Publicar una rutina no abre el resto de la biblioteca.
drop policy if exists "ejercicios de rutinas públicas" on public.ejercicios;
create policy "ejercicios de rutinas públicas" on public.ejercicios
  for select using (
    exists (
      select 1
      from public.rutina_ejercicios re
      join public.rutinas r
        on r.usuario_id = re.usuario_id and r.id = re.rutina_id
      where re.usuario_id = ejercicios.usuario_id
        and re.ejercicio_id = ejercicios.id
        and r.publica
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Guardar una rutina entera en una sola transacción
-- ─────────────────────────────────────────────────────────────────────
-- Ver supabase/migracion-01-sincronizacion.sql para el detalle de por qué.

create or replace function public.guardar_rutina(
  p_id text,
  p_nombre text,
  p_descripcion text,
  p_publica boolean,
  p_actualizado timestamptz,
  p_pasos jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'Hay que iniciar sesión para guardar una rutina.';
  end if;

  insert into public.rutinas (usuario_id, id, nombre, descripcion, publica, actualizado_en, borrado)
  values (v_usuario, p_id, p_nombre, p_descripcion, p_publica, p_actualizado, false)
  on conflict (usuario_id, id) do update
    set nombre = excluded.nombre,
        descripcion = excluded.descripcion,
        publica = excluded.publica,
        actualizado_en = excluded.actualizado_en,
        borrado = false;

  delete from public.rutina_ejercicios
   where usuario_id = v_usuario and rutina_id = p_id;

  insert into public.rutina_ejercicios (usuario_id, rutina_id, orden, ejercicio_id, seg)
  select v_usuario,
         p_id,
         (paso ->> 'orden')::smallint,
         paso ->> 'ejercicio_id',
         (paso ->> 'seg')::smallint
    from jsonb_array_elements(p_pasos) as paso;
end;
$$;
