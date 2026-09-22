-- ─────────────────────────────────────────────────────────────────────
-- Migración 02: compartir una rutina con alguien, y buzón de sugerencias
-- ─────────────────────────────────────────────────────────────────────
-- Se corre entera en el SQL Editor del proyecto. Es idempotente.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Compartir una rutina con una persona
-- ═════════════════════════════════════════════════════════════════════
-- Compartir NO es copiar. La rutina sigue siendo una sola fila, del dueño, y
-- lo único que se agrega es permiso de lectura para otra persona. De ahí sale
-- gratis la regla que se pidió: si el dueño la borra, al otro le desaparece.
-- No hay nada que sincronizar ni ningún borrado que propagar, porque nunca
-- hubo dos copias.
--
-- El destinatario se identifica por MAIL y no por id de usuario, por un motivo
-- práctico: `auth.users` no se puede leer desde el cliente, así que la app no
-- tiene forma de traducir un mail a un id antes de guardar. Y por uno de
-- producto: se puede compartir con alguien que todavía no se creó la cuenta, y
-- el día que entre con ese mail, la rutina ya está esperándolo.

create table if not exists public.rutinas_compartidas (
  usuario_id uuid not null,
  rutina_id text not null,
  -- Siempre en minúsculas: los mails no distinguen mayúsculas en la práctica,
  -- y normalizar acá evita comparar con lower() en cada política.
  destinatario_email text not null check (destinatario_email = lower(destinatario_email)),
  creado_en timestamptz not null default now(),
  primary key (usuario_id, rutina_id, destinatario_email),
  -- Si la rutina se borra de verdad de la base, la comparticion se va con ella.
  foreign key (usuario_id, rutina_id)
    references public.rutinas (usuario_id, id) on delete cascade
);

create index if not exists compartidas_por_destinatario
  on public.rutinas_compartidas (destinatario_email);

alter table public.rutinas_compartidas enable row level security;

-- El dueño manda sobre lo que comparte: ve la lista, agrega y quita.
drop policy if exists "comparto lo mío" on public.rutinas_compartidas;
create policy "comparto lo mío" on public.rutinas_compartidas
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- Y quien recibe puede ver la fila que lo nombra, para saber qué le tocó.
drop policy if exists "veo lo que me comparten" on public.rutinas_compartidas;
create policy "veo lo que me comparten" on public.rutinas_compartidas
  for select using (destinatario_email = lower(auth.jwt() ->> 'email'));

-- ── Lo que el destinatario puede leer ────────────────────────────────
-- Tres políticas espejo de las que ya existen para las rutinas públicas. La
-- diferencia que importa está en el `not borrado`: una rutina con lápida deja
-- de ser legible para quien la recibió, y eso ES el borrado propagándose.

drop policy if exists "rutinas compartidas conmigo" on public.rutinas;
create policy "rutinas compartidas conmigo" on public.rutinas
  for select using (
    not borrado
    and exists (
      select 1 from public.rutinas_compartidas c
      where c.usuario_id = rutinas.usuario_id
        and c.rutina_id = rutinas.id
        and c.destinatario_email = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "pasos de rutinas compartidas conmigo" on public.rutina_ejercicios;
create policy "pasos de rutinas compartidas conmigo" on public.rutina_ejercicios
  for select using (
    exists (
      select 1
      from public.rutinas_compartidas c
      join public.rutinas r
        on r.usuario_id = c.usuario_id and r.id = c.rutina_id
      where c.usuario_id = rutina_ejercicios.usuario_id
        and c.rutina_id = rutina_ejercicios.rutina_id
        and c.destinatario_email = lower(auth.jwt() ->> 'email')
        and not r.borrado
    )
  );

-- Un ejercicio se vuelve legible sólo si alguna rutina compartida CONMIGO lo
-- usa, y sólo mientras siga vivo. Borrar el ejercicio se lo saca al otro de la
-- rutina sin romperle nada: el motor de audio ya saltea un id que no encuentra.
drop policy if exists "ejercicios de rutinas compartidas conmigo" on public.ejercicios;
create policy "ejercicios de rutinas compartidas conmigo" on public.ejercicios
  for select using (
    not borrado
    and exists (
      select 1
      from public.rutina_ejercicios re
      join public.rutinas_compartidas c
        on c.usuario_id = re.usuario_id and c.rutina_id = re.rutina_id
      join public.rutinas r
        on r.usuario_id = c.usuario_id and r.id = c.rutina_id
      where re.usuario_id = ejercicios.usuario_id
        and re.ejercicio_id = ejercicios.id
        and c.destinatario_email = lower(auth.jwt() ->> 'email')
        and not r.borrado
    )
  );

-- ═════════════════════════════════════════════════════════════════════
-- 2. Buzón de sugerencias
-- ═════════════════════════════════════════════════════════════════════
-- El objetivo era recibir mensajes sin publicar ninguna dirección de contacto:
-- ni en la página ni en el código, que es público y se lee entero.
--
-- La solución es una tabla donde cualquiera puede INSERTAR y nadie puede
-- LEER. En Postgres con RLS encendido eso no se declara: se logra no
-- escribiendo la política de select. Sin política que lo permita, la
-- operación está prohibida, y ni la anon key ni una sesión iniciada pueden
-- traer una sola fila.
--
-- Los mensajes se leen desde el panel de Supabase, que entra con la service
-- role key y se saltea RLS por diseño. Esa llave nunca viaja al navegador.

create table if not exists public.sugerencias (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (char_length(trim(texto)) between 1 and 2000),
  -- Opcional, y es de quien escribe: si quiere respuesta, deja cómo ubicarlo.
  contacto text not null default '' check (char_length(contacto) <= 200),
  -- Queda si había sesión iniciada; null si el mensaje es anónimo.
  usuario_id uuid references auth.users on delete set null,
  creado_en timestamptz not null default now()
);

alter table public.sugerencias enable row level security;

-- Escribir: cualquiera, con o sin cuenta.
drop policy if exists "cualquiera puede sugerir" on public.sugerencias;
create policy "cualquiera puede sugerir" on public.sugerencias
  for insert with check (true);

-- Leer, modificar o borrar: nadie. La ausencia de políticas es la protección;
-- no hace falta (ni se puede) escribir una que diga "prohibido".

-- ═════════════════════════════════════════════════════════════════════
-- Para leer las sugerencias desde el SQL Editor
-- ═════════════════════════════════════════════════════════════════════
--   select creado_en, texto, contacto from public.sugerencias
--   order by creado_en desc;
