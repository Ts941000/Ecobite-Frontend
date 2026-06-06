import { requireAuth, getSignedInUser, logoutUser } from './firebase-service.js';

// ── Auth Gate ──
const currentUser = await requireAuth('login.html', ['user']);
if (!currentUser) throw new Error('Not authenticated');

// ── Constants ──
const STORAGE_KEY = `ecobite-addresses-${currentUser.uid}`;

const DEFAULT_ADDRESSES = [
  {
    id: Date.now() - 2,
    label: 'Home',
    address: '42, Civil Lines, Near Gandhi Park',
    city: 'Etawah',
    pincode: '206001',
    isDefault: true,
  },
  {
    id: Date.now() - 1,
    label: 'Work',
    address: 'B-12, Connaught Place, Block B',
    city: 'New Delhi',
    pincode: '110001',
    isDefault: false,
  },
];

// ── Profile UI ──
const profileWrap = document.getElementById('profileWrap');
const profileBtn = document.getElementById('profileBtn');
const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profileBigAvatar = document.getElementById('profileBigAvatar');
const profileFullName = document.getElementById('profileFullName');
const profileEmail = document.getElementById('profileEmail');
const logoutBtn = document.getElementById('logoutBtn');

function initials(name) {
  return (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const uName = currentUser.name || currentUser.email?.split('@')[0] || 'User';
const uInitials = initials(uName);
const authData = JSON.parse(localStorage.getItem('ecobite-auth') || '{}');
if (authData.photoURL) {
  profileAvatar.innerHTML = `<img src="${authData.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  profileBigAvatar.innerHTML = `<img src="${authData.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
} else {
  profileAvatar.textContent = uInitials;
  profileBigAvatar.textContent = uInitials;
}
profileName.textContent = uName;
profileFullName.textContent = uName;
profileEmail.textContent = currentUser.email || '';
profileWrap.style.display = '';

profileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  profileWrap.classList.toggle('open');
});
document.addEventListener('click', () => profileWrap.classList.remove('open'));

logoutBtn.addEventListener('click', async () => {
  await logoutUser();
  window.location.href = 'login.html';
});

// ── Hamburger ──
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
hamburger?.addEventListener('click', () => mobileMenu.classList.toggle('open'));
document.querySelectorAll('#mobileMenu a').forEach(a =>
  a.addEventListener('click', () => mobileMenu.classList.remove('open'))
);

// ── Address Data ──
function loadAddresses() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  // First load — seed with defaults
  saveAddresses(DEFAULT_ADDRESSES);
  return DEFAULT_ADDRESSES;
}

function saveAddresses(addresses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
}

let addresses = loadAddresses();

// ── DOM References ──
const addressGrid = document.getElementById('addressGrid');
const formOverlay = document.getElementById('formOverlay');
const formModal = document.getElementById('formModal');
const formTitle = document.getElementById('formTitle');
const formClose = document.getElementById('formClose');
const formCancel = document.getElementById('formCancel');
const addressForm = document.getElementById('addressForm');
const addNewBtn = document.getElementById('addNewBtn');
const deleteOverlay = document.getElementById('deleteOverlay');
const deleteCancel = document.getElementById('deleteCancel');
const deleteConfirm = document.getElementById('deleteConfirm');

// Form fields
const addrLabel = document.getElementById('addrLabel');
const addrFull = document.getElementById('addrFull');
const addrCity = document.getElementById('addrCity');
const addrPincode = document.getElementById('addrPincode');

let editingId = null;
let deletingId = null;

// ── Label Helpers ──
function labelIcon(label) {
  const map = {
    Home: 'home',
    Work: 'work',
    Other: 'location_on',
  };
  return map[label] || 'location_on';
}

function labelClass(label) {
  return (label || 'other').toLowerCase();
}

// ── Render Addresses ──
function render() {
  if (!addresses.length) {
    addressGrid.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">location_off</span>
        <h3>No saved addresses</h3>
        <p>Add your first delivery address to get started</p>
      </div>`;
    return;
  }

  addressGrid.innerHTML = addresses.map((addr, i) => `
    <div class="address-card${addr.isDefault ? ' default' : ''}" data-id="${addr.id}" style="animation-delay: ${i * 0.06}s">
      <div class="addr-top">
        <div class="addr-label-icon ${labelClass(addr.label)}">
          <span class="material-symbols-rounded">${labelIcon(addr.label)}</span>
        </div>
        <div class="addr-label">${addr.label}</div>
      </div>
      <div class="addr-full">${addr.address}</div>
      <div class="addr-meta">
        <span>${addr.city}</span>
        <span>${addr.pincode}</span>
      </div>
      <div class="addr-actions">
        <button class="addr-btn edit" data-edit="${addr.id}">
          <span class="material-symbols-rounded">edit</span> Edit
        </button>
        <button class="addr-btn delete" data-delete="${addr.id}">
          <span class="material-symbols-rounded">delete</span> Delete
        </button>
      </div>
    </div>
  `).join('');

  // Attach edit/delete listeners
  addressGrid.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.edit));
  });
  addressGrid.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => openDeleteConfirm(btn.dataset.delete));
  });
}

// ── Form Modal ──
function openAddForm() {
  editingId = null;
  formTitle.textContent = 'Add New Address';
  addrLabel.value = 'Home';
  addrFull.value = '';
  addrCity.value = '';
  addrPincode.value = '';
  formOverlay.classList.add('open');
  addrFull.focus();
}

function openEditForm(id) {
  const addr = addresses.find(a => String(a.id) === String(id));
  if (!addr) return;
  editingId = addr.id;
  formTitle.textContent = 'Edit Address';
  addrLabel.value = addr.label;
  addrFull.value = addr.address;
  addrCity.value = addr.city;
  addrPincode.value = addr.pincode;
  formOverlay.classList.add('open');
  addrFull.focus();
}

function closeForm() {
  formOverlay.classList.remove('open');
  editingId = null;
}

addNewBtn.addEventListener('click', openAddForm);
formClose.addEventListener('click', closeForm);
formCancel.addEventListener('click', closeForm);
formOverlay.addEventListener('click', (e) => {
  if (e.target === formOverlay) closeForm();
});

addressForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const data = {
    label: addrLabel.value,
    address: addrFull.value.trim(),
    city: addrCity.value.trim(),
    pincode: addrPincode.value.trim(),
  };

  if (!data.address || !data.city || !data.pincode) return;

  if (editingId !== null) {
    // Update existing
    addresses = addresses.map(a =>
      String(a.id) === String(editingId)
        ? { ...a, ...data }
        : a
    );
  } else {
    // Add new
    addresses.push({
      ...data,
      id: Date.now(),
      isDefault: addresses.length === 0,
    });
  }

  saveAddresses(addresses);
  render();
  closeForm();
});

// ── Delete Confirm ──
function openDeleteConfirm(id) {
  deletingId = id;
  deleteOverlay.classList.add('open');
}

function closeDeleteConfirm() {
  deleteOverlay.classList.remove('open');
  deletingId = null;
}

deleteCancel.addEventListener('click', closeDeleteConfirm);
deleteOverlay.addEventListener('click', (e) => {
  if (e.target === deleteOverlay) closeDeleteConfirm();
});

deleteConfirm.addEventListener('click', () => {
  if (deletingId !== null) {
    addresses = addresses.filter(a => String(a.id) !== String(deletingId));
    // If we deleted the default and there are still addresses, make the first one default
    if (addresses.length && !addresses.some(a => a.isDefault)) {
      addresses[0].isDefault = true;
    }
    saveAddresses(addresses);
    render();
  }
  closeDeleteConfirm();
});

// ── Initial Render ──
render();
