export type Category = "Todas" | "Bromas" | "Provocaciones" | "Presión social" | "Improvisación" | "Conversación" | "Seguridad" | "Difíciles";
export type RoomStatus = "waiting" | "answering" | "revealing" | "finished";

export type Question = { id: string; text: string; category: Exclude<Category, "Todas"> };
export type Player = { id: string; nickname: string; isHost: boolean; connected: boolean; };
export type Round = { id?: string; number: number; question: Question; status: "answering" | "revealing"; startedAt: number; endsAt: number; answers: Record<string, string>; };
export type GameRoom = { code: string; hostId: string; players: Player[]; seconds: number; roundCount: number; category: Category; status: RoomStatus; currentRound: number; rounds: Round[]; };
