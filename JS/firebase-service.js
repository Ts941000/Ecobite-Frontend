// API Service to replace Firebase Client SDK
// Vercel uses same-origin /api. Local HTML/Live Server uses backend on :5000.
function cleanBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function getStoredApiBase() {
  try {
    return localStorage.getItem('ecobite-api-base') || '';
  } catch {
    return '';
  }
}

function resolveBaseUrl() {
  const override = typeof window !== 'undefined'
    ? (window.ECOBITE_API_BASE || getStoredApiBase())
    : '';
  if (override) return cleanBaseUrl(override);

  if (typeof window === 'undefined') return '';

  const { protocol, hostname, port } = window.location;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

  if (protocol === 'file:' || (isLocalHost && port && port !== '5000')) {
    return 'http://localhost:5000';
  }

  return '';
}

const BASE_URL = resolveBaseUrl();
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

async function readJsonResponse(res, fallbackMessage) {
  const text = await res.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error('Non-JSON response:', text);
      throw new Error(res.ok ? 'Invalid response format' : fallbackMessage);
    }
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || fallbackMessage);
  }

  return data;
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
  try {
    const res = await fetch(`${API_URL}/auth/profile`, { headers: getHeaders() });
    return await readJsonResponse(res, 'Could not load profile');
  } catch (error) {
    console.warn('Profile load failed:', error.message);
    return getLocalAuth();
  }
}
export async function writeUserProfile(uid, profile) {
  const res = await fetch(`${API_URL}/auth/profile`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(profile)
  });
  return readJsonResponse(res, 'Could not update profile');
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

export async function registerWithEmail({ email, password, name, phone, role, fssaiLicense }) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, role, phone, fssaiLicense })
  });
  const data = await readJsonResponse(res, 'Registration failed');
  return saveLocalAuth(data, data.token);
}

export async function loginWithEmail({ email, password, role }) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role })
  });
  const data = await readJsonResponse(res, 'Login failed');
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
  const res = await fetch(`${API_URL}/cart`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ items })
  });
  return readJsonResponse(res, 'Could not save cart');
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
  return readJsonResponse(res, 'Could not create order');
}

export async function listenOrders(callback) {
  // Since we don't have websockets, we simulate it with an initial fetch
  try {
    const res = await fetch(`${API_URL}/orders`, { headers: getHeaders() });
    if (res.ok) callback(await res.json());
  } catch (error) {
    console.warn('Orders load failed:', error.message);
  }
  return () => {}; // return unsubscribe function
}

export async function listenOrdersByOwner(ownerId, callback) {
  listenOrders(callback);
}

export async function updateOrderStatus(orderId, status, extraData = {}) {
  const res = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status, ...extraData })
  });
  return readJsonResponse(res, 'Could not update order');
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
  const hasId = Boolean(listing.id);
  const url = hasId ? `${API_URL}/listings/${encodeURIComponent(listing.id)}` : `${API_URL}/listings`;
  const res = await fetch(url, {
    method: hasId ? 'PUT' : 'POST',
    headers: getHeaders(),
    body: JSON.stringify(listing)
  });
  return readJsonResponse(res, 'Could not save listing');
}

export async function deleteListing(id) {
  const res = await fetch(`${API_URL}/listings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  return readJsonResponse(res, 'Could not delete listing');
}

export async function deductInventory(listingId, quantity) {
  // Not implemented on backend yet
  console.log("Deduct inventory", listingId, quantity);
}

export async function uploadListingImage(file) {
  if (!file) return null;
  const formData = new FormData();
  formData.append('image', file);
  const token = localStorage.getItem(TOKEN_KEY);

  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });

  const data = await readJsonResponse(res, 'Upload failed');
  return `${BASE_URL}${data.imageUrl}`;
}

export function getLocalListings() { return []; }
export function saveLocalListings() { }
