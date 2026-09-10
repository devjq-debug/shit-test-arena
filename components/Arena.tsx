"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clipboard, Copy, Crown, Link as LinkIcon, LockKeyhole, Play, RefreshCw, Send, Sparkles, Users, Zap } from "lucide-react";
import { pickQuestions } from "../lib/questions";
import { Category, GameRoom, Player, Round } from "../lib/types";
import { createOnlineRoom, ensureAnonymousSession, joinOnlineRoom, nextOnlineRound, revealOnlineRound, startOnlineGame, subscribeToOnlineRoom, submitOnlineAnswer, syncOnlineRoom } from "../lib/onlineRoom";
import { getSupabase } from "../lib/supabase";

const categories: Category[] = ["Todas", "Bromas", "Provocaciones", "Presión social", "Improvisación", "Conversación", "Seguridad", "Difíciles"];
const secondsOptions = [5, 10, 15, 20, 30];
const roundsOptions = [5, 10, 15, 20];
const key = "shit-test-arena-session";

type Screen = "home" | "create" | "join" | "lobby" | "game" | "finished";

function makeCode() { return Math.random().toString(36).slice(2, 7).toUpperCase(); }
function newPlayer(nickname: string, isHost = false): Player { return { id: crypto.randomUUID(), nickname, isHost, connected: true }; }
function roomFor(host: Player, seconds: number, roundCount: number, category: Category): GameRoom {
  return { code: makeCode(), hostId: host.id, players: [host], seconds, roundCount, category, status: "waiting", currentRound: 0, rounds: [] };
}

export default function Arena({ initialCode = "" }: { initialCode?: string }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [seconds, setSeconds] = useState(10);
  const [customSeconds, setCustomSeconds] = useState(35);
  const [roundCount, setRoundCount] = useState(10);
  const [category, setCategory] = useState<Category>("Todas");
  const [answer, setAnswer] = useState("");
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "disconnected">("connecting");
  const [onlineRoomId, setOnlineRoomId] = useState("");
  const [onlineParticipantId, setOnlineParticipantId] = useState("");
  const supabase = useMemo(() => getSupabase(), []);
  const online = Boolean(supabase);
  const isHost = Boolean(room && me && (room.hostId === me.id || me.isHost));
  const current = room?.rounds[room.currentRound - 1];
  const remaining = current ? Math.max(0, Math.ceil((current.endsAt - now) / 1000)) : 0;
  const myAnswer = current && me ? current.answers[me.id] ?? "" : "";

  useEffect(() => {
    if (initialCode) { setJoinCode(initialCode); setScreen("join"); }
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { room: GameRoom; me: Player; screen: Screen; onlineRoomId?: string; onlineParticipantId?: string };
      if (saved.room && saved.me) { setRoom(saved.room); setMe(saved.me); setOnlineRoomId(saved.onlineRoomId ?? ""); setOnlineParticipantId(saved.onlineParticipantId ?? ""); setScreen(saved.room.status === "finished" ? "finished" : saved.room.status === "waiting" ? "lobby" : "game"); }
    } catch { localStorage.removeItem(key); }
  }, [initialCode]);

  useEffect(() => {
    if (!supabase || !onlineRoomId || !onlineParticipantId) return;
    let alive = true;
    const sync = async () => {
      try {
        const snapshot = await syncOnlineRoom(supabase, onlineRoomId, onlineParticipantId);
        if (!alive) return;
        setRoom(snapshot.room);
        setMe(snapshot.room.players.find((player) => player.id === onlineParticipantId) ?? null);
        setScreen(snapshot.room.status === "finished" ? "finished" : snapshot.room.status === "waiting" ? "lobby" : "game");
      } catch (error) { console.error("[SYNC] Room state failed", error); setConnection("reconnecting"); }
    };
    void sync();
    const cleanup = subscribeToOnlineRoom(supabase, onlineRoomId, room?.code ?? "", () => void sync(), setConnection);
    return () => { alive = false; cleanup(); };
  }, [supabase, onlineRoomId, onlineParticipantId]);

  useEffect(() => {
    if (room && me) localStorage.setItem(key, JSON.stringify({ room, me, screen, onlineRoomId, onlineParticipantId }));
  }, [room, me, screen, onlineRoomId, onlineParticipantId]);

  useEffect(() => {
    if (screen !== "game") return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (!room || !current || room.status !== "answering" || remaining > 0) return;
    if (supabase && onlineRoomId && isHost && current.id) { void revealOnlineRound(supabase, onlineRoomId, current.id).catch((error) => console.error("[ROUND] Reveal failed", error)); return; }
    setRoom((previous) => previous ? { ...previous, status: "revealing", rounds: previous.rounds.map((round, index) => index === previous.currentRound - 1 ? { ...round, status: "revealing" } : round) } : previous);
  }, [remaining, current, room, supabase, onlineRoomId, isHost]);

  useEffect(() => { if (room?.status === "revealing") setScreen("game"); }, [room?.status]);

  function startCreate() { setNickname(""); setScreen("create"); }
  async function createRoom() {
    const clean = nickname.trim().slice(0, 20);
    if (!clean) return setNotice("Escribe un nickname para continuar.");
    if (supabase) {
      try {
        await ensureAnonymousSession(supabase);
        const created = await createOnlineRoom(supabase, clean, seconds === 0 ? customSeconds : seconds, roundCount, category);
        setOnlineRoomId(created.roomId); setOnlineParticipantId(created.participantId); setNickname(clean); setNotice(""); return;
      } catch (error) { console.error("[ROOM] Create failed", error); return setNotice(error instanceof Error ? String(error) : "No se pudo crear la sala."); }
    }
    const host = newPlayer(clean, true);
    const created = roomFor(host, seconds === 0 ? customSeconds : seconds, roundCount, category);
    setMe(host); setRoom(created); setNotice(""); setScreen("lobby");
  }
  function openJoin(code = "") { setJoinCode(code); setNickname(""); setScreen("join"); }
  async function joinRoom() {
    const clean = nickname.trim().slice(0, 20);
    if (!clean) return setNotice("Escribe un nickname para continuar.");
    if (!joinCode.trim()) return setNotice("Escribe el código de la sala.");
    if (supabase) {
      try {
        const joined = await joinOnlineRoom(supabase, joinCode.trim().toUpperCase(), clean);
        setOnlineRoomId(joined.roomId); setOnlineParticipantId(joined.participantId); setNickname(clean); setNotice(""); return;
      } catch (error) { console.error("[ROOM] Join failed", error); return setNotice(error instanceof Error ? String(error) : "No se pudo entrar a la sala."); }
    }
    const guest = newPlayer(clean);
    const joined: GameRoom = { code: joinCode.trim().toUpperCase(), hostId: "host-demo", players: [newPlayer("Jeanpiere", true), guest], seconds: 10, roundCount: 10, category: "Todas", status: "waiting", currentRound: 0, rounds: [] };
    setMe(guest); setRoom(joined); setNotice(""); setScreen("lobby");
  }
  async function startGame() {
    if (!room || !isHost) return;
    if (supabase && onlineRoomId) { try { await startOnlineGame(supabase, onlineRoomId, room); return; } catch (error) { console.error("[ROOM] Start failed", error); setNotice("No se pudo iniciar la partida."); return; } }
    const qs = pickQuestions(room.category, room.roundCount);
    const round: Round = { number: 1, question: qs[0], status: "answering", startedAt: Date.now(), endsAt: Date.now() + room.seconds * 1000, answers: {} };
    setRoom({ ...room, status: "answering", currentRound: 1, rounds: [round] }); setNow(Date.now()); setScreen("game");
  }
  async function saveAnswer() {
    if (!room || !me || !current || remaining <= 0 || room.status !== "answering") return;
    const text = answer.trim().slice(0, 300);
    if (supabase && onlineRoomId && current?.id) { try { await submitOnlineAnswer(supabase, onlineRoomId, current.id, me.id, text); } catch (error) { console.error("[ANSWER] Submit failed", error); setNotice("No se pudo guardar la respuesta."); return; } }
    setRoom({ ...room, rounds: room.rounds.map((round, index) => index === room.currentRound - 1 ? { ...round, answers: { ...round.answers, [me.id]: text } } : round) });
    setNotice("Respuesta guardada"); window.setTimeout(() => setNotice(""), 1800);
  }
  async function nextRound() {
    if (!room || !isHost) return;
    if (supabase && onlineRoomId) { try { await nextOnlineRound(supabase, onlineRoomId, room); return; } catch (error) { console.error("[ROOM] Next round failed", error); setNotice("No se pudo avanzar."); return; } }
    if (room.currentRound >= room.roundCount) { setRoom({ ...room, status: "finished" }); setScreen("finished"); return; }
    const next = room.currentRound + 1;
    const used = new Set(room.rounds.map((round) => round.question.id));
    const q = pickQuestions(room.category, room.roundCount * 2).find((question) => !used.has(question.id)) ?? pickQuestions(room.category, 1)[0];
    const round: Round = { number: next, question: q, status: "answering", startedAt: Date.now(), endsAt: Date.now() + room.seconds * 1000, answers: {} };
    setAnswer(""); setRoom({ ...room, status: "answering", currentRound: next, rounds: [...room.rounds, round] }); setNow(Date.now());
  }
  function copy(value: string, message: string) { navigator.clipboard?.writeText(value); setNotice(message); window.setTimeout(() => setNotice(""), 1600); }
  function reset() { localStorage.removeItem(key); setRoom(null); setMe(null); setAnswer(""); setScreen("home"); }

  if (screen === "home") return <Shell><Home onCreate={startCreate} onJoin={() => openJoin()} /></Shell>;
  if (screen === "create") return <Shell><FormPage title="Crear sala" subtitle="Tú serás el host. Invita a tu gente cuando tengas el código." back={() => setScreen("home")}><Nickname value={nickname} onChange={setNickname} /><Config seconds={seconds} setSeconds={setSeconds} customSeconds={customSeconds} setCustomSeconds={setCustomSeconds} roundCount={roundCount} setRoundCount={setRoundCount} category={category} setCategory={setCategory} /><Action onClick={createRoom} label="Crear sala" icon={<Zap size={18} />} /><Error text={notice} /></FormPage></Shell>;
  if (screen === "join") return <Shell><FormPage title="Unirse a sala" subtitle="Entra con el código que te pasó tu amigo." back={() => setScreen("home")}><label className="label">Código de sala<input className="input code-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 5))} placeholder="K7P4Q" maxLength={5} /></label><Nickname value={nickname} onChange={setNickname} /><Action onClick={joinRoom} label="Entrar a la sala" icon={<ArrowLeft size={18} className="rotate-180" />} /><Error text={notice} /></FormPage></Shell>;
  if (!room || !me) return null;
  if (screen === "lobby") return <Shell><Lobby room={room} me={me} isHost={isHost} onStart={startGame} onCopyCode={() => copy(room.code, "Código copiado")} onCopyLink={() => copy(`${window.location.origin}/room/${room.code}`, "Link copiado")} onBack={reset} /></Shell>;
  if (screen === "finished") return <Shell><Finished room={room} onAgain={() => { setScreen("lobby"); setRoom({ ...room, status: "waiting", currentRound: 0, rounds: [] }); }} onNew={reset} /></Shell>;
  return <Shell><Game room={room} me={me} current={current!} remaining={remaining} answer={answer || myAnswer} setAnswer={setAnswer} onSave={saveAnswer} onNext={nextRound} isHost={isHost} onLeave={reset} notice={notice} /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <main className="grain min-h-screen"><div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8">{children}</div></main>; }
function Home({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) { return <div className="flex flex-1 flex-col justify-between py-6 sm:py-12"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lime text-black"><Zap size={20} fill="currentColor" /></div><span className="text-xs font-bold uppercase tracking-[.2em] text-muted">Arena / 01</span></div><span className="rounded-full border border-line px-3 py-1 text-[10px] uppercase tracking-[.18em] text-muted">sin registro</span></div><div className="max-w-xl py-20 sm:py-28"><p className="mb-5 text-sm font-bold uppercase tracking-[.22em] text-lime">Responde bajo presión</p><h1 className="text-6xl font-black leading-[.86] tracking-[-.07em] sm:text-8xl">SHIT<br /><span className="text-lime">TEST</span><br />ARENA<span className="text-coral">.</span></h1><p className="mt-8 max-w-sm text-lg leading-relaxed text-muted">El mismo reto. Diez segundos. Cero filtros. Compáralo después con tus amigos.</p></div><div className="grid gap-3 sm:max-w-md sm:grid-cols-2"><button className="btn-primary" onClick={onCreate}>Crear sala <ArrowLeft size={18} className="rotate-180" /></button><button className="btn-secondary" onClick={onJoin}>Unirse <Users size={18} /></button></div><p className="mt-6 text-center text-xs text-muted sm:max-w-md">Juega desde cualquier dispositivo · gratis · sin cuentas</p></div>; }
function FormPage({ title, subtitle, back, children }: { title: string; subtitle: string; back: () => void; children: React.ReactNode }) { return <div className="mx-auto w-full max-w-xl py-4 sm:py-10"><button className="mb-12 flex items-center gap-2 text-sm text-muted hover:text-ink" onClick={back}><ArrowLeft size={16} /> Volver</button><p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-lime">Configura tu partida</p><h1 className="text-4xl font-black tracking-tight sm:text-5xl">{title}</h1><p className="mt-3 text-muted">{subtitle}</p><div className="mt-10 space-y-8">{children}</div></div>; }
function Nickname({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <label className="label">Nickname<input className="input" value={value} onChange={(e) => onChange(e.target.value.slice(0, 20))} placeholder="Jeanpiere" maxLength={20} autoFocus /></label>; }
function Config({ seconds, setSeconds, customSeconds, setCustomSeconds, roundCount, setRoundCount, category, setCategory }: { seconds: number; setSeconds: (n: number) => void; customSeconds: number; setCustomSeconds: (n: number) => void; roundCount: number; setRoundCount: (n: number) => void; category: Category; setCategory: (c: Category) => void }) { return <div className="space-y-8"><div><div className="mb-3 flex justify-between"><span className="label-title">Tiempo por respuesta</span><span className="text-sm text-lime">{seconds === 0 ? customSeconds : seconds}s</span></div><div className="grid grid-cols-5 gap-2">{secondsOptions.map((n) => <button key={n} className={`choice ${seconds === n ? "choice-active" : ""}`} onClick={() => setSeconds(n)}>{n}s</button>)}</div><div className="mt-3 flex items-center gap-3"><button className={`choice flex-1 ${seconds === 0 ? "choice-active" : ""}`} onClick={() => setSeconds(0)}>Personalizado</button>{seconds === 0 && <input className="input w-24 py-3 text-center" type="number" min={5} max={60} value={customSeconds} onChange={(e) => setCustomSeconds(Math.max(5, Math.min(60, Number(e.target.value))))} />}</div></div><div><span className="label-title">Cantidad de rondas</span><div className="mt-3 grid grid-cols-4 gap-2">{roundsOptions.map((n) => <button key={n} className={`choice ${roundCount === n ? "choice-active" : ""}`} onClick={() => setRoundCount(n)}>{n}</button>)}</div></div><div><span className="label-title">Categoría</span><div className="mt-3 flex flex-wrap gap-2">{categories.map((c) => <button key={c} className={`choice ${category === c ? "choice-active" : ""}`} onClick={() => setCategory(c)}>{c}</button>)}</div></div></div>; }
function Action({ onClick, label, icon }: { onClick: () => void; label: string; icon: React.ReactNode }) { return <button className="btn-primary w-full" onClick={onClick}>{label}{icon}</button>; }
function Error({ text }: { text: string }) { return text ? <p className="text-sm text-coral">{text}</p> : null; }

function Lobby({ room, me, isHost, onStart, onCopyCode, onCopyLink, onBack }: { room: GameRoom; me: Player; isHost: boolean; onStart: () => void; onCopyCode: () => void; onCopyLink: () => void; onBack: () => void }) { return <div className="mx-auto w-full max-w-2xl py-4 sm:py-10"><div className="flex items-center justify-between"><button className="flex items-center gap-2 text-sm text-muted" onClick={onBack}><ArrowLeft size={16} /> Salir</button><span className="flex items-center gap-2 text-xs uppercase tracking-[.15em] text-lime"><span className="h-2 w-2 animate-pulse rounded-full bg-lime" /> sala activa</span></div><div className="mt-14 flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-muted">Sala</p><h1 className="mt-2 text-6xl font-black tracking-[-.06em]">{room.code}</h1></div><div className="flex gap-2"><button className="icon-btn" onClick={onCopyCode} title="Copiar código"><Copy size={17} /></button><button className="icon-btn" onClick={onCopyLink} title="Copiar link"><LinkIcon size={17} /></button></div></div><div className="mt-10 rounded-3xl border border-line bg-panel p-5 sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-[.16em]">Jugadores <span className="text-muted">({room.players.length})</span></h2><Users size={18} className="text-muted" /></div><div className="space-y-3">{room.players.map((player) => <div key={player.id} className="flex items-center justify-between rounded-2xl bg-[#20212a] px-4 py-4"><span className="flex items-center gap-3 font-semibold">{player.isHost ? <Crown size={18} className="text-lime" fill="currentColor" /> : <span className="h-2 w-2 rounded-full bg-lime" />}{player.nickname}{player.id === me.id && <span className="text-xs font-normal text-muted">(tú)</span>}</span><span className="text-xs text-muted">{player.isHost ? "HOST" : "LISTO"}</span></div>)}</div><div className="my-7 border-t border-line" /><div className="grid gap-3 text-sm text-muted sm:grid-cols-3"><span>{room.seconds}s por respuesta</span><span>{room.roundCount} rondas</span><span>{room.category}</span></div></div><div className="mt-5">{isHost ? <Action onClick={onStart} label="Comenzar partida" icon={<Play size={18} fill="currentColor" />} /> : <div className="flex items-center justify-center gap-2 rounded-2xl border border-line py-4 text-sm text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-coral" /> Esperando al host...</div>}</div><p className="mt-5 text-center text-xs text-muted">Comparte el código o el link con tus amigos.</p></div>; }

function Game({ room, me, current, remaining, answer, setAnswer, onSave, onNext, isHost, onLeave, notice }: { room: GameRoom; me: Player; current: Round; remaining: number; answer: string; setAnswer: (s: string) => void; onSave: () => void; onNext: () => void; isHost: boolean; onLeave: () => void; notice: string }) { const urgent = remaining <= 5; const revealed = room.status === "revealing"; return <div className="mx-auto w-full max-w-3xl py-3 sm:py-8"><div className="flex items-center justify-between"><button className="flex items-center gap-2 text-sm text-muted" onClick={onLeave}><ArrowLeft size={16} /> Salir</button><span className="text-xs font-bold uppercase tracking-[.18em] text-muted">Ronda {current.number} <span className="text-line">/</span> {room.roundCount}</span><span className="flex items-center gap-2 text-xs text-muted"><LockKeyhole size={14} /> respuestas ocultas</span></div><div className={`mt-12 text-center sm:mt-16 ${urgent ? "text-coral" : "text-lime"}`}><div className={`timer-glow text-[7rem] font-black leading-none tracking-[-.09em] sm:text-[10rem] ${urgent && remaining > 0 ? "animate-pulse" : ""}`}>{revealed ? "0" : remaining}</div><p className="mt-2 text-xs font-bold uppercase tracking-[.3em]">{revealed ? "tiempo · revelando" : remaining === 0 ? "tiempo" : "segundos"}</p></div><div className="mx-auto mt-12 max-w-2xl text-center sm:mt-16"><p className="text-xs font-bold uppercase tracking-[.25em] text-muted">Shit test</p><h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">“{current.question.text}”</h1></div>{!revealed ? <div className="mx-auto mt-12 max-w-2xl sm:mt-16"><label className="label"><span>¿Qué responderías?</span><textarea className="textarea" value={answer} onChange={(e) => setAnswer(e.target.value.slice(0, 300))} disabled={remaining === 0} placeholder="Escribe tu mejor respuesta..." maxLength={300} rows={4} /></label><div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted">{answer.length}/300</span><button className="btn-primary px-5 py-3" onClick={onSave} disabled={remaining === 0}><Send size={17} /> Guardar respuesta</button></div>{notice && <p className="mt-4 flex items-center gap-2 text-sm text-lime"><Check size={16} /> {notice}</p>}<div className="mt-10 rounded-2xl border border-line bg-panel p-4"><p className="mb-3 text-xs font-bold uppercase tracking-[.15em] text-muted">Estado de jugadores</p><div className="flex flex-wrap gap-2">{room.players.map((player) => <span key={player.id} className="rounded-full bg-[#20212a] px-3 py-2 text-xs text-muted">{player.nickname} {current.answers[player.id] ? "✓" : "…"}</span>)}</div></div></div> : <Reveal room={room} current={current} isHost={isHost} onNext={onNext} />}</div>; }
function Reveal({ room, current, isHost, onNext }: { room: GameRoom; current: Round; isHost: boolean; onNext: () => void }) { return <div className="mx-auto mt-12 max-w-2xl sm:mt-16"><div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-lime"><Sparkles size={15} /> Respuestas de la ronda</div><div className="space-y-3">{room.players.map((player) => <div key={player.id} className="rounded-2xl border border-line bg-panel p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-muted">{player.nickname} puso</p><p className="mt-3 text-lg leading-relaxed">{current.answers[player.id] ? `“${current.answers[player.id]}”` : <span className="text-muted">No respondió</span>}</p></div>)}</div><div className="mt-5">{isHost ? <Action onClick={onNext} label={current.number >= room.roundCount ? "Ver resultados finales" : "Siguiente shit test"} icon={<ArrowLeft size={18} className="rotate-180" />} /> : <div className="flex items-center justify-center gap-2 rounded-2xl border border-line py-4 text-sm text-muted"><RefreshCw size={15} className="animate-spin" /> Esperando al host...</div>}</div></div>; }

function Finished({ room, onAgain, onNew }: { room: GameRoom; onAgain: () => void; onNew: () => void }) { return <div className="mx-auto w-full max-w-3xl py-6 sm:py-14"><div className="mb-12 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lime text-black"><Check size={21} strokeWidth={3} /></div><span className="text-xs font-bold uppercase tracking-[.2em] text-muted">Partida terminada</span></div><h1 className="max-w-xl text-5xl font-black leading-[.95] tracking-[-.06em] sm:text-7xl">Buen trabajo.<br /><span className="text-lime">Ahora comparen.</span></h1><div className="mt-12 space-y-8">{room.rounds.map((round) => <section key={round.number}><div className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-[.18em] text-muted"><span className="text-lime">0{round.number}</span><span className="h-px flex-1 bg-line" /></div><h2 className="mb-4 text-xl font-semibold">“{round.question.text}”</h2><div className="grid gap-3 sm:grid-cols-2">{room.players.map((player) => <div key={player.id} className="rounded-2xl border border-line bg-panel p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted">{player.nickname}</p><p className="mt-2 text-sm leading-relaxed">{round.answers[player.id] ? `“${round.answers[player.id]}”` : <span className="text-muted">Sin respuesta</span>}</p></div>)}</div></section>)}</div><div className="mt-12 grid gap-3 sm:max-w-lg sm:grid-cols-2"><button className="btn-primary" onClick={onAgain}>Jugar otra vez <RefreshCw size={18} /></button><button className="btn-secondary" onClick={onNew}>Nueva sala <Sparkles size={18} /></button></div></div>; }
