import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyBiIfbrs7lqQl3Bn1uwpcHlx6Abja35aeg',
  authDomain: 'shit-test-3bf22.firebaseapp.com',
  databaseURL: 'https://shit-test-3bf22-default-rtdb.firebaseio.com',
  projectId: 'shit-test-3bf22',
  storageBucket: 'shit-test-3bf22.firebasestorage.app',
  messagingSenderId: '317278684294',
  appId: '1:317278684294:web:2d6d577acec9ba08e4bd07'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);
export const firestore = getFirestore(app);
