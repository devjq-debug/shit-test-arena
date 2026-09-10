import '../entities/arena_entities.dart';

abstract interface class ArenaRepository {
  Future<String> ensureAnonymousUser();
  Future<ArenaRoom> createRoom({required String nickname, required int seconds, required int rounds, required String category});
  Future<ArenaRoom> joinRoom({required String code, required String nickname});
  Stream<ArenaRoom> watchRoom(String roomId, String viewerId);
  Future<void> startGame(ArenaRoom room);
  Future<void> saveAnswer({required ArenaRoom room, required String roundId, required String participantId, required String text});
  Future<void> revealRound(ArenaRoom room, String roundId);
  Future<void> nextRound(ArenaRoom room);
}
