const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

let serviceAccount;

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

const db = getFirestore();

module.exports = { db };
