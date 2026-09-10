enum RoomStatus { waiting, answering, revealing, finished }

class ArenaParticipant {
  const ArenaParticipant({required this.id, required this.nickname, required this.isHost});
  final String id;
  final String nickname;
  final bool isHost;
}

class ArenaQuestion {
  const ArenaQuestion({required this.id, required this.text, required this.category});
  final String id;
  final String text;
  final String category;
}

class ArenaRound {
  const ArenaRound({required this.id, required this.number, required this.question, required this.startedAt, required this.endsAt, required this.status, this.answers = const {}});
  final String id;
  final int number;
  final ArenaQuestion question;
  final DateTime startedAt;
  final DateTime endsAt;
  final RoomStatus status;
  final Map<String, String> answers;
}

class ArenaRoom {
  const ArenaRoom({required this.id, required this.code, required this.hostId, required this.status, required this.secondsPerRound, required this.roundCount, required this.category, required this.currentRound, required this.participants, this.rounds = const []});
  final String id;
  final String code;
  final String hostId;
  final RoomStatus status;
  final int secondsPerRound;
  final int roundCount;
  final String category;
  final int currentRound;
  final List<ArenaParticipant> participants;
  final List<ArenaRound> rounds;

  ArenaRound? get activeRound => rounds.where((r) => r.number == currentRound).firstOrNull;
}

extension FirstOrNull<T> on Iterable<T> { T? get firstOrNull => isEmpty ? null : first; }
