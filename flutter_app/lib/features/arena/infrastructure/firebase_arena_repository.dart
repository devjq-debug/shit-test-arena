import 'dart:async';
import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:uuid/uuid.dart';
import '../domain/entities/arena_entities.dart';
import '../domain/repositories/arena_repository.dart';

class FirebaseArenaRepository implements ArenaRepository {
  FirebaseArenaRepository({FirebaseFirestore? firestore, FirebaseAuth? auth}) : _db = firestore ?? FirebaseFirestore.instance, _auth = auth ?? FirebaseAuth.instance;
  final FirebaseFirestore _db;
  final FirebaseAuth _auth;
  final _uuid = const Uuid();

  @override
  Future<String> ensureAnonymousUser() async { return (await _auth.currentUser ?? (await _auth.signInAnonymously()).user!).uid; }

  @override
  Future<ArenaRoom> createRoom({required String nickname, required int seconds, required int rounds, required String category}) async {
    final uid = await ensureAnonymousUser();
    final id = _uuid.v4();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final code = List.generate(5, (_) => alphabet[Random().nextInt(alphabet.length)]).join();
    final roomRef = _db.collection('rooms').doc(id);
    await roomRef.set({'code': code, 'hostId': uid, 'status': 'waiting', 'secondsPerRound': seconds, 'roundCount': rounds, 'category': category, 'currentRound': 0, 'createdAt': FieldValue.serverTimestamp(), 'expiresAt': Timestamp.fromDate(DateTime.now().add(const Duration(hours: 12)))});
    await roomRef.collection('participants').doc(uid).set({'roomId': id, 'nickname': nickname, 'isHost': true, 'joinedAt': FieldValue.serverTimestamp(), 'lastSeenAt': FieldValue.serverTimestamp()});
    return (await _snapshot(roomRef, uid));
  }

  @override
  Future<ArenaRoom> joinRoom({required String code, required String nickname}) async {
    final uid = await ensureAnonymousUser();
    final result = await _db.collection('rooms').where('code', isEqualTo: code.toUpperCase()).limit(1).get();
    if (result.docs.isEmpty) throw StateError('Sala no encontrada');
    final roomRef = result.docs.first.reference;
    final room = result.docs.first.data();
    if (room['status'] == 'finished') throw StateError('La sala ya terminó');
    await roomRef.collection('participants').doc(uid).set({'roomId': roomRef.id, 'nickname': nickname, 'isHost': false, 'joinedAt': FieldValue.serverTimestamp(), 'lastSeenAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));
    return _snapshot(roomRef, uid);
  }

  @override
  Stream<ArenaRoom> watchRoom(String roomId, String viewerId) {
    final controller = StreamController<ArenaRoom>.broadcast();
    final roomRef = _db.collection('rooms').doc(roomId);
    var queued = false;
    Future<void> emit() async {
      if (queued) return;
      queued = true;
      await Future<void>.delayed(Duration.zero);
      queued = false;
      try { controller.add(await _snapshot(roomRef, viewerId)); } catch (error, stack) { controller.addError(error, stack); }
    }
    final subscriptions = <StreamSubscription<dynamic>>[
      roomRef.snapshots().listen((_) => emit()),
      roomRef.collection('participants').snapshots().listen((_) => emit()),
      roomRef.collection('rounds').snapshots().listen((_) => emit()),
    ];
    controller.onCancel = () async { for (final subscription in subscriptions) { await subscription.cancel(); } await controller.close(); };
    emit();
    return controller.stream;
  }

  @override
  Future<void> startGame(ArenaRoom room) async {
    if (room.hostId != await ensureAnonymousUser()) throw StateError('Solo el host puede iniciar');
    final roundRef = _db.collection('rooms').doc(room.id).collection('rounds').doc('round_1');
    final started = DateTime.now();
    await roundRef.set({'number': 1, 'status': 'answering', 'question': {'id': 'q-1', 'text': 'Seguro eres así con todas.', 'category': room.category}, 'startedAt': Timestamp.fromDate(started), 'endsAt': Timestamp.fromDate(started.add(Duration(seconds: room.secondsPerRound)))});
    await _db.collection('rooms').doc(room.id).update({'status': 'answering', 'currentRound': 1});
  }

  @override
  Future<void> saveAnswer({required ArenaRoom room, required String roundId, required String participantId, required String text}) async { await _db.collection('rooms').doc(room.id).collection('rounds').doc(roundId).collection('answers').doc(participantId).set({'text': text, 'updatedAt': FieldValue.serverTimestamp()}); }
  @override
  Future<void> revealRound(ArenaRoom room, String roundId) async { await _db.collection('rooms').doc(room.id).collection('rounds').doc(roundId).update({'status': 'revealing', 'revealedAt': FieldValue.serverTimestamp()}); await _db.collection('rooms').doc(room.id).update({'status': 'revealing'}); }
  @override
  Future<void> nextRound(ArenaRoom room) async { if (room.currentRound >= room.roundCount) return _db.collection('rooms').doc(room.id).update({'status': 'finished'}); final n = room.currentRound + 1; final start = DateTime.now(); await _db.collection('rooms').doc(room.id).collection('rounds').doc('round_$n').set({'number': n, 'status': 'answering', 'question': {'id': 'q-$n', 'text': '¿Siempre necesitas llamar la atención?', 'category': room.category}, 'startedAt': Timestamp.fromDate(start), 'endsAt': Timestamp.fromDate(start.add(Duration(seconds: room.secondsPerRound)))}); await _db.collection('rooms').doc(room.id).update({'status': 'answering', 'currentRound': n}); }

  Future<ArenaRoom> _snapshot(DocumentReference<Map<String, dynamic>> ref, String viewerId) async {
    final roomDoc = await ref.get(); final data = roomDoc.data()!;
    final players = await ref.collection('participants').orderBy('joinedAt').get();
    final rounds = await ref.collection('rounds').orderBy('number').get();
    return ArenaRoom(id: ref.id, code: data['code'], hostId: data['hostId'], status: RoomStatus.values.byName(data['status']), secondsPerRound: data['secondsPerRound'], roundCount: data['roundCount'], category: data['category'], currentRound: data['currentRound'], participants: players.docs.map((p) => ArenaParticipant(id: p.id, nickname: p.data()['nickname'], isHost: p.data()['isHost'])).toList(), rounds: rounds.docs.map((r) { final d = r.data(); final q = d['question'] as Map<String, dynamic>; return ArenaRound(id: r.id, number: d['number'], status: RoomStatus.values.byName(d['status']), question: ArenaQuestion(id: q['id'], text: q['text'], category: q['category']), startedAt: (d['startedAt'] as Timestamp).toDate(), endsAt: (d['endsAt'] as Timestamp).toDate()); }).toList());
  }
}
