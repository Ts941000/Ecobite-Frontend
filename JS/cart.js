/* ── Auth gate: redirect to login if not signed in ── */
import {
  createOrder,
  loadCart as loadBackendCart,
  requireAuth,
  saveCart as saveBackendCart,
} from "./firebase-service.js";

const currentUser = await requireAuth("login.html", ["user"]);
const AUTH_KEY = "ecobite-auth";
(function checkAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (!auth || auth.loggedIn !== true) {
      window.location.href = "login.html";
      return;
    }
  } catch (e) {
    window.location.href = "login.html";
    return;
  }
})();

const CART_KEY = "ecobite-cart";
let cart = await loadInitialCart();
let paymethod = "upi";
let discount = 0;
let selectedLocation = {
  label: "Home",
  address: "Civil Lines, Etawah, Uttar Pradesh",
};
let selectedAddressType = "Home";

const coupons = {
  TEJASH10: 10,
  SAVE20: 20,
  FIRSTBITE: 30,
};

/* ── All available food items (for AI suggestions) ── */
const allFoodItems = [
  { id: "butter-chicken-thali", name: "Butter Chicken Thali", hotel: "Taj Palace Hotel", place: "Connaught Place, Delhi", type: "Non-Veg", original: 450, sale: 149, time: "28-35 min", image: "FOOD IMAGES/MALAI CHAAP.avif" },
  { id: "chicken-biryani", name: "Chicken Biryani", hotel: "Royal Biryani House", place: "Banjara Hills, Hyderabad", type: "Non-Veg", original: 399, sale: 129, time: "32-40 min", image: "FOOD IMAGES/PANEER TIKKA.webp" },
  { id: "dal-makhani", name: "Dal Makhani Combo", hotel: "Punjabi Rasoi", place: "Andheri West, Mumbai", type: "Veg", original: 320, sale: 99, time: "25-30 min", image: "FOOD IMAGES/PBM.jpg" },
  { id: "paneer-butter-masala", name: "Paneer Butter Masala", hotel: "Green Leaf Kitchen", place: "Indiranagar, Bengaluru", type: "Veg", original: 360, sale: 119, time: "30-38 min", image: "FOOD IMAGES/PBM.jpg" },
  { id: "rajma-rice", name: "Rajma Rice Bowl", hotel: "Home Plate Co.", place: "C-Scheme, Jaipur", type: "Veg", original: 240, sale: 79, time: "22-28 min", image: "FOOD IMAGES/PANEER TIKKA.webp" },
  { id: "malai-chaap", name: "Malai Chaap", hotel: "Delhi Darbar", place: "Karol Bagh, Delhi", type: "Veg", original: 280, sale: 89, time: "20-25 min", image: "FOOD IMAGES/MALAI CHAAP.avif" },
  { id: "paneer-tikka", name: "Paneer Tikka", hotel: "Tikka Town", place: "Koramangala, Bengaluru", type: "Veg", original: 300, sale: 109, time: "25-30 min", image: "FOOD IMAGES/PANEER TIKKA.webp" },
];

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (error) {
    return [];
  }
}

async function loadInitialCart() {
  try {
    // Clear stale local cart before loading from backend
    if (currentUser?.uid) {
      localStorage.removeItem(CART_KEY);
    }
    return await loadBackendCart();
  } catch (error) {
    console.error("Cart load failed:", error);
    return getCart();
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  saveBackendCart(cart).catch((error) => console.error("Cart sync failed:", error));
}

function rupees(amount) {
  return `Rs. ${amount}`;
}

function render() {
  const box = document.getElementById("cartlist");
  const empty = document.getElementById("empty");
  const orderBtn = document.getElementById("orderbtn");
  const delivery = document.getElementById("delivery");

  if (cart.length === 0) {
    box.innerHTML = "";
    empty.classList.add("show");
    orderBtn.disabled = true;
    delivery.style.display = "none";
    updateSummary();
    updateAiSuggestion();
    return;
  }

  empty.classList.remove("show");
  orderBtn.disabled = false;
  delivery.style.display = "block";

  box.innerHTML = cart.map((item, index) => {
    const saved = (item.original - item.sale) * item.qty;
    const image = item.image ? `<img class="cimage" src="${item.image}" alt="${item.name}" />` : '<div class="cemoji"><span class="material-symbols-rounded">restaurant</span></div>';

    return `
      <div class="citem" style="--ci:${index}">
        ${image}
        <div class="cinfo">
          <div class="cname">${item.name}</div>
          <div class="chotel"><span class="material-symbols-rounded">storefront</span> ${item.hotel} &nbsp;•&nbsp; <span class="material-symbols-rounded">schedule</span> ${item.time}</div>
          <div class="ctags">
            <span class="ctag tagreen"><span class="material-symbols-rounded">eco</span> ${item.type}</span>
            <span class="ctag taorange"><span class="material-symbols-rounded">local_shipping</span> Home delivery</span>
          </div>
        </div>
        <div class="cprice">
          <div class="cnew">${rupees(item.sale * item.qty)}</div>
          <div class="cold">${rupees(item.original * item.qty)}</div>
          <div class="csave">Save ${rupees(saved)}</div>
        </div>
        <div class="cqty">
          <button class="qbtn" data-qty-id="${item.id}" data-change="-1">−</button>
          <div class="qnum">${item.qty}</div>
          <button class="qbtn" data-qty-id="${item.id}" data-change="1">+</button>
        </div>
        <button class="cremove" data-remove-id="${item.id}"><span class="material-symbols-rounded">delete</span></button>
      </div>
    `;
  }).join("");

  updateSummary();
  updateAiSuggestion();
}

function changeQty(id, change) {
  const item = cart.find((cartItem) => cartItem.id === id);
  if (!item) return;
  item.qty += change;
  if (item.qty <= 0) {
    removeItem(id);
    return;
  }
  saveCart();
  render();
}

function removeItem(id) {
  cart = cart.filter((item) => item.id !== id);
  saveCart();
  render();
  showToast("Item removed from cart", "delete");
}

function updateSummary() {
  const subtotal = cart.reduce((sum, item) => sum + item.sale * item.qty, 0);
  const original = cart.reduce((sum, item) => sum + item.original * item.qty, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const platformFee = count > 0 ? 5 : 0;
  const total = Math.max(0, subtotal + platformFee - discount);

  document.getElementById("itemcount").textContent = count;
  document.getElementById("itemlabel").textContent = `${count} item${count === 1 ? "" : "s"}`;
  document.getElementById("subtotal").textContent = rupees(subtotal);
  document.getElementById("platformfee").textContent = rupees(platformFee);
  document.getElementById("total").textContent = rupees(total);
  document.getElementById("savingamt").textContent = rupees(original - subtotal + discount);
  document.getElementById("btnamt").textContent = rupees(total);
  updateAiTip(subtotal, original, count);
  updateAiEta();
}

function updateAiTip(subtotal, original, count) {
  const tip = document.getElementById("aiTipText");
  if (!tip) return;

  if (count === 0) {
    tip.textContent = "Add items to get a smart delivery and savings suggestion.";
    return;
  }

  const savings = original - subtotal + discount;
  const bestItem = cart.reduce((best, item) => {
    const itemSavings = (item.original - item.sale) * item.qty;
    const bestSavings = best ? (best.original - best.sale) * best.qty : -1;
    return itemSavings > bestSavings ? item : best;
  }, null);

  if (subtotal >= 300 && discount === 0) {
    tip.textContent = `AI suggests trying SAVE20 now. Your ${count} item order already saves ${rupees(savings)}, and a coupon can improve it.`;
    return;
  }

  if (bestItem) {
    tip.textContent = `AI pick: keep ${bestItem.name}. It gives the strongest rescue value in your cart with maximum savings.`;
  }
}

/* ── AI Delivery Time Estimator ── */
function updateAiEta() {
  const etaEl = document.getElementById("aiEta");
  const etaText = document.getElementById("aiEtaText");
  if (!etaEl || !etaText) return;

  if (cart.length === 0) {
    etaEl.style.display = "none";
    return;
  }

  let maxTime = 0;
  cart.forEach((item) => {
    const match = item.time.match(/(\d+)\s*-\s*(\d+)/);
    if (match) {
      const upper = parseInt(match[2], 10);
      if (upper > maxTime) maxTime = upper;
    }
  });

  if (maxTime > 0) {
    const lower = maxTime;
    const upper = maxTime + 10;
    etaEl.style.display = "block";
    etaText.textContent = `Your order will arrive in approximately ${lower}–${upper} min. AI calculated this from ${cart.length} item${cart.length > 1 ? "s" : ""} in your cart.`;
  } else {
    etaEl.style.display = "none";
  }
}

/* ── AI Cart Suggestion ── */
function updateAiSuggestion() {
  const suggestEl = document.getElementById("aiSuggest");
  const suggestCard = document.getElementById("aiSuggestCard");
  if (!suggestEl || !suggestCard) return;

  if (cart.length === 0) {
    suggestEl.style.display = "none";
    return;
  }

  const cartIds = new Set(cart.map((item) => item.id));
  const hasVeg = cart.some((item) => item.type === "Veg");
  const hasNonVeg = cart.some((item) => item.type === "Non-Veg");

  // Prefer complementary type, then best discount
  const candidates = allFoodItems.filter((item) => !cartIds.has(item.id));
  if (candidates.length === 0) {
    suggestEl.style.display = "none";
    return;
  }

  const scored = candidates.map((item) => {
    const discountPct = ((item.original - item.sale) / item.original) * 100;
    let bonus = 0;
    // Complementary type bonus
    if (hasVeg && !hasNonVeg && item.type === "Non-Veg") bonus = 15;
    if (hasNonVeg && !hasVeg && item.type === "Veg") bonus = 15;
    return { item, score: discountPct + bonus };
  });

  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0].item;

  suggestEl.style.display = "block";
  suggestCard.innerHTML = `
    <div class="suggestItem">
      <img src="${pick.image}" alt="${pick.name}" />
      <div class="suggestInfo">
        <div class="sname">${pick.name}</div>
        <div class="shotel">${pick.hotel}</div>
        <div class="sprice">Rs. ${pick.sale}<span class="sold">Rs. ${pick.original}</span></div>
      </div>
      <button class="suggestAdd" data-suggest-id="${pick.id}">+ Add</button>
    </div>
  `;
}

function addSuggestedItem(id) {
  const item = allFoodItems.find((f) => f.id === id);
  if (!item) return;
  const existing = cart.find((c) => c.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...item, qty: 1 });
  }
  saveCart();
  render();
  showToast(`${item.name} added to cart`, "add_shopping_cart");
}

function selectPay(method) {
  paymethod = method;
  document.querySelectorAll(".payopt").forEach((option) => {
    option.classList.toggle("on", option.dataset.payMethod === method);
  });
  updateBreadcrumb(3);
}

function applyCoupon() {
  const code = document.getElementById("couponinput").value.trim().toUpperCase();
  const msg = document.getElementById("couponmsg");

  if (coupons[code]) {
    discount = coupons[code];
    msg.textContent = `Coupon applied. Extra ${rupees(discount)} off.`;
    msg.className = "good";
    showToast("Coupon applied", "sell");
  } else {
    discount = 0;
    msg.textContent = "Invalid coupon code. Try TEJASH10.";
    msg.className = "bad";
  }
  updateSummary();
}

function updatePickedLocation() {
  const addressInput = document.getElementById("paddress");
  const label = document.getElementById("pickedLocationLabel");
  const text = document.getElementById("pickedLocationText");

  if (addressInput && !addressInput.value.trim()) {
    addressInput.value = selectedLocation.address;
  }
  if (label) label.textContent = `${selectedAddressType} delivery point`;
  if (text) text.textContent = selectedLocation.address;
}

function openLocationSheet() {
  const sheet = document.getElementById("locationSheet");
  sheet.classList.add("show");
  sheet.setAttribute("aria-hidden", "false");
  document.getElementById("locationSearch").value = selectedLocation.address;

  // Lazy-init the sheet map on first open
  if (!sheetMap) {
    setTimeout(() => { initSheetMap(); }, 100);
  } else {
    setTimeout(() => { sheetMap.invalidateSize(); }, 350);
  }
}

function closeLocationSheet() {
  const sheet = document.getElementById("locationSheet");
  sheet.classList.remove("show");
  sheet.setAttribute("aria-hidden", "true");
}

function pickSuggestion(button) {
  selectedLocation = {
    label: button.dataset.label,
    address: button.dataset.address,
  };
  document.querySelectorAll(".suggestion").forEach((item) => item.classList.toggle("on", item === button));
  document.getElementById("locationSearch").value = selectedLocation.address;

  const matchingType = document.querySelector(`.typeChip[data-type="${selectedLocation.label}"]`);
  if (matchingType) pickAddressType(matchingType);
}

function pickAddressType(button) {
  selectedAddressType = button.dataset.type;
  document.querySelectorAll(".typeChip").forEach((chip) => chip.classList.toggle("on", chip === button));
}

function confirmLocation() {
  const searchValue = document.getElementById("locationSearch").value.trim();
  if (searchValue) {
    selectedLocation = {
      label: selectedAddressType,
      address: searchValue,
    };
  }
  document.getElementById("paddress").value = selectedLocation.address;
  setError("err-paddress", false);
  updatePickedLocation();
  closeLocationSheet();
  showToast("Delivery location selected", "location_on");

  // Update mini map to match sheet map center
  if (miniMap && sheetMap) {
    const c = sheetMap.getCenter();
    miniMap.setView(c, 15);
  }
}

function useCurrentLocation() {
  const button = document.getElementById("useCurrentLocationBtn");
  const originalText = button.innerHTML;
  button.innerHTML = '<span class="material-symbols-rounded">near_me</span> Detecting location...';

  const fallback = () => {
    selectedLocation = {
      label: "Current",
      address: "Civil Lines, Etawah, Uttar Pradesh",
    };
    document.getElementById("locationSearch").value = selectedLocation.address;
    button.innerHTML = originalText;
    showToast("Using saved city location", "near_me");
  };

  if (!navigator.geolocation) {
    fallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude.toFixed(4);
      const lng = position.coords.longitude.toFixed(4);
      selectedLocation = {
        label: "Current",
        address: `Current pinned location (${lat}, ${lng})`,
      };
      document.getElementById("locationSearch").value = selectedLocation.address;
      button.innerHTML = originalText;
      showToast("Current location pinned", "my_location");

      // Update Leaflet maps with real coordinates
      const coords = [parseFloat(lat), parseFloat(lng)];
      if (sheetMap) sheetMap.setView(coords, 16);
      if (miniMap) miniMap.setView(coords, 15);
    },
    fallback,
    { timeout: 6000, enableHighAccuracy: true }
  );
}

function setError(id, visible) {
  document.getElementById(id).classList.toggle("show", visible);
}

/* ── Breadcrumb Step Tracking ── */
function updateBreadcrumb(step) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`step${i}`).classList.toggle("on", i <= step);
  }
}

async function placeOrder() {
  if (cart.length === 0) return;

  const fname = document.getElementById("pfname").value.trim();
  const phone = document.getElementById("pphone").value.trim();
  const email = document.getElementById("pemail").value.trim();
  const address = document.getElementById("paddress").value.trim();

  const checks = {
    "err-pfname": fname === "",
    "err-pphone": !/^\d{10}$/.test(phone),
    "err-pemail": !email.includes("@") || !email.includes("."),
    "err-paddress": address === "",
  };

  Object.entries(checks).forEach(([id, visible]) => setError(id, visible));
  if (Object.values(checks).some(Boolean)) return;

  const subtotal = cart.reduce((sum, item) => sum + item.sale * item.qty, 0);
  const original = cart.reduce((sum, item) => sum + item.original * item.qty, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const platformFee = count > 0 ? 5 : 0;
  const total = Math.max(0, subtotal + platformFee - discount);
  const orderBtn = document.getElementById("orderbtn");
  orderBtn.disabled = true;

  async function finalizeOrder() {
    try {
      const order = await createOrder({
        items: cart,
        customer: {
          firstName: fname,
          lastName: document.getElementById("plname").value.trim(),
          phone,
          email,
        },
        delivery: {
          address,
          label: selectedAddressType,
          pickedLocation: selectedLocation,
        },
        paymentMethod: paymethod,
        totals: {
          itemCount: count,
          subtotal,
          original,
          platformFee,
          discount,
          total,
          savings: original - subtotal + discount,
        },
        couponCode: document.getElementById("couponinput").value.trim().toUpperCase(),
      });

      cart = [];
      discount = 0;
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateBreadcrumb(4);
      render();
      showToast(`Order ${order.id} placed successfully`, "check_circle");
    } catch (error) {
      console.error("Order failed:", error);
      showToast("Could not place order. Please try again.", "error");
    } finally {
      orderBtn.disabled = false;
    }
  }

  // Cash on Delivery: skip payment gateway
  if (paymethod === "cash") {
    await finalizeOrder();
    return;
  }

  // Razorpay test-mode checkout for UPI / Card
  if (typeof Razorpay !== "undefined") {
    const options = {
      key: "rzp_test_SzCbJUTQSDi1uE",
      amount: total * 100, // Razorpay expects paise
      currency: "INR",
      name: "EcoBite",
      description: `${count} rescued meal${count > 1 ? "s" : ""}`,
      image: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌿</text></svg>",
      prefill: {
        name: fname,
        email: email,
        contact: `+91${phone}`,
      },
      theme: {
        color: "#2d9b5a",
      },
      handler: async function (response) {
        showToast("Payment successful!", "check_circle");
        await finalizeOrder();
      },
      modal: {
        ondismiss: function () {
          orderBtn.disabled = false;
          showToast("Payment cancelled", "info");
        },
      },
    };
    try {
      const rzp = new Razorpay(options);
      rzp.open();
    } catch (e) {
      console.warn("Razorpay init failed, placing order directly:", e);
      await finalizeOrder();
    }
  } else {
    // Razorpay not loaded, proceed directly
    await finalizeOrder();
  }
}


function showToast(msg, icon) {
  document.getElementById("tmsg").textContent = msg;
  document.getElementById("ticon").textContent = icon;
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

/* ═══════════════════════════
   LEAFLET MAPS
═══════════════════════════ */
let miniMap = null;
let sheetMap = null;
const defaultCenter = [28.6139, 77.2090]; // Delhi

function initMiniMap() {
  const el = document.getElementById("leafletMini");
  if (!el || !window.L) return;
  try {
    miniMap = L.map(el, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      attributionControl: false,
    }).setView(defaultCenter, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(miniMap);
    L.marker(defaultCenter).addTo(miniMap);
  } catch (e) {
    /* Leaflet not available — mini map will be empty */
  }
}

function initSheetMap() {
  const el = document.getElementById("leafletSheet");
  if (!el || !window.L) return;
  try {
    sheetMap = L.map(el, {
      zoomControl: false,
      attributionControl: false,
    }).setView(defaultCenter, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(sheetMap);

    // On map drag/move, update address bar with center coordinates (Zomato-style)
    sheetMap.on("moveend", function () {
      const c = sheetMap.getCenter();
      const addrText = document.getElementById("mapAddressText");
      if (addrText) {
        addrText.textContent = `${c.lat.toFixed(4)}°N, ${c.lng.toFixed(4)}°E`;
      }
      selectedLocation.address = `Location: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;

      // Re-trigger pin bounce animation
      const pin = document.getElementById("mapCenterPin");
      if (pin) {
        pin.style.animation = "none";
        pin.offsetHeight; // trigger reflow
        pin.style.animation = "pinBounce 0.6s ease";
      }
    });
  } catch (e) {
    /* Leaflet not available */
  }
}

/* ═══════════════════════════
   EVENT LISTENERS
═══════════════════════════ */
document.getElementById("cartlist").addEventListener("click", (event) => {
  const qtyButton = event.target.closest("[data-qty-id]");
  const removeButton = event.target.closest("[data-remove-id]");
  if (qtyButton) changeQty(qtyButton.dataset.qtyId, Number(qtyButton.dataset.change));
  if (removeButton) removeItem(removeButton.dataset.removeId);
});

// AI suggestion "Add" button
document.addEventListener("click", (event) => {
  const sugBtn = event.target.closest("[data-suggest-id]");
  if (sugBtn) addSuggestedItem(sugBtn.dataset.suggestId);
});

document.querySelectorAll(".payopt").forEach((option) => {
  option.addEventListener("click", () => selectPay(option.dataset.payMethod));
});

document.getElementById("applybtn").addEventListener("click", applyCoupon);
document.getElementById("orderbtn").addEventListener("click", placeOrder);
document.getElementById("changeLocationBtn").addEventListener("click", openLocationSheet);
document.getElementById("locationMiniMap").addEventListener("click", openLocationSheet);
document.getElementById("locationMiniMap").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") openLocationSheet();
});
document.getElementById("closeLocationSheet").addEventListener("click", closeLocationSheet);
document.getElementById("sheetBackdrop").addEventListener("click", closeLocationSheet);
document.getElementById("confirmLocationBtn").addEventListener("click", confirmLocation);
document.getElementById("useCurrentLocationBtn").addEventListener("click", useCurrentLocation);
document.getElementById("locationSuggestions").addEventListener("click", (event) => {
  const button = event.target.closest(".suggestion");
  if (button) pickSuggestion(button);
});
document.getElementById("addressType").addEventListener("click", (event) => {
  const button = event.target.closest(".typeChip");
  if (button) pickAddressType(button);
});
document.getElementById("locationSearch").addEventListener("input", (event) => {
  selectedLocation = {
    label: selectedAddressType,
    address: event.target.value.trim() || selectedLocation.address,
  };
});
document.getElementById("shopbtn").addEventListener("click", () => {
  window.location.href = "EcoBite.html";
});

// Breadcrumb: step 2 when user starts filling delivery form
let deliveryFocused = false;
const deliveryEl = document.getElementById("delivery");
if (deliveryEl) {
  deliveryEl.addEventListener("focusin", () => {
    if (!deliveryFocused) {
      deliveryFocused = true;
      updateBreadcrumb(2);
    }
  });
}

/* ═══════════════════════════
   INIT
═══════════════════════════ */
if (currentUser) {
  const [firstName = "", ...rest] = String(currentUser.name || "").split(" ");
  document.getElementById("pfname").value ||= firstName;
  document.getElementById("plname").value ||= rest.join(" ");
  document.getElementById("pemail").value ||= currentUser.email || "";
  document.getElementById("pphone").value ||= currentUser.phone || "";
}
updatePickedLocation();
updateBreadcrumb(1);
render();
initMiniMap();
