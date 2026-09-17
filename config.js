// ============================================================
// CONFIG — paste your Apps Script Web App URL here.
// This is the ONLY line you need to edit to connect the app
// to your own Google Sheet backend.
// ============================================================

const API_URL = "https://script.google.com/macros/s/AKfycbxlvZTzEQeAmWakFWlz5GVAb-ZyIwcbhYlZRANNVJQpEN1fF3Nvx9nmiA64vzuRazyJRw/exec";
// ============================================================
// FIREBASE — needed only for push notifications (Phase 8b).
// Paste values from Firebase console > Project settings.
// ============================================================
 
// From Project settings > General > Your apps > Web app config
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNTat69tmvnaDcLDEiuc0Va1nbkAZTDLs",
  authDomain: "habit-tracker-app-961b1.firebaseapp.com",
  projectId: "habit-tracker-app-961b1",
  storageBucket: "habit-tracker-app-961b1.firebasestorage.app",
  messagingSenderId: "516163918685",
  appId: "1:516163918685:web:96a837798a307923dea6b4",
};
 
// From Project settings > Cloud Messaging > Web Push certificates
// THIS is where the VAPID key goes — replace the text between the quotes:
const VAPID_KEY = "BEW9RRT7BIg812IKb21km0Itn81cuqGyCu-krAGOl22X_gcKE0HiEjuvuAjBfJUaaokgLYgnqlGRcm3cWQYh6ug";
 