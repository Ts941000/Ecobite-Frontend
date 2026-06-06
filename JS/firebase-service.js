import { firebaseCollections, firebaseConfig } from "./firebase-config.js";

const SDK_VERSION = "10.12.5";
const AUTH_KEY = "ecobite-auth";
const CART_KEY = "ecobite-cart";
const LOCAL_ORDERS_KEY = "ecobite-orders";
const LOCAL_LISTINGS_KEY = "ecobite-dashboard-listings";

let firebaseApp = null;
let auth = null;
let db = null;
let storage = null;
let sdk = null;
let initPromise = null;

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.startsWith("PASTE_") &&
    !firebaseConfig.projectId.startsWith("PASTE_")
  );
}

export function getBackendMode() {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function localUserFromProfile(profile) {
  if (!profile) return null;
  return {
    loggedIn: true,
    uid: profile.uid || `local-${profile.email || Date.now()}`,
    email: profile.email || "",
    name: profile.name || profile.displayName || (profile.email || "User").split("@")[0],
    phone: profile.phone || "",
    role: profile.role || "user",
    provider: profile.provider || "local",
    photoURL: profile.photoURL || "",
    timestamp: Date.now(),
  };
}

export function saveLocalAuth(profile) {
  const authState = localUserFromProfile(profile);
  writeJson(AUTH_KEY, authState);
  return authState;
}

export function getLocalAuth() {
  return readJson(AUTH_KEY, null);
}

export function clearLocalAuth() {
  localStorage.removeItem(AUTH_KEY);
}

async function loadFirebase() {
  if (!isFirebaseConfigured()) return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const [appModule, authModule, firestoreModule, storageModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-storage.js`),
    ]);

    firebaseApp = appModule.getApps().length
      ? appModule.getApps()[0]
      : appModule.initializeApp(firebaseConfig);

    auth = authModule.getAuth(firebaseApp);
    db = firestoreModule.getFirestore(firebaseApp);
    storage = storageModule.getStorage(firebaseApp);
    await authModule.setPersistence(auth, authModule.browserLocalPersistence);

    sdk = { appModule, authModule, firestoreModule, storageModule };
    return { firebaseApp, auth, db, storage, sdk };
  })();

  return initPromise;
}

export async function initFirebase() {
  try {
    return await loadFirebase();
  } catch (error) {
    console.error("Firebase init failed:", error);
    return null;
  }
}

function mapFirebaseUser(user, profile = {}) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || profile.email || "",
    name: profile.name || user.displayName || (user.email || "User").split("@")[0],
    phone: profile.phone || user.phoneNumber || "",
    role: profile.role || "user",
    provider: user.providerData?.[0]?.providerId || "password",
    photoURL: user.photoURL || profile.photoURL || "",
  };
}

async function readUserProfile(uid) {
  await initFirebase();
  if (!db || !uid) return null;
  const { doc, getDoc } = sdk.firestoreModule;
  const snap = await getDoc(doc(db, firebaseCollections.users, uid));
  return snap.exists() ? snap.data() : null;
}

async function writeUserProfile(uid, profile) {
  await initFirebase();
  if (!db || !uid) return;
  const { doc, serverTimestamp, setDoc } = sdk.firestoreModule;
  await setDoc(
    doc(db, firebaseCollections.users, uid),
    {
      ...profile,
      uid,
      updatedAt: serverTimestamp(),
      createdAt: profile.createdAt || serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getSignedInUser() {
  if (!isFirebaseConfigured()) return getLocalAuth();
  const loaded = await initFirebase();
  if (!loaded?.auth) return getLocalAuth();

  const user = await new Promise((resolve) => {
    const unsubscribe = sdk.authModule.onAuthStateChanged(auth, (nextUser) => {
      unsubscribe();
      resolve(nextUser);
    });
  });

  if (!user) {
    clearLocalAuth();
    return null;
  }

  const profile = await readUserProfile(user.uid);
  const authState = saveLocalAuth(mapFirebaseUser(user, profile || {}));
  return authState;
}

export async function requireAuth(redirectTo = "login.html", allowedRoles = []) {
  const user = await getSignedInUser();
  const allowed = !allowedRoles.length || allowedRoles.includes(user?.role);
  if (!user || !allowed) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

export async function registerWithEmail({ email, password, name, phone, role, ...extraFields }) {
  if (!isFirebaseConfigured()) {
    return saveLocalAuth({ email, name, phone, role, provider: "demo", ...extraFields });
  }

  await initFirebase();
  const { createUserWithEmailAndPassword, updateProfile } = sdk.authModule;
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  const profile = mapFirebaseUser(credential.user, { name, phone, role });
  await writeUserProfile(credential.user.uid, { ...profile, ...extraFields });
  return saveLocalAuth(profile);
}

export async function loginWithEmail({ email, password, role }) {
  if (!isFirebaseConfigured()) {
    return saveLocalAuth({ email, name: email.split("@")[0], role, provider: "demo" });
  }

  await initFirebase();
  const { signInWithEmailAndPassword } = sdk.authModule;
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const existingProfile = await readUserProfile(credential.user.uid);
  const profile = mapFirebaseUser(credential.user, { ...(existingProfile || {}), role: existingProfile?.role || role });
  if (!existingProfile) await writeUserProfile(credential.user.uid, profile);
  return saveLocalAuth(profile);
}

export async function loginWithGoogle(role = "user") {
  if (!isFirebaseConfigured()) {
    return saveLocalAuth({
      email: "demo.user@ecobite.local",
      name: role === "hotel" ? "Demo Hotel Partner" : "Demo User",
      role,
      provider: "demo-google",
    });
  }

  await initFirebase();
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } = sdk.authModule;
  const provider = new GoogleAuthProvider();
  let credential;
  try {
    credential = await signInWithPopup(auth, provider);
  } catch (popupError) {
    // If popup blocked or fails, try redirect flow
    if (popupError?.code === "auth/popup-blocked" || popupError?.code === "auth/cancelled-popup-request") {
      await signInWithRedirect(auth, provider);
      return getLocalAuth(); // Will resolve on redirect callback
    }
    throw popupError;
  }
  const existingProfile = await readUserProfile(credential.user.uid);
  const profile = mapFirebaseUser(credential.user, { ...(existingProfile || {}), role: existingProfile?.role || role });
  await writeUserProfile(credential.user.uid, profile);
  return saveLocalAuth(profile);
}

export async function logoutUser() {
  if (isFirebaseConfigured()) {
    await initFirebase();
    if (auth) await sdk.authModule.signOut(auth);
  }
  clearLocalAuth();
}

export function getLocalCart() {
  return readJson(CART_KEY, []);
}

export async function loadCart() {
  const user = await getSignedInUser();
  if (!isFirebaseConfigured() || !user?.uid) return getLocalCart();

  await initFirebase();
  const { doc, getDoc } = sdk.firestoreModule;
  const snap = await getDoc(doc(db, firebaseCollections.carts, user.uid));
  const cloudItems = snap.exists() ? snap.data().items || [] : [];
  // Always trust cloud cart for logged-in users; write to local cache
  writeJson(CART_KEY, cloudItems);
  return cloudItems;
}

export async function saveCart(items) {
  writeJson(CART_KEY, items);
  const user = await getSignedInUser();
  if (!isFirebaseConfigured() || !user?.uid) return;

  await initFirebase();
  const { doc, serverTimestamp, setDoc } = sdk.firestoreModule;
  await setDoc(
    doc(db, firebaseCollections.carts, user.uid),
    { items, userId: user.uid, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export function clearCart() {
  writeJson(CART_KEY, []);
}

export function clearLocalCart() {
  localStorage.removeItem(CART_KEY);
}

function localOrderId() {
  return `EB${String(Date.now()).slice(-8)}`;
}

export async function createOrder(order) {
  const user = await getSignedInUser();
  const orderPayload = {
    ...order,
    id: localOrderId(),
    userId: user?.uid || "demo-user",
    userEmail: user?.email || order.customer?.email || "",
    status: "pending",
    createdAtMs: Date.now(),
  };

  if (!isFirebaseConfigured()) {
    const orders = readJson(LOCAL_ORDERS_KEY, []);
    orders.unshift(orderPayload);
    writeJson(LOCAL_ORDERS_KEY, orders);
    await saveCart([]);
    return orderPayload;
  }

  await initFirebase();
  const { addDoc, collection, doc, serverTimestamp, setDoc } = sdk.firestoreModule;
  const ref = await addDoc(collection(db, firebaseCollections.orders), {
    ...orderPayload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, firebaseCollections.carts, user.uid), { items: [], updatedAt: serverTimestamp() }, { merge: true });
  clearCart();

  // Deduct inventory for each ordered item
  if (order.items && order.items.length) {
    for (const item of order.items) {
      if (item.id) {
        try {
          await deductInventory(item.id, item.qty || 1);
        } catch (e) {
          console.warn("Inventory deduction failed for", item.id, e);
        }
      }
    }
  }

  return { ...orderPayload, id: ref.id };
}

export function getLocalListings(fallback = []) {
  return readJson(LOCAL_LISTINGS_KEY, fallback);
}

export function saveLocalListings(listings) {
  writeJson(LOCAL_LISTINGS_KEY, listings);
}

function normalizeListing(docId, data) {
  return {
    id: docId || data.id || Date.now(),
    image: data.image || data.imageUrl || "FOOD IMAGES/dm.jpg.jpeg",
    name: data.name || "Untitled Dish",
    hotel: data.hotel || data.hotelName || "EcoBite Partner",
    place: data.place || data.location || "India",
    city: data.city || "All",
    original: Number(data.original || data.originalPrice || 0),
    sale: Number(data.sale || data.salePrice || 0),
    qty: Number(data.qty || data.quantity || 0),
    time: data.time || data.deliveryWindow || "30-40 min",
    type: data.type || "Veg",
    status: data.status || (Number(data.qty || data.quantity || 0) > 0 ? "active" : "soldout"),
    stars: Number(data.stars || 4.6),
    description: data.description || "",
    ownerId: data.ownerId || "",
  };
}

export async function getListings(fallback = []) {
  if (!isFirebaseConfigured()) return getLocalListings(fallback);

  await initFirebase();
  const { collection, getDocs, orderBy, query } = sdk.firestoreModule;
  const snap = await getDocs(query(collection(db, firebaseCollections.listings), orderBy("createdAtMs", "desc")));
  const listings = snap.docs.map((entry) => normalizeListing(entry.id, entry.data()));
  return listings.length ? listings : fallback;
}

export async function listenListings(callback, fallback = []) {
  if (!isFirebaseConfigured()) {
    callback(getLocalListings(fallback));
    return () => {};
  }

  await initFirebase();
  const { collection, onSnapshot, orderBy, query } = sdk.firestoreModule;
  return onSnapshot(
    query(collection(db, firebaseCollections.listings), orderBy("createdAtMs", "desc")),
    (snap) => callback(snap.docs.map((entry) => normalizeListing(entry.id, entry.data()))),
    (error) => {
      console.error("Listing subscription failed:", error);
      callback(fallback);
    }
  );
}

export async function saveListing(listing) {
  const user = await getSignedInUser();
  const payload = normalizeListing(listing.id, {
    ...listing,
    ownerId: user?.uid || "demo-owner",
    hotelName: listing.hotel || "EcoBite Partner",
  });

  if (!isFirebaseConfigured()) {
    const listings = getLocalListings([]);
    const index = listings.findIndex((item) => String(item.id) === String(payload.id));
    if (index >= 0) listings[index] = payload;
    else listings.unshift({ ...payload, id: Date.now() });
    saveLocalListings(listings);
    return payload;
  }

  await initFirebase();
  const { addDoc, collection, doc, serverTimestamp, setDoc } = sdk.firestoreModule;
  const data = {
    ...payload,
    createdAtMs: listing.createdAtMs || Date.now(),
    updatedAt: serverTimestamp(),
  };

  if (listing.id && String(listing.id).length > 12) {
    await setDoc(doc(db, firebaseCollections.listings, String(listing.id)), data, { merge: true });
    return payload;
  }

  const ref = await addDoc(collection(db, firebaseCollections.listings), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return { ...payload, id: ref.id };
}

export async function deleteListing(id) {
  if (!isFirebaseConfigured()) {
    saveLocalListings(getLocalListings([]).filter((item) => String(item.id) !== String(id)));
    return;
  }

  await initFirebase();
  const { deleteDoc, doc } = sdk.firestoreModule;
  await deleteDoc(doc(db, firebaseCollections.listings, String(id)));
}

export async function listenOrders(callback) {
  if (!isFirebaseConfigured()) {
    callback(readJson(LOCAL_ORDERS_KEY, []));
    return () => {};
  }

  await initFirebase();
  const { collection, onSnapshot, orderBy, query } = sdk.firestoreModule;
  return onSnapshot(
    query(collection(db, firebaseCollections.orders), orderBy("createdAtMs", "desc")),
    (snap) => callback(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
    (error) => {
      console.error("Order subscription failed:", error);
      callback([]);
    }
  );
}

export async function updateOrderStatus(orderId, status, extraData = {}) {
  if (!isFirebaseConfigured()) {
    const orders = readJson(LOCAL_ORDERS_KEY, []);
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx >= 0) {
      orders[idx] = { ...orders[idx], status, ...extraData };
      writeJson(LOCAL_ORDERS_KEY, orders);
    }
    return;
  }

  await initFirebase();
  const { doc, serverTimestamp, updateDoc } = sdk.firestoreModule;
  await updateDoc(doc(db, firebaseCollections.orders, orderId), {
    status,
    ...extraData,
    updatedAt: serverTimestamp(),
  });
}

export async function deductInventory(listingId, quantity) {
  if (!isFirebaseConfigured()) {
    const listings = getLocalListings([]);
    const item = listings.find((l) => String(l.id) === String(listingId));
    if (item) {
      item.qty = Math.max(0, item.qty - quantity);
      item.status = item.qty > 0 ? "active" : "soldout";
      saveLocalListings(listings);
    }
    return;
  }

  await initFirebase();
  const { doc, increment, updateDoc } = sdk.firestoreModule;
  await updateDoc(doc(db, firebaseCollections.listings, String(listingId)), {
    qty: increment(-quantity),
  });
}

export async function uploadListingImage(file) {
  if (!isFirebaseConfigured() || !file) return null;
  await initFirebase();
  const user = await getSignedInUser();
  try {
    const { getDownloadURL, ref, uploadBytes } = sdk.storageModule;
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
    const path = `listing-images/${user?.uid || "public"}/${Date.now()}-${safeName}`;
    const snapshot = await uploadBytes(ref(storage, path), file);
    return getDownloadURL(snapshot.ref);
  } catch (error) {
    console.warn("Firebase Storage upload failed, falling back to base64:", error);
    // Fallback: compress and convert to base64 data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 500;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
        img.onerror = () => resolve(null);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
}
