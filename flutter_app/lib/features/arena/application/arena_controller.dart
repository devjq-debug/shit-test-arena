import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/entities/arena_entities.dart';
import '../domain/repositories/arena_repository.dart';

final arenaRepositoryProvider = Provider<ArenaRepository>((ref) => throw UnimplementedError('Configure FirebaseArenaRepository in main.dart'));
final arenaControllerProvider = StateNotifierProvider<ArenaController, AsyncValue<ArenaRoom?>>((ref) => ArenaController(ref.watch(arenaRepositoryProvider)));

class ArenaController extends StateNotifier<AsyncValue<ArenaRoom?>> {
  ArenaController(this._repository) : super(const AsyncData(null));
  final ArenaRepository _repository;
  StreamSubscription<ArenaRoom>? _subscription;
  String? viewerId;

  Future<void> create({required String nickname, required int seconds, required int rounds, required String category}) async { state = const AsyncLoading(); try { final room = await _repository.createRoom(nickname: nickname, seconds: seconds, rounds: rounds, category: category); viewerId = room.participants.first.id; _watch(room.id); } catch (e, s) { state = AsyncError(e, s); } }
  Future<void> join(String code, String nickname) async { state = const AsyncLoading(); try { final room = await _repository.joinRoom(code: code, nickname: nickname); viewerId = room.participants.last.id; _watch(room.id); } catch (e, s) { state = AsyncError(e, s); } }
  void _watch(String roomId) { _subscription?.cancel(); _subscription = _repository.watchRoom(roomId, viewerId!).listen((room) => state = AsyncData(room), onError: (Object e, StackTrace s) => state = AsyncError(e, s)); }
  Future<void> start() async { final room = state.valueOrNull; if (room != null) await _repository.startGame(room); }
  Future<void> answer(String text) async { final room = state.valueOrNull; final round = room?.activeRound; if (room != null && round != null && viewerId != null) await _repository.saveAnswer(room: room, roundId: round.id, participantId: viewerId!, text: text); }
  Future<void> reveal() async { final room = state.valueOrNull; final round = room?.activeRound; if (room != null && round != null) await _repository.revealRound(room, round.id); }
  Future<void> nextRound() async { final room = state.valueOrNull; if (room != null) await _repository.nextRound(room); }
  @override void dispose() { _subscription?.cancel(); super.dispose(); }
}
