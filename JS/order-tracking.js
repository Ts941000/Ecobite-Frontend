import { requireAuth, listenOrders } from './firebase-service.js';

const currentUser = await requireAuth('login.html', ['user']);
if (!currentUser) throw new Error('Not authenticated');

const params = new URLSearchParams(window.location.search);
const orderId = params.get('orderId');
if (!orderId) { window.location.href = 'my-orders.html'; }

let trackMap = null;
let deliveryMarker = null;
let routeLine = null;
let animationTimer = null;

// Simulated coordinates (Delhi area)
const restaurantCoords = [28.6139, 77.2090];
const deliveryCoords = [28.6300, 77.2200];

function initMap() {
  const el = document.getElementById('trackMap');
  if (!el || !window.L) return;
  trackMap = L.map(el, { zoomControl: false, attributionControl: false }).setView(restaurantCoords, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(trackMap);

  const restaurantIcon = L.divIcon({
    className: 'custom-marker restaurant-marker',
    html: '<span class="material-symbols-rounded">storefront</span>',
    iconSize: [40, 40], iconAnchor: [20, 20]
  });
  L.marker(restaurantCoords, { icon: restaurantIcon }).addTo(trackMap);

  const homeIcon = L.divIcon({
    className: 'custom-marker home-marker',
    html: '<span class="material-symbols-rounded">home</span>',
    iconSize: [40, 40], iconAnchor: [20, 20]
  });
  L.marker(deliveryCoords, { icon: homeIcon }).addTo(trackMap);

  const route = generateRoute(restaurantCoords, deliveryCoords, 20);
  routeLine = L.polyline(route, { color: '#2d9b5a', weight: 4, opacity: 0.7, dashArray: '10, 10' }).addTo(trackMap);
  trackMap.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

  const bikeIcon = L.divIcon({
    className: 'custom-marker bike-marker',
    html: '<span class="material-symbols-rounded">directions_bike</span>',
    iconSize: [44, 44], iconAnchor: [22, 22]
  });
  deliveryMarker = L.marker(restaurantCoords, { icon: bikeIcon }).addTo(trackMap);
}

function generateRoute(start, end, points) {
  const route = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const lat = start[0] + (end[0] - start[0]) * t + (Math.sin(t * Math.PI * 2) * 0.003);
    const lng = start[1] + (end[1] - start[1]) * t + (Math.cos(t * Math.PI * 3) * 0.002);
    route.push([lat, lng]);
  }
  return route;
}

let routeProgress = 0;
function animateDelivery(status) {
  if (status !== 'accepted' || !deliveryMarker || !routeLine) return;
  if (animationTimer) return; // Already animating
  const points = routeLine.getLatLngs();

  function step() {
    if (routeProgress < points.length) {
      deliveryMarker.setLatLng(points[routeProgress]);
      trackMap.panTo(points[routeProgress], { animate: true, duration: 0.5 });
      routeProgress++;
      animationTimer = setTimeout(step, 2000);
    } else {
      routeProgress = 0; // Loop the animation
      animationTimer = setTimeout(step, 3000);
    }
  }
  step();
}

function formatTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function updateStatus(order) {
  const status = order.status || 'pending';
  document.getElementById('navOrderId').textContent = `#${orderId}`;

  const statusConfig = {
    pending: { icon: 'hourglass_top', title: 'Order Pending', sub: 'Waiting for restaurant to accept your order' },
    accepted: { icon: 'restaurant', title: 'Preparing Your Order', sub: `Estimated time: ${order.prepTime || 20} minutes` },
    completed: { icon: 'check_circle', title: 'Order Delivered!', sub: 'Enjoy your rescued meal! 🌿' },
    cancelled: { icon: 'cancel', title: 'Order Cancelled', sub: 'This order has been cancelled' },
  };
  const config = statusConfig[status] || statusConfig.pending;
  document.getElementById('statusIconBig').querySelector('.material-symbols-rounded').textContent = config.icon;
  document.getElementById('statusTitle').textContent = config.title;
  document.getElementById('statusSub').textContent = config.sub;

  // Timeline progression
  const steps = ['confirmed', 'preparing', 'pickup', 'delivered'];
  const activeIndex = status === 'accepted' ? 2 : status === 'completed' ? 4 : status === 'cancelled' ? 0 : 1;
  steps.forEach((step, i) => {
    const el = document.getElementById(`tl-${step}`);
    el.classList.toggle('done', i < activeIndex);
    el.classList.toggle('active', i === activeIndex - 1);
  });

  if (order.createdAtMs) document.getElementById('tl-confirmed-time').textContent = formatTime(order.createdAtMs);
  if (order.acceptedAt) document.getElementById('tl-preparing-time').textContent = formatTime(order.acceptedAt);

  // ETA calculation
  if (status === 'accepted' && order.prepTime && order.acceptedAt) {
    const etaMs = order.acceptedAt + (order.prepTime * 60000);
    const remaining = Math.max(0, Math.ceil((etaMs - Date.now()) / 60000));
    document.getElementById('etaText').textContent = remaining > 0 ? `${remaining} min away` : 'Arriving soon!';
  } else if (status === 'completed') {
    document.getElementById('etaText').textContent = 'Delivered ✓';
  } else if (status === 'cancelled') {
    document.getElementById('etaText').textContent = 'Cancelled';
  } else {
    document.getElementById('etaText').textContent = 'Waiting...';
  }

  // Order items summary
  const items = order.items || [];
  document.getElementById('orderItems').innerHTML = items.map(it => `
    <div class="summary-item">
      <span>${it.qty || 1}× ${it.name || 'Item'}</span>
      <span>₹${((it.sale || it.price || 0) * (it.qty || 1)).toFixed(0)}</span>
    </div>
  `).join('');
  const total = order.totals?.total || items.reduce((s, it) => s + (it.sale || it.price || 0) * (it.qty || 1), 0);
  document.getElementById('orderTotal').textContent = `Total: ₹${Number(total).toFixed(0)}`;

  // Start delivery animation for accepted orders
  if (status === 'accepted') animateDelivery(status);
}

// Initialize map
if (window.L) {
  initMap();
} else {
  window.addEventListener('load', initMap);
}

// Listen for order updates
listenOrders(orders => {
  const order = orders.find(o => o.id === orderId);
  if (order) {
    updateStatus(order);
  } else {
    document.getElementById('statusTitle').textContent = 'Order Not Found';
    document.getElementById('statusSub').textContent = 'This order could not be found.';
  }
});
