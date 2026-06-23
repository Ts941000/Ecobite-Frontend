// API Service to replace Firebase Client SDK
// Change BASE_URL to your deployed backend URL when deploying to Render (e.g., 'https://your-backend.onrender.com')
const BASE_URL = 'https://ecobite-frontend-a01t.onrender.com';
const API_URL = `${BASE_URL}/api`;
const AUTH_KEY = 'ecobite-auth';
const TOKEN_KEY = 'ecobite-token';

function getHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// ---------------- AUTH ----------------
export function isFirebaseConfigured() { return true; } // For legacy compatibility
export function getBackendMode() { return 'express'; }

export function saveLocalAuth(profile, token) {
  const authData = { ...profile, loggedIn: true };
  localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
  if (token) localStorage.setItem(TOKEN_KEY, token);
  return authData;
}

export function getLocalAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY)) || null;
  } catch {
    return null;
  }
}

export function clearLocalAuth() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export async function initFirebase() { return true; } // Dummy
export async function readUserProfile(uid) {
  const res = await fetch(`${API_URL}/auth/profile`, { headers: getHeaders() });
  if (!res.ok) return getLocalAuth();
  return res.json();
}
export async function writeUserProfile(uid, profile) {
  await fetch(`${API_URL}/auth/profile`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(profile)
  });
}

export async function getSignedInUser() {
  return getLocalAuth();
}

export async function requireAuth(redirectTo = "login.html", allowedRoles = []) {
  const user = getLocalAuth();
  const allowed = !allowedRoles.length || allowedRoles.includes(user?.role);
  if (!user || !allowed) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

export async function registerWithEmail({ email, password, name, phone, role }) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, role, phone })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Registration failed");
  return saveLocalAuth(data, data.token);
}

export async function loginWithEmail({ email, password, role }) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Login failed");
  return saveLocalAuth(data, data.token);
}

export async function loginWithGoogle() {
  throw new Error("Google Login is disabled. Please use email/password.");
}

export async function logoutUser() {
  clearLocalAuth();
}

// ---------------- CART ----------------
export function getLocalCart() { return []; }

export async function loadCart() {
  const user = getLocalAuth();
  if (!user) return [];
  const res = await fetch(`${API_URL}/cart`, { headers: getHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function saveCart(items) {
  await fetch(`${API_URL}/cart`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ items })
  });
}

export function clearCart() { saveCart([]); }
export function clearLocalCart() { }

// ---------------- ORDERS ----------------
export async function createOrder(order) {
  const res = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(order)
  });
  return res.json();
}

export async function listenOrders(callback) {
  // Since we don't have websockets, we simulate it with an initial fetch
  const res = await fetch(`${API_URL}/orders`, { headers: getHeaders() });
  if (res.ok) callback(await res.json());
  return () => {}; // return unsubscribe function
}

export async function listenOrdersByOwner(ownerId, callback) {
  listenOrders(callback);
}

export async function updateOrderStatus(orderId, status, extraData = {}) {
  await fetch(`${API_URL}/orders/${orderId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status, ...extraData })
  });
}

// ---------------- LISTINGS ----------------
export async function getListings() {
  const res = await fetch(`${API_URL}/listings`);
  if (!res.ok) return [];
  return res.json();
}

export async function listenListings(callback) {
  const data = await getListings();
  callback(data);
  return () => {};
}

export async function listenListingsByOwner(ownerId, callback) {
  const data = await getListings();
  callback(data.filter(item => item.ownerId === ownerId || item.sellerId === ownerId));
  return () => {};
}

export async function saveListing(listing) {
  const res = await fetch(`${API_URL}/listings`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(listing)
  });
  return res.json();
}

export async function deleteListing(id) {
  // Not implemented on backend yet
  console.log("Delete listing", id);
}

export async function deductInventory(listingId, quantity) {
  // Not implemented on backend yet
  console.log("Deduct inventory", listingId, quantity);
}

export async function uploadListingImage(file) {
  if (!file) return null;
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`
    },
    body: formData
  });

  const data = await res.json();
  if (res.ok) {
    return `${BASE_URL}${data.imageUrl}`;
  }
  throw new Error("Upload failed");
}

export function getLocalListings() { return []; }
export function saveLocalListings() { }
