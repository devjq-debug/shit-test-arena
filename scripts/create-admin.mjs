import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const project = process.env.FIREBASE_PROJECT_ID || 'shit-test-3bf22';
const apiKey = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBiIfbrs7lqQl3Bn1uwpcHlx6Abja35aeg';
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Uso: node scripts/create-admin.mjs admin@email.com "ContraseñaSegura123!"');
  process.exit(1);
}

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function googleAccessToken() {
  if (config.tokens?.access_token && config.tokens?.expires_at > Date.now() + 60000) return config.tokens.access_token;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: config.tokens.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  if (!response.ok) throw new Error(`No se pudo obtener token del Firebase CLI: ${response.status}`);
  return (await response.json()).access_token;
}

async function createAuthUser() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const data = await response.json();
  if (!response.ok && data?.error?.message !== 'EMAIL_EXISTS') {
    throw new Error(`No se pudo crear usuario Auth: ${data?.error?.message || response.status}`);
  }
  if (data.localId) return data.localId;

  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const signInData = await signIn.json();
  if (!signIn.ok) throw new Error(`El usuario existe, pero no se pudo validar la contraseña: ${signInData?.error?.message || signIn.status}`);
  return signInData.localId;
}

const uid = await createAuthUser();
const token = await googleAccessToken();
const now = new Date().toISOString();
const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/admins/${uid}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    fields: {
      active: { booleanValue: true },
      email: { stringValue: email },
      createdAt: { timestampValue: now },
      updatedAt: { timestampValue: now }
    }
  })
});

if (!response.ok) throw new Error(`No se pudo crear admins/${uid}: ${response.status} ${await response.text()}`);
console.log(`Admin listo: ${email}`);
console.log(`UID: ${uid}`);
