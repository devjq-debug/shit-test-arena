import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/firebase_bootstrap.dart';
import 'features/arena/application/arena_controller.dart';
import 'features/arena/infrastructure/firebase_arena_repository.dart';
import 'features/arena/presentation/arena_app.dart';

void main() async { WidgetsFlutterBinding.ensureInitialized(); await bootstrapFirebase(); runApp(ProviderScope(overrides: [arenaRepositoryProvider.overrideWithValue(FirebaseArenaRepository())], child: const ArenaApp())); }
