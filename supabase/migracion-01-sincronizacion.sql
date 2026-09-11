-- Migración 01: lo que hace falta para sincronizar.
--
-- Se corre una sola vez, en el SQL Editor, sobre un proyecto que ya tiene el
-- esquema base. Es idempotente: correrla dos veces no rompe nada.
--
-- Por qué un archivo aparte y no editar `esquema.sql`: una base que ya tiene
-- datos no se puede recrear de cero, sólo modificar. Cada cambio al modelo
-- queda como un archivo nuevo, numerado, que se aplica en orden. Eso es una
-- "migración", y es como se versiona una base de datos en cualquier equipo.
-- `esquema.sql` también se actualiza, para que una instalación nueva no tenga
-- que aplicar la historia entera.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Lápidas (tombstones)
-- ─────────────────────────────────────────────────────────────────────
-- Borrar una fila de verdad rompe la sincronización: si borrás una rutina en
-- el celular y la compu todavía la tiene, la próxima vez que la compu suba sus
-- datos la rutina "revive". La solución estándar es no borrar, sino marcar:
-- la fila queda como lápida, con su fecha, y el otro dispositivo entiende que
-- lo que pasó fue un borrado y no un dato que le falta.

alter table public.ejercicios add column if not exists borrado boolean not null default false;
alter table public.rutinas add column if not exists borrado boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Guardar una rutina entera de una sola vez
-- ─────────────────────────────────────────────────────────────────────
-- Guardar una rutina son tres operaciones: actualizar la rutina, borrar sus
-- pasos viejos e insertar los nuevos. Desde el navegador serían tres pedidos
-- separados, y si el segundo llega y el tercero no —se cortó internet justo—
-- la rutina queda sin ningún ejercicio. Adentro de una función de Postgres las
-- tres pasan en una sola transacción: o pasan todas, o no pasa ninguna.
--
-- `security invoker` es deliberado: la función corre con los permisos de quien
-- la llama, así que las políticas de RLS se siguen aplicando. Con
-- `security definer` correría con los permisos del dueño de la función y
-- saltearía las políticas — es la forma más común de abrirse un agujero de
-- seguridad sin darse cuenta.

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

-- ─────────────────────────────────────────────────────────────────────
-- 3. Que lo borrado no se vea
-- ─────────────────────────────────────────────────────────────────────
-- Las políticas de lectura pública también tienen que ignorar las lápidas:
-- una rutina borrada no debería seguir apareciendo por ser pública.

drop policy if exists "rutinas públicas" on public.rutinas;
create policy "rutinas públicas" on public.rutinas
  for select using (publica and not borrado);
