# Shit Test Arena

Juego multiplayer mobile-first para salas privadas, construido como frontend estático HTML/CSS/JavaScript y desplegado en Firebase Hosting.

Demo pública: [shit-test-arena.web.app](https://shit-test-arena.web.app)

El identificador global `shit-test.web.app` ya pertenece a otro proyecto de Firebase. El dominio público disponible sin números para este proyecto es `shit-test-arena.web.app`.

## Arquitectura activa

- `web/index.html`: interfaz visual basada en el paquete de Stitch suministrado.
- `web/js/app.js`: autenticación anónima, estado de sala, presencia, cronómetros y sincronización multiplayer.
- `database.rules.json`: autorización y validación de Firebase Realtime Database.
- `firebase.json`: Hosting, rutas SPA, políticas de caché y reglas de base de datos.

La fuente de verdad es Realtime Database. Los datos se separan en `rooms`, `roomCodes`, `roomPlayers` y `roomAnswers`, evitando descargar respuestas mientras una ronda sigue abierta. El host es la única autoridad para iniciar, cerrar y reiniciar partidas; cada participante solo puede editar su propia presencia y respuesta.

Las carpetas del prototipo Next/Supabase y de la migración intermedia Flutter/Firestore se conservan únicamente como historial. Firebase Hosting publica exclusivamente `web/`.

## Desarrollo y despliegue

No hay compilación del frontend. Para servirlo localmente se puede usar cualquier servidor HTTP estático. Para desplegar:

```powershell
firebase deploy --project shit-test-3bf22 --only hosting,database
```

Anonymous Authentication y Realtime Database deben permanecer habilitados en el proyecto `shit-test-3bf22`.

## Flujo cubierto

Crear sala, código único, enlace directo `/room/CODIGO`, unión por nickname, recuperación tras recarga, presencia conectada/desconectada, cuenta regresiva autoritativa, ronda con temporizador compartido, respuestas privadas, revelación, puntuación idempotente, clasificación, reinicio y cierre explícito de sala.
