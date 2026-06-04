import { requireAuth, getSignedInUser, listenOrders, logoutUser } from './firebase-service.js';

// ── Auth Gate ──
const currentUser = await requireAuth('login.html', ['user']);
if (!currentUser) throw new Error('Not authenticated');

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
profileAvatar.textContent = uInitials;
profileName.textContent = uName;
profileBigAvatar.textContent = uInitials;
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

// ── Filter Tabs ──
const filterTabs = document.querySelectorAll('.filter-tab');
let currentFilter = 'all';
let allOrders = [];

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderOrders();
  });
});

// ── Order Rendering ──
const container = document.getElementById('ordersContainer');

function formatDate(ms) {
  if (!ms) return 'N/A';
  const d = new Date(ms);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  }) + ' · ' + d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit'
  });
}

function statusIcon(status) {
  const map = {
    pending: 'schedule',
    accepted: 'thumb_up',
    completed: 'check_circle',
    cancelled: 'cancel',
  };
  return map[status] || 'help';
}

function getRestaurantName(order) {
  // Try various fields that might contain the restaurant name
  if (order.items?.length) {
    const firstItem = order.items[0];
    if (firstItem.hotel) return firstItem.hotel;
    if (firstItem.restaurant) return firstItem.restaurant;
  }
  if (order.restaurant) return order.restaurant;
  if (order.hotel) return order.hotel;
  return 'EcoBite Restaurant';
}

function renderOrders() {
  const filtered = currentFilter === 'all'
    ? allOrders
    : allOrders.filter(o => o.status === currentFilter);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="state-box">
        <span class="material-symbols-rounded">receipt_long</span>
        <h3>${currentFilter === 'all' ? 'No orders yet' : `No ${currentFilter} orders`}</h3>
        <p>${currentFilter === 'all'
          ? "You haven't placed any orders yet. Start exploring today's rescue deals!"
          : `You don't have any ${currentFilter} orders at the moment.`
        }</p>
        <a href="EcoBite.html#listings" class="explore-btn">
          <span class="material-symbols-rounded">explore</span>
          Explore Deals
        </a>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map((order, i) => {
    const items = order.items || [];
    const status = (order.status || 'pending').toLowerCase();
    const restaurant = getRestaurantName(order);
    const total = order.totals?.total
      ?? order.totals?.grandTotal
      ?? items.reduce((sum, it) => sum + (it.price || it.sale || 0) * (it.qty || it.quantity || 1), 0);

    return `
      <div class="order-card" style="animation-delay: ${i * 0.06}s">
        <div class="order-top">
          <div class="order-id-wrap">
            <div>
              <div class="order-id">#${order.id || 'N/A'}</div>
              <div class="order-date">${formatDate(order.createdAtMs)}</div>
            </div>
          </div>
          <div class="status-badge status-${status}">
            <span class="material-symbols-rounded">${statusIcon(status)}</span>
            ${status}
          </div>
        </div>
        <div class="order-body">
          <div class="order-restaurant">
            <span class="material-symbols-rounded">storefront</span>
            ${restaurant}
          </div>
          <div class="order-items">
            ${items.map(it => `
              <div class="order-item">
                <div class="item-info">
                  <div class="item-qty">${it.qty || it.quantity || 1}×</div>
                  <div class="item-name">${it.name || 'Item'}</div>
                </div>
                <div class="item-price">₹${((it.price || it.sale || 0) * (it.qty || it.quantity || 1)).toFixed(0)}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="order-footer">
          <div class="order-total">
            <span>Total </span>₹${Number(total).toFixed(0)}
          </div>
          ${status === 'accepted' && order.prepTime
            ? `<div class="order-prep">
                 <span class="material-symbols-rounded">schedule</span>
                 Prep: ${order.prepTime}
               </div>`
            : ''
          }
        </div>
      </div>
    `;
  }).join('');
}

// ── Listen for Orders ──
listenOrders(orders => {
  allOrders = orders.filter(o => o.userId === currentUser.uid);
  renderOrders();
});
