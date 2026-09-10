import { SupabaseClient } from "@supabase/supabase-js";
import { pickQuestions } from "./questions";
import { Category, GameRoom, Player, Question, Round } from "./types";

type DbRoom = { id: string; room_code: string; host_participant_id: string | null; status: GameRoom["status"]; seconds_per_round: number; round_count: number; category: Category; current_round: number; };
type DbParticipant = { id: string; room_id: string; nickname: string; is_host: boolean; last_seen_at: string; };
type DbRound = { id: string; room_id: string; question_id: string; round_number: number; status: "answering" | "revealing"; started_at: string; ends_at: string; };

export type OnlineSnapshot = { room: GameRoom; roomId: string; participantId: string; };
const log = (...args: unknown[]) => { if (process.env.NODE_ENV !== "production") console.info("[REALTIME]", ...args); };

export async function ensureAnonymousSession(client: SupabaseClient) {
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) return sessionData.session.user.id;
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("No se pudo crear la sesión anónima");
  return data.user.id;
}

export async function createOnlineRoom(client: SupabaseClient, nickname: string, seconds: number, roundCount: number, category: Category) {
  const sessionId = await ensureAnonymousSession(client);
  const code = Math.random().toString(36).slice(2, 7).toUpperCase();
  const { data: room, error: roomError } = await client.from("rooms").insert({ room_code: code, status: "waiting", seconds_per_round: seconds, round_count: roundCount, category }).select("*").single();
  if (roomError) throw roomError;
  const { data: participant, error: participantError } = await client.from("participants").insert({ room_id: room.id, session_id: sessionId, nickname, is_host: true }).select("*").single();
  if (participantError) throw participantError;
  const { error: hostError } = await client.from("rooms").update({ host_participant_id: participant.id }).eq("id", room.id);
  if (hostError) throw hostError;
  log("Room created", code);
  return { roomId: room.id as string, participantId: participant.id as string, code };
}

export async function joinOnlineRoom(client: SupabaseClient, code: string, nickname: string) {
  const sessionId = await ensureAnonymousSession(client);
  const { data: room, error: roomError } = await client.from("rooms").select("*").eq("room_code", code).gt("expires_at", new Date().toISOString()).single();
  if (roomError || !room) throw roomError ?? new Error("Sala no encontrada");
  if (room.status === "finished") throw new Error("Esta sala ya terminó");
  const { data: existing } = await client.from("participants").select("*").eq("room_id", room.id).eq("session_id", sessionId).maybeSingle();
  if (existing) return { roomId: room.id as string, participantId: existing.id as string, code: room.room_code as string };
  const { data: participant, error } = await client.from("participants").insert({ room_id: room.id, session_id: sessionId, nickname, is_host: false }).select("*").single();
  if (error) throw error;
  log("Participant joined", nickname, code);
  return { roomId: room.id as string, participantId: participant.id as string, code: room.room_code as string };
}

export async function syncOnlineRoom(client: SupabaseClient, roomId: string, participantId: string): Promise<OnlineSnapshot> {
  const [{ data: dbRoom, error: roomError }, { data: dbPlayers, error: playersError }] = await Promise.all([
    client.from("rooms").select("*").eq("id", roomId).single(),
    client.from("participants").select("id,room_id,nickname,is_host,last_seen_at").eq("room_id", roomId).order("joined_at", { ascending: true })
  ]);
  if (roomError) throw roomError;
  if (playersError) throw playersError;
  const room = dbRoom as DbRoom;
  const players = (dbPlayers ?? []).map((player: DbParticipant): Player => ({ id: player.id, nickname: player.nickname, isHost: player.is_host, connected: Date.now() - new Date(player.last_seen_at).getTime() < 120000 }));
  const { data: dbRounds, error: roundsError } = await client.from("rounds").select("id,room_id,question_id,round_number,status,started_at,ends_at").eq("room_id", roomId).order("round_number", { ascending: true });
  if (roundsError) throw roundsError;
  const rounds = (dbRounds ?? []) as DbRound[];
  const questionIds = rounds.map((round) => round.question_id);
  const { data: dbQuestions } = questionIds.length ? await client.from("questions").select("id,text,category").in("id", questionIds) : { data: [] as never[] };
  const questionMap = new Map((dbQuestions ?? []).map((question: Question & { id: string }) => [question.id, question]));
  const visibleRounds = await Promise.all(rounds.map(async (round) => {
    const { data: dbAnswers } = await client.from("answers").select("participant_id,answer_text").eq("round_id", round.id);
    return { id: round.id, number: round.round_number, question: questionMap.get(round.question_id) ?? { id: round.question_id, text: "Pregunta no disponible", category: "Conversación" as const }, status: round.status, startedAt: new Date(round.started_at).getTime(), endsAt: new Date(round.ends_at).getTime(), answers: Object.fromEntries((dbAnswers ?? []).map((answer) => [answer.participant_id, answer.answer_text])) } as Round;
  }));
  log("Room state synchronized", room.room_code, room.status);
  return { room: { code: room.room_code, hostId: room.host_participant_id ?? "", players, seconds: room.seconds_per_round, roundCount: room.round_count, category: room.category, status: room.status, currentRound: room.current_round, rounds: visibleRounds }, roomId, participantId };
}

export function subscribeToOnlineRoom(client: SupabaseClient, roomId: string, code: string, onSync: () => void, onConnection: (state: "connecting" | "connected" | "reconnecting" | "disconnected") => void) {
  log("Connecting to room", code, roomId);
  const channel = client.channel(`room:${roomId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, () => { log("Room updated"); onSync(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${roomId}` }, () => { log("Participant changed"); onSync(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` }, () => { log("Round changed"); onSync(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter: `room_id=eq.${roomId}` }, () => { log("Answer changed"); onSync(); })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") { log("Subscription status: SUBSCRIBED"); onConnection("connected"); onSync(); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { console.error("[REALTIME] Subscription error", status); onConnection("reconnecting"); }
      else if (status === "CLOSED") onConnection("disconnected");
      else onConnection("connecting");
    });
  return () => { log("Unsubscribe", code); void client.removeChannel(channel); };
}

export async function startOnlineGame(client: SupabaseClient, roomId: string, room: GameRoom) {
  const selected = pickQuestions(room.category, room.roundCount)[0];
  const { data: question, error: questionError } = await client.from("questions").insert({ text: selected.text, category: selected.category, active: true }).select("*").single();
  if (questionError) throw questionError;
  const started = new Date();
  const ends = new Date(started.getTime() + room.seconds * 1000);
  const { error: roundError } = await client.from("rounds").insert({ room_id: roomId, question_id: question.id, round_number: 1, status: "answering", started_at: started.toISOString(), ends_at: ends.toISOString() });
  if (roundError) throw roundError;
  const { error } = await client.from("rooms").update({ status: "answering", current_round: 1 }).eq("id", roomId);
  if (error) throw error;
  log("Round 1 started");
}

export async function submitOnlineAnswer(client: SupabaseClient, roomId: string, roundId: string, participantId: string, text: string) {
  const { error } = await client.from("answers").upsert({ room_id: roomId, round_id: roundId, participant_id: participantId, answer_text: text, updated_at: new Date().toISOString() }, { onConflict: "round_id,participant_id" });
  if (error) throw error;
  log("Answer submitted");
}

export async function revealOnlineRound(client: SupabaseClient, roomId: string, roundId: string) {
  await client.from("rounds").update({ status: "revealing", revealed_at: new Date().toISOString() }).eq("id", roundId).eq("room_id", roomId);
  const { error } = await client.from("rooms").update({ status: "revealing" }).eq("id", roomId);
  if (error) throw error;
  log("Round revealed");
}

export async function nextOnlineRound(client: SupabaseClient, roomId: string, room: GameRoom) {
  if (room.currentRound >= room.roundCount) { const { error } = await client.from("rooms").update({ status: "finished" }).eq("id", roomId); if (error) throw error; return; }
  const used = new Set(room.rounds.map((round) => round.question.text));
  const selected = pickQuestions(room.category, room.roundCount * 2).find((question) => !used.has(question.text)) ?? pickQuestions(room.category, 1)[0];
  const { data: question, error: questionError } = await client.from("questions").insert({ text: selected.text, category: selected.category, active: true }).select("*").single();
  if (questionError) throw questionError;
  const next = room.currentRound + 1;
  const started = new Date();
  const ends = new Date(started.getTime() + room.seconds * 1000);
  const { error: roundError } = await client.from("rounds").insert({ room_id: roomId, question_id: question.id, round_number: next, status: "answering", started_at: started.toISOString(), ends_at: ends.toISOString() });
  if (roundError) throw roundError;
  const { error } = await client.from("rooms").update({ status: "answering", current_round: next }).eq("id", roomId);
  if (error) throw error;
  log("Round started", next);
}
