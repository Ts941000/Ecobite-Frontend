const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

let serviceAccount;
let db;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // If running on Render/production with environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Local development fallback
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = require('./serviceAccountKey.json');
    } else {
      throw new Error("Missing Firebase credentials. Please provide FIREBASE_SERVICE_ACCOUNT env variable or serviceAccountKey.json file.");
    }
  }

  initializeApp({
    credential: cert(serviceAccount)
  });

  db = getFirestore();
} catch (error) {
  console.error("FIREBASE INITIALIZATION ERROR:", error.message);
  // Create a dummy db that throws an error ONLY when queried, to prevent server crash on boot
  db = new Proxy({}, {
    get: function() {
      throw new Error(`Firebase failed to initialize: ${error.message}`);
    }
  });
}

module.exports = { db };
