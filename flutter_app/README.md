# Shit Test Arena — Flutter + Firebase

Esta es la migración preparada con arquitectura DDD y Firebase como backend realtime.

## Estructura

```text
lib/
  core/                 # configuración, errores y utilidades compartidas
  features/arena/
    domain/             # entidades, enums y contratos de repositorio
    application/        # casos de uso y estado de la partida
    infrastructure/     # Firebase Auth + Cloud Firestore
    presentation/       # páginas y widgets Flutter
```

## Ejecutar

1. Instala Flutter y verifica `flutter doctor`.
2. Instala Firebase CLI y FlutterFire CLI.
3. Desde esta carpeta ejecuta `flutterfire configure` y selecciona tu proyecto Firebase.
4. Activa Anonymous Authentication y Firestore Database.
5. Ejecuta `firebase deploy --only firestore:rules`.
6. Ejecuta `flutter pub get` y `flutter run -d chrome`.

## Publicar gratis

```bash
flutter build web --release
firebase init hosting
firebase deploy --only hosting
```

Firebase Hosting entrega la URL pública [shit-test-arena.web.app](https://shit-test-arena.web.app). El nombre exacto `shit-test.web.app` no está disponible: Firebase informa que está reservado globalmente por otro proyecto.

El identificador con números (`shit-test-3bf22.web.app`) corresponde al sitio predeterminado generado por Firebase y se mantiene como respaldo del proyecto; la configuración de despliegue apunta al alias limpio.

## Fuente de verdad

Firestore es la fuente de verdad. Cada sala está en `rooms/{roomId}`, sus participantes en la subcolección `participants`, sus rondas en `rounds` y sus respuestas en `answers`. La UI usa streams de Firestore; no usa `localStorage` para coordinar jugadores.
