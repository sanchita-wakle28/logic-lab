// firebase-config.js
// Initializes Firebase (Realtime Database + Anonymous Auth) using the
// modular v10 SDK loaded straight from Google's CDN — no build step needed.
// This file holds project *configuration*, not gameplay values: every
// question, domain, room code and score in this app is generated at
// runtime (see js/logic-engine.js and js/game.js).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getDatabase, ref, set, get, update, remove, push, onValue, onDisconnect, serverTimestamp, off
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

// Public client config for the "discrete-mathematics-ise-2" Firebase project.
// This is not a secret — Firebase web config is meant to be embedded in the
// client; access to the database is controlled separately by Database Rules
// (see README.md for the rules used by this project).
const firebaseConfig = {
  apiKey: "AIzaSyDCqQeH9HuW2qHekqfmGnOwFgBv1w7ycUs",
  authDomain: "discrete-mathematics-ise-2.firebaseapp.com",
  databaseURL: "https://discrete-mathematics-ise-2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "discrete-mathematics-ise-2",
  storageBucket: "discrete-mathematics-ise-2.firebasestorage.app",
  messagingSenderId: "856502405847",
  appId: "1:856502405847:web:6bf49b887892cfb80f3e92",
  measurementId: "G-1R06ZH8CV3"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

export {
  ref, set, get, update, remove, push, onValue, onDisconnect, serverTimestamp, off,
  signInAnonymously, onAuthStateChanged
};

// Resolves once we have an anonymous uid, signing in if necessary.
export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user.uid);
      }
    }, reject);
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(reject);
    }
  });
}
