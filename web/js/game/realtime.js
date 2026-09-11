import {
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { database } from '../firebase-config.js?v=2';

export {
  database,
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update
};

export const roomPath = (roomId) => `rooms/${roomId}`;
export const roomPlayersPath = (roomId) => `roomPlayers/${roomId}`;
export const roomAnswersPath = (roomId) => `roomAnswers/${roomId}`;
export const roomAnswerStatusPath = (roomId) => `roomAnswerStatus/${roomId}`;
