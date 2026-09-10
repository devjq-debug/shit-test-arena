# Shit Test Arena

Juego multiplayer mobile-first para practicar respuestas rápidas con amigos. No requiere cuentas: cada jugador entra solamente con un nickname.

## Migración Flutter Web + Firebase

La versión migrada vive en `flutter_app/` con separación DDD (`domain`, `application`, `infrastructure` y `presentation`). Firebase Authentication anónimo y Cloud Firestore son la fuente de verdad multiplayer.

Demo pública: [shit-test-3bf22.web.app](https://shit-test-3bf22.web.app)

Para ejecutarla o desplegarla, consulta [`flutter_app/README.md`](flutter_app/README.md).

## Ejecutar localmente

1. Instala Node.js 20 o superior.
2. Ejecuta `npm install`.
3. Copia `.env.example` a `.env.local`.
4. Para que funcione multiplayer entre dispositivos, configura ambas variables. Sin ellas la app cae deliberadamente a modo local de demostración.
5. Ejecuta `npm run dev` y abre `http://localhost:3000`.

## Activar Supabase

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. Abre SQL Editor y ejecuta todo el contenido de `supabase/schema.sql`.
3. En Project Settings → API copia la Project URL y la anon public key en `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
```

4. Ejecuta el SQL completo: además de tablas y RLS, añade `rooms`, `participants`, `rounds` y `answers` a la publicación `supabase_realtime`.
5. En Authentication → Providers activa Anonymous Sign-Ins.
6. Nunca uses la service role key en el navegador.

## Publicar gratis en Vercel

1. Sube el repositorio a GitHub.
2. Entra en [vercel.com](https://vercel.com), importa el repositorio y conserva el preset Next.js.
3. Añade las dos variables `NEXT_PUBLIC_SUPABASE_*` en Project Settings → Environment Variables.
4. Pulsa Deploy. Vercel generará una URL `*.vercel.app` que puedes compartir.

## Flujo incluido

Crear sala, generar código, unirse con nickname, lobby, configuración de tiempo/rondas/categoría, cronómetro calculado desde timestamps, respuesta editable hasta cero, respuestas ocultas, revelación por ronda e historial final. El estado de la sesión se guarda localmente para tolerar un refresh accidental.

## Auditoría multiplayer

Supabase es la fuente de verdad. Cada sala usa un canal compartido `room:<room_uuid>` —no el nickname ni el código como filtro de `room_id`— y escucha cambios de `rooms`, `participants`, `rounds` y `answers`. Tras suscribirse se ejecuta una resincronización completa para cubrir eventos perdidos durante la carrera de entrada/inicio.

El frontend obtiene una sesión anónima antes de crear o unirse, escribe cambios en las tablas y solo representa el snapshot consultado. El cronómetro usa `rounds.started_at` y `rounds.ends_at`; las respuestas se filtran por RLS para que durante la ronda cada jugador vea solo la suya y durante la revelación todos vean todas.

## Nota de arquitectura

La carpeta `lib` contiene tipos, preguntas, cliente Supabase y `onlineRoom.ts`, que concentra autenticación anónima, consultas, suscripciones, resync y mutaciones. `components/Arena.tsx` representa el snapshot remoto y mantiene un fallback local solo cuando faltan variables. `supabase/schema.sql` define tablas, índices, RLS y publicación Realtime. El banco local trae 100 prompts sin repetir dentro de una partida.
