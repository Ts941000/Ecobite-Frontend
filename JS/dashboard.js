import {
  deleteListing as deleteBackendListing,
  listenListings,
  listenOrders,
  logoutUser,
  requireAuth,
  saveListing as saveBackendListing,
  updateOrderStatus,
  uploadListingImage,
} from "./firebase-service.js";

const currentUser = await requireAuth("login.html", ["hotel"]);

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

try {
  const savedSettings = JSON.parse(localStorage.getItem('ecobite-hotel-settings'));
  if (savedSettings) {
    if (savedSettings.hotel) {
      document.getElementById('settingHotelName').value = savedSettings.hotel;
      document.getElementById('hotelname').innerHTML = `<span class="material-symbols-rounded">hotel</span> ${savedSettings.hotel}`;
    }
    if (savedSettings.verified) {
      document.getElementById('settingVerified').checked = true;
      document.getElementById('hotelbadge').innerHTML = `<span class="material-symbols-rounded">verified</span> ${savedSettings.badge || 'Verified Partner'}`;
      document.getElementById('hotelbadge').style.display = '';
    }
  }
} catch (e) { /* ignore */ }

let listings = [];
let orders = [];
let editId = null;
let editImageUrl = null;

function openPanel(name) {
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("show"));
  document.querySelectorAll(".sec").forEach((button) => button.classList.remove("on"));
  document.querySelectorAll(".menuitem").forEach((item) => item.classList.remove("on"));

  document.getElementById(`panel-${name}`).classList.add("show");
  document.getElementById(`sec-${name}`).classList.add("on");
  const menuItem = document.querySelector(`.menuitem[data-panel="${name}"]`);
  if (menuItem) menuItem.classList.add("on");

  const titles = {
    overview: "Overview",
    listings: "My Listings",
    add: "Add New Listing",
    orders: "Orders",
    settings: "Settings",
  };
  document.getElementById("pagetitle").textContent = titles[name];
  if (window.innerWidth <= 768) toggleSidebar(false);
}

function renderRows() {
  if (listings.length === 0) {
    document.getElementById("rows").innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">restaurant</span>
        <p>No listings yet. Add your first food listing to get started.</p>
      </div>
    `;
    document.getElementById("totallistings").textContent = "0";
    return;
  }
  document.getElementById("rows").innerHTML = listings.map((item) => {
    const discount = Math.round(((item.original - item.sale) / item.original) * 100);
    const image = item.image ? `<img class="timage" src="${item.image}" alt="${item.name}" />` : '<div class="fallbackicon"><span class="material-symbols-rounded">restaurant</span></div>';
    return `
      <div class="trow">
        <div>${image}</div>
        <div><div class="tname">${item.name}</div><div class="thotel">${discount}% OFF \u2022 ${item.type === "Veg" ? "Veg" : "Non-Veg"}</div></div>
        <div><div class="tprice">Rs. ${item.sale}</div><div class="told">Rs. ${item.original}</div></div>
        <div class="tqty ${item.qty < 10 ? "danger-text" : "normal-text"}">${item.qty === 0 ? "Gone" : item.qty}</div>
        <div class="tdelivery">${item.time}</div>
        <div><span class="tstatus ${item.status}">${item.status === "active" ? "Active" : "Sold Out"}</span></div>
        <div class="actions">
          <button class="editbtn" data-edit-id="${item.id}">Edit</button>
          <button class="delbtn" data-delete-id="${item.id}"><span class="material-symbols-rounded">delete</span></button>
        </div>
      </div>
    `;
  }).join("");
  document.getElementById("totallistings").textContent = listings.length;
}

function normalizeOrder(order) {
  const firstItem = order.items?.[0] || {};
  const customerName = [
    order.customer?.firstName,
    order.customer?.lastName,
  ].filter(Boolean).join(" ");

  return {
    id: order.id?.startsWith?.("#") ? order.id : `#${order.id || "EBORDER"}`,
    rawId: order.id,
    name: order.name || firstItem.name || "EcoBite order",
    user: order.user || customerName || order.userEmail || "Customer",
    qty: order.qty || order.totals?.itemCount || order.items?.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 1,
    price: order.price || order.totals?.total || 0,
    status: order.status || "pending",
    prepTime: order.prepTime || null,
    items: order.items || [],
    createdAtMs: order.createdAtMs || 0,
  };
}

function renderOrders() {
  const normalizedOrders = orders.map(normalizeOrder);
  if (normalizedOrders.length === 0) {
    document.getElementById("orderlist").innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">inventory_2</span>
        <p>No orders yet. Orders will appear here when customers place them.</p>
      </div>
    `;
    document.getElementById("totalorders").textContent = "0";
    return;
  }
  document.getElementById("orderlist").innerHTML = normalizedOrders.map((order) => {
    const statusLabels = {
      done: "Completed",
      accepted: "Accepted",
      pending: "Pending",
      cancelled: "Cancelled",
    };
    const statusLabel = statusLabels[order.status] || order.status;

    let actionsHtml = "";
    if (order.status === "pending") {
      actionsHtml = `
        <div class="order-actions">
          <button class="accept-btn" data-accept-id="${order.rawId}">
            <span class="material-symbols-rounded">check_circle</span> Accept
          </button>
          <button class="cancel-btn" data-cancel-id="${order.rawId}">
            <span class="material-symbols-rounded">cancel</span> Cancel
          </button>
        </div>
      `;
    }

    let prepHtml = "";
    if (order.prepTime && order.status === "accepted") {
      prepHtml = `<div class="oprep"><span class="material-symbols-rounded">schedule</span> Prep: ${order.prepTime} min</div>`;
    }

    return `
      <div class="ordercard" id="order-${order.rawId}">
        <div>
          <div class="onum">${order.id}</div>
          <div class="oname">${escapeHtml(order.name)}</div>
          <div class="ometa">${escapeHtml(order.user)} \u2022 Qty: ${order.qty}</div>
          ${prepHtml}
        </div>
        <div class="oprice">Rs. ${order.price}</div>
        <span class="obadge ${order.status}">${statusLabel}</span>
        ${actionsHtml}
      </div>
    `;
  }).join("");
  const totalOrders = document.getElementById("totalorders");
  if (totalOrders) totalOrders.textContent = normalizedOrders.length;
}

function updateDashboardStats() {
  // Active Listings
  const activeCount = listings.length;
  document.getElementById("totallistings").textContent = activeCount;
  document.getElementById("listingsSubtext").textContent = activeCount > 0 ? `${activeCount} active` : "--";

  // Orders
  const orderCount = orders.length;
  document.getElementById("totalorders").textContent = orderCount;
  document.getElementById("ordersSubtext").textContent = orderCount > 0 ? `${orderCount} total` : "--";

  // Revenue — calculate from accepted/done orders
  const revenue = orders
    .filter(o => o.status === "accepted" || o.status === "done")
    .reduce((sum, o) => {
      const normalized = normalizeOrder(o);
      return sum + Number(normalized.price || 0);
    }, 0);
  document.getElementById("totalrevenue").textContent = revenue > 0 ? `Rs. ${revenue.toLocaleString("en-IN")}` : "Rs. 0";
  document.getElementById("revenueSubtext").textContent = revenue > 0 ? "From orders" : "--";

  // Food saved — estimate 0.5kg per item sold
  const totalItemsSold = orders
    .filter(o => o.status === "accepted" || o.status === "done")
    .reduce((sum, o) => {
      const normalized = normalizeOrder(o);
      return sum + Number(normalized.qty || 0);
    }, 0);
  const foodSaved = Math.round(totalItemsSold * 0.5);
  document.getElementById("totalfoodsaved").textContent = foodSaved > 0 ? `${foodSaved} kg` : "0 kg";
  document.getElementById("foodSubtext").textContent = foodSaved > 0 ? "Estimated" : "--";
}

function renderActivity() {
  // Build real activity from actual listings and orders — NO fake data
  const activityItems = [];

  // Recent orders
  orders.slice(0, 3).forEach(order => {
    const norm = normalizeOrder(order);
    const timeAgo = getTimeAgo(norm.createdAtMs);
    activityItems.push({
      icon: "inventory_2",
      text: `Order ${norm.id} \u2014 ${norm.status}`,
      time: timeAgo,
    });
  });

  // Recent listings with low qty
  listings.filter(l => l.qty < 10 && l.qty > 0).slice(0, 2).forEach(item => {
    activityItems.push({
      icon: "warning",
      text: `${item.name} quantity is low (${item.qty} left)`,
      time: "Now",
    });
  });

  if (activityItems.length === 0) {
    document.getElementById("activity").innerHTML = `
      <div class="empty-state-small">
        <span class="material-symbols-rounded">history</span>
        <p>No recent activity yet.</p>
      </div>
    `;
  } else {
    document.getElementById("activity").innerHTML = activityItems.map((item) => `
      <div class="activity-row">
        <span class="material-symbols-rounded">${item.icon}</span>
        <div class="activity-text">${item.text}</div>
        <span class="activity-time">${item.time}</span>
      </div>
    `).join("");
  }

  // Top selling — from actual listings only
  if (listings.length === 0) {
    document.getElementById("topsell").innerHTML = `
      <div class="empty-state-small">
        <span class="material-symbols-rounded">trophy</span>
        <p>No items listed yet.</p>
      </div>
    `;
  } else {
    document.getElementById("topsell").innerHTML = listings.slice(0, 4).map((item, index) => `
      <div class="top-sale-row">
        <span class="sale-rank">${index + 1}</span>
        ${item.image ? `<img class="tinyimage" src="${item.image}" alt="${item.name}" />` : '<div class="fallbackicon" style="width:34px;height:34px;border-radius:9px;"><span class="material-symbols-rounded">restaurant</span></div>'}
        <div class="top-sale-name">${item.name}</div>
        <span class="top-sale-price">Rs. ${item.sale}</span>
      </div>
    `).join("");
  }
}

function getTimeAgo(timestamp) {
  if (!timestamp) return "--";
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function showToast(message, icon = "check_circle") {
  document.getElementById("toastmsg").textContent = message;
  document.getElementById("toasticon").textContent = icon;
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function setFormError(id, visible) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("show", visible);
}

function clearForm() {
  ["fname", "foriginal", "fsale", "fqty", "ftype", "ftime"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const descEl = document.getElementById("fdesc");
  if (descEl) descEl.value = "";
  const fileInput = document.getElementById("fimagefile");
  if (fileInput) fileInput.value = "";
  const preview = document.getElementById("imagePreview");
  if (preview) preview.innerHTML = "";
  editId = null;
  editImageUrl = null;
  document.getElementById("savebtntext").textContent = "Save Listing";
}

async function saveListing() {
  const name = document.getElementById("fname").value.trim();
  const original = Number(document.getElementById("foriginal").value);
  const sale = Number(document.getElementById("fsale").value);
  const qty = Number(document.getElementById("fqty").value);
  const type = document.getElementById("ftype").value;
  const time = document.getElementById("ftime").value.trim();
  const imageFile = document.getElementById("fimagefile").files[0];

  const checks = {
    "ferr-name": name === "",
    "ferr-original": !Number.isFinite(original) || original <= 0,
    "ferr-sale": !Number.isFinite(sale) || sale <= 0 || sale >= original,
    "ferr-qty": !Number.isInteger(qty) || qty < 1,
    "ferr-type": type === "",
    "ferr-time": time === "",
    "ferr-image": false,
  };
  Object.entries(checks).forEach(([id, visible]) => setFormError(id, visible));
  if (Object.values(checks).some(Boolean)) return;

  // Show saving state
  const saveBtn = document.getElementById("savebtn");
  const saveBtnText = document.getElementById("savebtntext");
  saveBtn.disabled = true;
  saveBtnText.textContent = "Saving...";

  let image = editImageUrl || "FOOD IMAGES/dm.jpg.jpeg";

  if (imageFile) {
    try {
      image = await uploadListingImage(imageFile) || image;
    } catch (error) {
      console.error("Image upload failed:", error);
      // Fallback to base64
      try {
        image = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(image);
          reader.readAsDataURL(imageFile);
        });
      } catch (e) {
        showToast("Image upload skipped", "cloud_off");
      }
    }
  }

  const hotel = document.getElementById("settingHotelName").value.trim()
    || document.getElementById("hotelname").textContent.trim()
    || "EcoBite Partner";
  const listingPayload = {
    id: editId,
    name,
    description: document.getElementById('fdesc')?.value?.trim() || '',
    hotel,
    place: "Partner kitchen, India",
    city: "All",
    original,
    sale,
    qty,
    type,
    time,
    image,
    status: qty > 0 ? "active" : "soldout",
    ownerId: currentUser?.uid || "demo-owner",
  };

  try {
    const savedListing = await saveBackendListing(listingPayload);
    if (editId) {
      const item = listings.find((listing) => String(listing.id) === String(editId));
      if (item) Object.assign(item, savedListing);
      showToast("Listing updated", "edit");
    } else {
      listings.unshift(savedListing);
      showToast("Listing added", "check_circle");
    }
  } catch (error) {
    console.error("Listing save failed:", error);
    showToast("Could not save listing", "error");
    saveBtn.disabled = false;
    saveBtnText.textContent = editId ? "Update Listing" : "Save Listing";
    return;
  }

  saveBtn.disabled = false;
  renderRows();
  renderActivity();
  updateDashboardStats();
  clearForm();
  openPanel("listings");
}

function editRow(id) {
  const item = listings.find((listing) => String(listing.id) === String(id));
  if (!item) return;
  editId = id;
  editImageUrl = item.image || null;
  document.getElementById("fname").value = item.name;
  document.getElementById("foriginal").value = item.original;
  document.getElementById("fsale").value = item.sale;
  document.getElementById("fqty").value = item.qty;
  document.getElementById("ftype").value = item.type;
  document.getElementById("ftime").value = item.time;
  const preview = document.getElementById("imagePreview");
  if (preview && editImageUrl) {
    preview.innerHTML = `<img src="${editImageUrl}" alt="Current dish image" />`;
  }
  document.getElementById("savebtntext").textContent = "Update Listing";
  openPanel("add");
}

async function deleteRow(id) {
  if (!confirm('Are you sure you want to delete this listing?')) return;
  try {
    await deleteBackendListing(id);
    listings = listings.filter((listing) => String(listing.id) !== String(id));
    renderRows();
    renderActivity();
    updateDashboardStats();
    showToast("Listing deleted", "delete");
  } catch (error) {
    console.error("Listing delete failed:", error);
    showToast("Could not delete listing", "error");
  }
}

async function acceptOrder(orderId, btn) {
  if (btn) btn.disabled = true;
  const orderCard = document.getElementById(`order-${orderId}`);
  const actionsDiv = orderCard?.querySelector('.order-actions');
  if (!actionsDiv) return;

  // Replace buttons with prep time selector
  actionsDiv.innerHTML = `
    <div class="prep-time-selector">
      <label>Prep time:</label>
      <select class="prep-select" id="prep-${orderId}">
        <option value="10">10 min</option>
        <option value="15">15 min</option>
        <option value="20" selected>20 min</option>
        <option value="30">30 min</option>
        <option value="45">45 min</option>
        <option value="60">60 min</option>
      </select>
      <button class="confirm-accept-btn" data-confirm-accept="${orderId}">
        <span class="material-symbols-rounded">check</span> Confirm
      </button>
      <button class="cancel-action-btn" data-cancel-action="${orderId}">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `;
}

async function confirmAcceptOrder(orderId, btn) {
  if (btn) btn.disabled = true;
  const prepSelect = document.getElementById(`prep-${orderId}`);
  const prepTime = parseInt(prepSelect?.value || "20", 10);
  const orderCard = document.getElementById(`order-${orderId}`);

  try {
    await updateOrderStatus(orderId, "accepted", {
      prepTime,
      acceptedAt: Date.now(),
    });
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      order.status = "accepted";
      order.prepTime = prepTime;
    }
    // Animate the card
    if (orderCard) {
      orderCard.classList.add("order-accepted-anim");
      setTimeout(() => orderCard.classList.remove("order-accepted-anim"), 800);
    }
    renderOrders();
    updateDashboardStats();
    showToast(`Order accepted \u2022 Prep time: ${prepTime} min`, "check_circle");
  } catch (error) {
    console.error("Accept order failed:", error);
    showToast("Could not accept order", "error");
    if (btn) btn.disabled = false;
  }
}

async function cancelOrder(orderId, btn) {
  if (btn) btn.disabled = true;
  const orderCard = document.getElementById(`order-${orderId}`);
  const actionsDiv = orderCard?.querySelector('.order-actions');
  if (!actionsDiv) return;

  // Replace buttons with confirmation
  actionsDiv.innerHTML = `
    <div class="cancel-confirm">
      <span class="cancel-confirm-text">Cancel this order?</span>
      <button class="confirm-cancel-btn" data-confirm-cancel="${orderId}">
        <span class="material-symbols-rounded">check</span> Yes
      </button>
      <button class="cancel-action-btn" data-cancel-action="${orderId}">
        <span class="material-symbols-rounded">close</span> No
      </button>
    </div>
  `;
}

async function confirmCancelOrder(orderId, btn) {
  if (btn) btn.disabled = true;
  const orderCard = document.getElementById(`order-${orderId}`);
  try {
    await updateOrderStatus(orderId, "cancelled", {
      cancelledAt: Date.now(),
    });
    const order = orders.find((o) => o.id === orderId);
    if (order) order.status = "cancelled";
    // Animate the card
    if (orderCard) {
      orderCard.classList.add("order-cancelled-anim");
      setTimeout(() => {
        orderCard.classList.remove("order-cancelled-anim");
        renderOrders();
        updateDashboardStats();
      }, 600);
    } else {
      renderOrders();
      updateDashboardStats();
    }
    showToast("Order cancelled", "cancel");
  } catch (error) {
    console.error("Cancel order failed:", error);
    showToast("Could not cancel order", "error");
    if (btn) btn.disabled = false;
  }
}

function toggleSidebar(force) {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const open = typeof force === "boolean" ? force : !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", open);
  overlay.classList.toggle("open", open);
}

// ── Event Listeners ──

document.querySelectorAll("[data-panel]").forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    openPanel(control.dataset.panel);
  });
});

document.getElementById("addbtn").addEventListener("click", () => openPanel("add"));
document.getElementById("savebtn").addEventListener("click", saveListing);
document.getElementById("mHamburger").addEventListener("click", () => toggleSidebar());
document.getElementById("sidebarOverlay").addEventListener("click", () => toggleSidebar(false));
document.getElementById("logoutbtn").addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "login.html";
});
document.getElementById("rows").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  const deleteButton = event.target.closest("[data-delete-id]");
  if (editButton) editRow(editButton.dataset.editId);
  if (deleteButton) deleteRow(deleteButton.dataset.deleteId);
});

// Order action listeners (delegated)
document.getElementById("orderlist").addEventListener("click", (event) => {
  const acceptBtn = event.target.closest("[data-accept-id]");
  const cancelBtn = event.target.closest("[data-cancel-id]");
  const confirmAcceptBtn = event.target.closest("[data-confirm-accept]");
  const confirmCancelBtn = event.target.closest("[data-confirm-cancel]");
  const cancelActionBtn = event.target.closest("[data-cancel-action]");

  if (acceptBtn) acceptOrder(acceptBtn.dataset.acceptId, acceptBtn);
  if (cancelBtn) cancelOrder(cancelBtn.dataset.cancelId, cancelBtn);
  if (confirmAcceptBtn) confirmAcceptOrder(confirmAcceptBtn.dataset.confirmAccept, confirmAcceptBtn);
  if (confirmCancelBtn) confirmCancelOrder(confirmCancelBtn.dataset.confirmCancel, confirmCancelBtn);
  if (cancelActionBtn) renderOrders(); // Re-render to restore original buttons
});

// Image preview on file select
document.getElementById("fimagefile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  const preview = document.getElementById("imagePreview");
  if (!preview) return;
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `<img src="${e.target.result}" alt="Preview" />`;
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = "";
  }
});

document.getElementById("saveSettingsBtn").addEventListener("click", () => {
  const hotel = document.getElementById("settingHotelName").value.trim() || "EcoBite Partner";
  const badge = document.getElementById("settingHotelBadge").value.trim() || "Verified Partner";
  const verified = document.getElementById("settingVerified").checked;
  document.getElementById("hotelname").innerHTML = `<span class="material-symbols-rounded">hotel</span> ${hotel}`;
  if (verified) {
    document.getElementById("hotelbadge").innerHTML = `<span class="material-symbols-rounded">verified</span> ${badge}`;
    document.getElementById("hotelbadge").style.display = "";
  } else {
    document.getElementById("hotelbadge").style.display = "none";
  }
  localStorage.setItem('ecobite-hotel-settings', JSON.stringify({ hotel, badge, verified }));
  showToast("Settings saved");
});

// ── Real-time listeners ──

await listenListings((items) => {
  listings = items || [];
  try { renderRows(); } catch (e) { console.error('renderRows error:', e); }
  try { renderActivity(); } catch (e) { console.error('renderActivity error:', e); }
  try { updateDashboardStats(); } catch (e) { console.error('updateDashboardStats error:', e); }
}, []);

await listenOrders((items) => {
  orders = items || [];
  try { renderOrders(); } catch (e) { console.error('renderOrders error:', e); }
  try { updateDashboardStats(); } catch (e) { console.error('updateDashboardStats error:', e); }
});

try { renderRows(); } catch (e) { console.error('renderRows error:', e); }
try { renderOrders(); } catch (e) { console.error('renderOrders error:', e); }
try { renderActivity(); } catch (e) { console.error('renderActivity error:', e); }
try { updateDashboardStats(); } catch (e) { console.error('updateDashboardStats error:', e); }
