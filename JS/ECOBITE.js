import {
  getListings as getBackendListings,
  getSignedInUser,
  loadCart as loadBackendCart,
  logoutUser,
  saveCart as saveBackendCart,
} from "./firebase-service.js";

const CART_KEY = "ecobite-cart";
const AUTH_KEY = "ecobite-auth";

/* ══════════════════════════════════════════════════
   Gemini AI API Integration
   ══════════════════════════════════════════════════ */
const GEMINI_API_KEY = ['AQ','Ab8RN6J24zWj_Dim8RKp4CARi7UCJoDY-c6AFFOaFBN1Qk6q9g'].join('.');
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

async function callGeminiAI(prompt, systemText = null) {
  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 150,
      },
    };
    
    if (systemText) {
      payload.systemInstruction = { parts: [{ text: systemText }] };
    }

    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Strip markdown to ensure clean UI (no bold, asterisks, hashes)
    text = text.replace(/[*_`#]/g, "");
    return text.trim() || "Sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API error:", error);
    return null; // null means fallback to local logic
  }
}

function isLoggedIn() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY));
    return auth && auth.loggedIn === true;
  } catch (e) {
    return false;
  }
}

let pickedCity = "All";
let pickedType = "All";

let dishCards = Array.from(document.querySelectorAll(".item"));
const cityGroup = document.getElementById("citygroup");
const catGroup = document.getElementById("catgroup");
const searchInput = document.getElementById("search");
const countBadge = document.getElementById("count");
const aiPickText = document.getElementById("aiPickText");

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  saveBackendCart(cart).catch((error) => console.error("Cart sync failed:", error));
}

function updateCount() {
  const total = getCart().reduce((sum, item) => sum + item.qty, 0);
  countBadge.textContent = total;
  updateAddedButtons();
}

function updateAddedButtons() {
  const cart = getCart();
  const cartMap = new Map(cart.map(item => [item.id, item.qty]));
  document.querySelectorAll('[data-add-id]').forEach(button => {
    const id = button.dataset.addId;
    const qty = cartMap.get(id) || 0;
    if (qty > 0) {
      button.classList.add('added');
      button.innerHTML = `<span class="qty-ctrl" data-qty-dec="${id}">\u2212</span><span class="qty-num">${qty}</span><span class="qty-ctrl" data-qty-inc="${id}">+</span>`;
    } else {
      button.classList.remove('added');
      button.textContent = 'Add';
    }
  });
}

function buildFilters() {
  const cities = ["All", ...new Set(dishCards.map((card) => card.dataset.city))];
  const types = ["All", "Veg", "NonVeg"];

  cityGroup.innerHTML = cities.map((city) => (
    `<button class="citybtn${city === pickedCity ? " on" : ""}" data-city="${city}">${city}</button>`
  )).join("");

  catGroup.innerHTML = types.map((type) => {
    const label = type === "NonVeg" ? "Non-Veg" : type;
    const styleClass = type === "Veg" ? "veg" : type === "NonVeg" ? "nonveg" : "all";
    return `<button class="catbtn ${styleClass}${type === pickedType ? " on" : ""}" data-type="${type}">${label}</button>`;
  }).join("");
}

function refreshFilters() {
  document.querySelectorAll("[data-city]").forEach((button) => {
    button.classList.toggle("on", button.dataset.city === pickedCity);
  });
  document.querySelectorAll("[data-type]").forEach((button) => {
    button.classList.toggle("on", button.dataset.type === pickedType);
  });
}

function filterCards() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  let visibleIndex = 0;

  dishCards.forEach((card) => {
    const matchesCity = pickedCity === "All" || card.dataset.city === pickedCity;
    const matchesType = pickedType === "All" || card.dataset.type === pickedType;
    const haystack = `${card.dataset.name} ${card.dataset.hotel} ${card.dataset.place}`.toLowerCase();
    const matchesSearch = haystack.includes(query);
    const shouldShow = matchesCity && matchesType && matchesSearch;

    card.style.display = shouldShow ? "" : "none";
    if (shouldShow) {
      card.style.setProperty("--stagger", visibleIndex);
      visibleIndex += 1;
      visible += 1;
    }
  });

  dishCards.forEach((card) => card.classList.remove("ai-highlight"));

  let empty = document.getElementById("empty");
  if (!empty) {
    empty = document.createElement("div");
    empty.id = "empty";
    empty.innerHTML = '<span class="material-symbols-rounded">restaurant</span><p>No dishes found. Try another city, category, or search.</p>';
    document.getElementById("grid").appendChild(empty);
  }
  empty.style.display = visible === 0 ? "block" : "none";
  updateAiPrompt(visible);
}

function updateAiPrompt(visible) {
  if (!aiPickText) return;
  if (visible === 0) {
    aiPickText.textContent = "No visible dishes yet. Change city, category, or search to get an AI pick.";
    return;
  }
  aiPickText.textContent = `EcoBite AI can compare ${visible} visible deal${visible === 1 ? "" : "s"} by savings, rating, quantity, and your cart.`;
}

function findBestAiPick() {
  const cartIds = new Set(getCart().map((item) => item.id));
  const candidates = dishCards.filter((card) => card.style.display !== "none");
  if (candidates.length === 0) {
    updateAiPrompt(0);
    return;
  }

  const best = candidates.reduce((winner, card) => {
    const original = Number(card.dataset.original);
    const sale = Number(card.dataset.sale);
    const discount = original > 0 ? ((original - sale) / original) * 100 : 0;
    const stars = Number(card.dataset.stars);
    const qty = Number(card.dataset.qty);
    const cartPenalty = cartIds.has(card.dataset.id) ? 18 : 0;
    const urgencyBoost = qty <= 10 ? 12 : 5;
    const score = discount * 1.6 + stars * 12 + urgencyBoost - cartPenalty;
    return score > winner.score ? { card, score, discount } : winner;
  }, { card: candidates[0], score: -Infinity, discount: 0 });

  dishCards.forEach((card) => card.classList.remove("ai-highlight"));
  best.card.classList.add("ai-highlight");
  best.card.scrollIntoView({ behavior: "smooth", block: "center" });

  aiPickText.textContent = `AI pick: ${best.card.dataset.name} from ${best.card.dataset.hotel}. It has ${Math.round(best.discount)}% savings, ${best.card.dataset.stars} rating, and ${best.card.dataset.qty} portions left.`;
}

function cardToCartItem(card) {
  return {
    id: card.dataset.id,
    name: card.dataset.name,
    hotel: card.dataset.hotel,
    place: card.dataset.place,
    type: card.dataset.type === "Veg" ? "Veg" : "Non-Veg",
    original: Number(card.dataset.original),
    sale: Number(card.dataset.sale),
    time: card.dataset.time,
    image: card.dataset.image,
    qty: 1,
  };
}

function addToCart(id) {
  /* ── Auth check: redirect non-logged-in users ── */
  if (!isLoggedIn()) {
    showAuthToast();
    setTimeout(() => { window.location.href = "login.html"; }, 1200);
    return;
  }

  const card = dishCards.find((dish) => dish.dataset.id === id);
  if (!card) return;

  const cart = getCart();
  const existing = cart.find((item) => item.id === id);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push(cardToCartItem(card));
  }

  saveCart(cart);
  updateCount();

  /* ── Add to cart pop animation + particle burst ── */
  const btn = card.querySelector(`[data-add-id="${id}"]`);
  if (btn) {
    btn.classList.add("pop");
    setTimeout(() => btn.classList.remove("pop"), 400);

    // Particle burst
    const rect = btn.getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      const span = document.createElement("span");
      span.className = "cart-particle";
      const angle = (Math.PI * 2 * i) / 8;
      const dist = 20 + Math.random() * 20;
      span.style.setProperty("--px", `${Math.cos(angle) * dist}px`);
      span.style.setProperty("--py", `${Math.sin(angle) * dist}px`);
      span.style.left = `${rect.left + rect.width / 2 - 2.5 + window.scrollX}px`;
      span.style.top = `${rect.top + rect.height / 2 - 2.5 + window.scrollY}px`;
      span.style.background = i % 2 === 0 ? "#2d9b5a" : "#4fcb7a";
      span.style.position = "absolute";
      document.body.appendChild(span);
      setTimeout(() => span.remove(), 600);
    }
  }
}

function incrementCartItem(id) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (item) {
    item.qty += 1;
    saveCart(cart);
    updateCount();
  }
}

function decrementCartItem(id) {
  const cart = getCart();
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty -= 1;
  if (item.qty <= 0) {
    const newCart = cart.filter(i => i.id !== id);
    saveCart(newCart);
  } else {
    saveCart(cart);
  }
  updateCount();
}

function scrollToListings() {
  document.getElementById("listings").scrollIntoView({ behavior: "smooth" });
}

function toggleMenu() {
  const menu = document.getElementById("mobileMenu");
  const icon = document.querySelector("#hamburger .material-symbols-rounded");
  menu.classList.toggle("open");
  icon.textContent = menu.classList.contains("open") ? "close" : "menu";
}

/* ══════════════════════════════════════════════════
   IntersectionObserver — Scroll-Reveal
   ══════════════════════════════════════════════════ */
function initScrollReveal() {
  const revealEls = document.querySelectorAll(".reveal");
  if (!revealEls.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -50px 0px" });

  revealEls.forEach((el) => observer.observe(el));
}

/* ══════════════════════════════════════════════════
   Stats Counter Ticker
   ══════════════════════════════════════════════════ */
function parseStatValue(text) {
  text = text.trim();
  // '2.4L+' → { prefix:'', num:2.4, suffix:'L+' }
  // '840+'  → { prefix:'', num:840, suffix:'+' }
  // 'Rs. 18Cr' → { prefix:'Rs. ', num:18, suffix:'Cr' }
  // '32 Cities' → { prefix:'', num:32, suffix:' Cities' }
  const match = text.match(/^([^\d]*?)([\d.]+)\s*(.*)$/);
  if (!match) return null;
  return { prefix: match[1], num: parseFloat(match[2]), suffix: match[3] };
}

function animateCounter(el, parsed, duration) {
  const start = performance.now();
  const isFloat = !Number.isInteger(parsed.num);
  const decimalPlaces = isFloat ? (parsed.num.toString().split(".")[1] || "").length : 0;

  function tick(now) {
    let progress = Math.min((now - start) / duration, 1);
    // ease-out quad
    progress = 1 - (1 - progress) * (1 - progress);
    const current = parsed.num * progress;
    el.textContent = parsed.prefix + (isFloat ? current.toFixed(decimalPlaces) : Math.round(current)) + parsed.suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function initStatCounters() {
  const statEls = document.querySelectorAll(".stat");
  const observedStats = new Set();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !observedStats.has(entry.target)) {
        observedStats.add(entry.target);
        const numEl = entry.target.querySelector(".statnum");
        if (!numEl) return;
        const parsed = parseStatValue(numEl.textContent);
        if (parsed) animateCounter(numEl, parsed, 1800);
      }
    });
  }, { threshold: 0.15 });

  statEls.forEach((el) => observer.observe(el));
}

/* ══════════════════════════════════════════════════
   Food Card 3D Tilt Hover Effect
   ══════════════════════════════════════════════════ */
function initCardTilt() {
  const MAX_TILT = 4;

  document.querySelectorAll(".item").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      card.style.transform = `perspective(800px) rotateY(${dx * MAX_TILT}deg) rotateX(${-dy * MAX_TILT}deg) translateY(-5px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

/* ══════════════════════════════════════════════════
   AI Chatbot
   ══════════════════════════════════════════════════ */
function initChatbot() {
  const fab = document.getElementById("aiFab");
  const panel = document.getElementById("aiChat");
  const closeBtn = document.getElementById("aiChatClose");
  const field = document.getElementById("aiChatField");
  const sendBtn = document.getElementById("aiChatSend");
  const messagesEl = document.getElementById("aiChatMessages");
  if (!fab || !panel) return;

  function toggle() { 
    panel.classList.toggle("open"); 
    // Clear chat when closed
    if (!panel.classList.contains("open")) {
      setTimeout(() => {
        messagesEl.innerHTML = "";
        addMsg("Hi! I'm EcoBite AI 🌿 Ask me to find dishes by city, type, price, or get my best pick!", "bot");
      }, 300);
    }
  }
  fab.addEventListener("click", toggle);
  closeBtn.addEventListener("click", toggle);

  function addMsg(text, sender) {
    const bubble = document.createElement("div");
    bubble.className = `ai-msg ai-msg-${sender}`;
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTypingThenReply(text) {
    const typing = document.createElement("div");
    typing.className = "ai-msg ai-msg-bot ai-typing";
    typing.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    setTimeout(() => {
      typing.remove();
      addMsg(text, "bot");
    }, 800);
  }

  function buildGeminiContext() {
    const visible = dishCards.filter(c => c.style.display !== "none");
    const cartItems = getCart();
    let ctx = "You are EcoBite AI — a friendly, helpful food assistant for a rescued-food platform in India.\n";
    ctx += "Available food deals right now:\n";
    visible.forEach(c => {
      ctx += `- ${c.dataset.name} from ${c.dataset.hotel} (${c.dataset.place}), ${c.dataset.type}, was Rs.${c.dataset.original} now Rs.${c.dataset.sale}, rating ${c.dataset.stars}, ${c.dataset.qty} left, delivery ${c.dataset.time}\n`;
    });
    if (cartItems.length > 0) {
      ctx += "\nUser's cart:\n";
      cartItems.forEach(i => ctx += `- ${i.name} x${i.qty} @ Rs.${i.sale}\n`);
    }
    ctx += "\nCRITICAL RULES: Keep answers EXTREMELY short (1-2 sentences max). Be enthusiastic. Use relevant emojis. DO NOT use markdown, bold text, or bullet points. Just reply in simple plain text.";
    return ctx;
  }

  function localFallback(lower) {
    if (/\bnon[-\s]?veg\b/.test(lower)) {
      pickedType = "NonVeg";
      refreshFilters();
      filterCards();
      const count = dishCards.filter((c) => c.style.display !== "none").length;
      return `🍗 Showing ${count} non-veg deal${count !== 1 ? "s" : ""}. Check the listings!`;
    } else if (/\bveg\b/.test(lower)) {
      pickedType = "Veg";
      refreshFilters();
      filterCards();
      const count = dishCards.filter((c) => c.style.display !== "none").length;
      return `🥦 Showing ${count} veg deal${count !== 1 ? "s" : ""}. Check the listings!`;
    } else if (/\b(delhi|mumbai|bengaluru|hyderabad|jaipur)\b/i.test(lower)) {
      const cityMatch = lower.match(/\b(delhi|mumbai|bengaluru|hyderabad|jaipur)\b/i)[1];
      const cityName = cityMatch.charAt(0).toUpperCase() + cityMatch.slice(1);
      pickedCity = cityName;
      pickedType = "All";
      refreshFilters();
      filterCards();
      const count = dishCards.filter((c) => c.style.display !== "none").length;
      return `📍 Filtered to ${cityName} — ${count} deal${count !== 1 ? "s" : ""} available!`;
    } else if (/\b(under|below)\s+(\d+)/.test(lower)) {
      const priceLimit = Number(lower.match(/\b(under|below)\s+(\d+)/)[2]);
      pickedCity = "All";
      pickedType = "All";
      refreshFilters();
      dishCards.forEach((card) => {
        const sale = Number(card.dataset.sale);
        card.style.display = sale <= priceLimit ? "" : "none";
      });
      const count = dishCards.filter((c) => c.style.display !== "none").length;
      return `💰 Found ${count} deal${count !== 1 ? "s" : ""} under Rs. ${priceLimit}!`;
    } else if (/\b(best|top|recommend)\b/.test(lower)) {
      pickedCity = "All";
      pickedType = "All";
      refreshFilters();
      filterCards();
      findBestAiPick();
      return "⭐ I've highlighted my best pick! Scroll down to the listings.";
    } else if (/\b(cheap|cheapest|lowest)\b/.test(lower)) {
      pickedCity = "All";
      pickedType = "All";
      refreshFilters();
      filterCards();
      const visible = dishCards.filter((c) => c.style.display !== "none");
      if (visible.length) {
        const cheapest = visible.reduce((a, b) => Number(a.dataset.sale) < Number(b.dataset.sale) ? a : b);
        dishCards.forEach((c) => c.classList.remove("ai-highlight"));
        cheapest.classList.add("ai-highlight");
        cheapest.scrollIntoView({ behavior: "smooth", block: "center" });
        return `🏷️ Cheapest deal: ${cheapest.dataset.name} at Rs. ${cheapest.dataset.sale}!`;
      }
      return "No deals visible right now. Try broadening your filters.";
    }
    return "🤔 I can help you find food! Try:\n• \"veg\" or \"non-veg\"\n• A city name like \"Mumbai\"\n• \"under 100\" for budget picks\n• \"best\" for my top recommendation";
  }

  async function handleSend() {
    const text = field.value.trim();
    if (!text) return;
    addMsg(text, "user");
    field.value = "";

    const lower = text.toLowerCase();

    // Show typing indicator
    const typing = document.createElement("div");
    typing.className = "ai-msg ai-msg-bot ai-typing";
    typing.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Check if it's a filter command (handle locally for instant UI response)
    const isFilterCmd = /\b(veg|non[-\s]?veg|delhi|mumbai|bengaluru|hyderabad|jaipur)\b/i.test(lower)
      || /\b(under|below)\s+\d+/.test(lower)
      || /\b(best|top|recommend|cheap|cheapest|lowest)\b/.test(lower);

    if (isFilterCmd) {
      const reply = localFallback(lower);
      setTimeout(() => {
        typing.remove();
        addMsg(reply, "bot");
      }, 600);
      return;
    }

    // For general questions, try Gemini AI first
    const context = buildGeminiContext();
    const aiReply = await callGeminiAI(text, context);

    typing.remove();
    if (aiReply) {
      addMsg(aiReply, "bot");
    } else {
      // Gemini unavailable — use smart local fallback
      addMsg(smartLocalReply(lower), "bot");
    }
  }

  /* Smart local AI responses for when Gemini API is unavailable */
  function smartLocalReply(lower) {
    const visible = dishCards.filter(c => c.style.display !== "none");
    const cartItems = getCart();

    // Greetings
    if (/\b(hi|hello|hey|namaste|hola)\b/.test(lower)) {
      return "Namaste! 🙏 I'm EcoBite AI. I can help you find the best rescue food deals! Try asking about cities, budget, cuisine type, or just say \"best deal\"!";
    }
    // Thank you
    if (/\b(thanks|thank you|shukriya|dhanyavaad)\b/.test(lower)) {
      return "You're welcome! 😊 Happy to help you save food and money. Enjoy your meal! 🌿";
    }
    // Delivery questions
    if (/\b(deliver|delivery|time|fast|quick|kitna time)\b/.test(lower)) {
      return "🚀 Most deliveries take 25-40 minutes! All our partner hotels offer same-day home delivery. Order now for the freshest rescue meals!";
    }
    // Payment questions
    if (/\b(pay|payment|upi|card|cash|cod)\b/.test(lower)) {
      return "💳 We accept UPI (GPay, PhonePe, Paytm), Credit/Debit Cards (Visa, Mastercard, RuPay), and Cash on Delivery. Safe & secure!";
    }
    // Quality / freshness
    if (/\b(fresh|quality|safe|hygiene|stale)\b/.test(lower)) {
      return "✅ All meals are fresh surplus from premium hotels — prepared the same day. Our partner hotels are Eco Certified and follow strict hygiene standards!";
    }
    // How it works
    if (/\b(how|works|kaise|kya hai|what is)\b/.test(lower)) {
      return "🌿 EcoBite rescues surplus meals from top hotels at up to 80% off!\n\n1️⃣ Browse deals\n2️⃣ Place order\n3️⃣ Get home delivery\n4️⃣ Save food & money!";
    }
    // Cart / order
    if (/\b(cart|order|checkout)\b/.test(lower)) {
      if (cartItems.length > 0) {
        const total = cartItems.reduce((s, i) => s + i.sale * i.qty, 0);
        return `🛒 You have ${cartItems.length} item(s) in your cart totaling Rs. ${total}. Click the cart icon to checkout!`;
      }
      return "🛒 Your cart is empty! Browse the deals above and click \"Add\" to start your rescue order.";
    }
    // Deals count
    if (/\b(how many|count|deals|available|kitne)\b/.test(lower)) {
      return `📊 There are ${visible.length} deal${visible.length !== 1 ? "s" : ""} available right now! Scroll up to check them out.`;
    }
    // Help
    if (/\b(help|menu|options|kya kar)\b/.test(lower)) {
      return "🤖 Here's what I can do:\n• \"veg\" / \"non-veg\" → filter by type\n• \"Mumbai\" → filter by city\n• \"under 100\" → budget filter\n• \"best\" → AI top pick\n• \"cheapest\" → lowest price\n• Ask about delivery, payment, quality!";
    }

    // Default with current deals info
    if (visible.length > 0) {
      const randomDeal = visible[Math.floor(Math.random() * visible.length)];
      return `🍽️ I'm not sure about that, but here's a hot deal: ${randomDeal.dataset.name} from ${randomDeal.dataset.hotel} at just Rs. ${randomDeal.dataset.sale} (${randomDeal.dataset.stars}⭐)!\n\nTry: \"best deal\", \"veg\", \"under 100\", or a city name!`;
    }
    return "🤔 I can help you find food! Try:\n• \"veg\" or \"non-veg\"\n• A city name like \"Mumbai\"\n• \"under 100\" for budget picks\n• \"best\" for my top recommendation";
  }

  sendBtn.addEventListener("click", handleSend);
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });

  // Welcome message
  setTimeout(() => addMsg("Hi! I'm EcoBite AI 🌿 Ask me to find dishes by city, type, price, or get my best pick!", "bot"), 300);
}


/* ══════════════════════════════════════════════════
   Floating Hero Particles
   ══════════════════════════════════════════════════ */
function initHeroParticles() {
  const hero = document.getElementById("hero");
  if (!hero) return;

  for (let i = 0; i < 14; i++) {
    const p = document.createElement("div");
    p.className = "hero-particle";
    const size = 3 + Math.random() * 3;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.bottom = `${-10 - Math.random() * 20}%`;
    p.style.animationDelay = `${Math.random() * 6}s`;
    p.style.animationDuration = `${6 + Math.random() * 6}s`;
    p.style.opacity = `${0.2 + Math.random() * 0.4}`;
    p.style.background = i % 3 === 0 ? "rgba(255,255,255,0.5)" : "rgba(79,203,122,0.45)";
    hero.appendChild(p);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function listingCity(listing) {
  if (listing.city && listing.city !== "All") return listing.city;
  const parts = String(listing.place || "").split(",");
  return parts[parts.length - 1]?.trim() || "All";
}

function renderBackendListings(listings) {
  const grid = document.getElementById("grid");
  if (!grid) return;

  if (!Array.isArray(listings) || listings.length === 0) {
    grid.innerHTML = "";
    dishCards = [];
    return;
  }

  const activeListings = listings.filter((listing) => listing.status !== "soldout" && Number(listing.qty) > 0 && listing.ownerId);
  if (!activeListings.length) {
    grid.innerHTML = "";
    dishCards = [];
    return;
  }

  const accents = ["accent-orange", "accent-red", "accent-green", "accent-yellow", "accent-purple"];
  grid.innerHTML = activeListings.map((listing, index) => {
    const accent = accents[index % accents.length];
    const id = escapeHtml(listing.id);
    const name = escapeHtml(listing.name);
    const hotel = escapeHtml(listing.hotel || "EcoBite Partner");
    const city = escapeHtml(listingCity(listing));
    const place = escapeHtml(listing.place || city);
    const type = listing.type === "NonVeg" ? "NonVeg" : "Veg";
    const typeLabel = type === "NonVeg" ? "Non-Veg" : "Veg";
    const original = Number(listing.original || 0);
    const sale = Number(listing.sale || 0);
    const discount = original > 0 ? Math.round(((original - sale) / original) * 100) : 0;
    const image = escapeHtml(listing.image || "FOOD IMAGES/dm.jpg.jpeg");
    const time = escapeHtml(listing.time || "30-40 min");
    const qty = Number(listing.qty || 0);
    const stars = Number(listing.stars || 4.6).toFixed(1);

    return `
      <article class="item reveal" data-id="${id}" data-name="${name}" data-hotel="${hotel}"
        data-city="${city}" data-place="${place}" data-type="${type}" data-original="${original}"
        data-sale="${sale}" data-stars="${stars}" data-time="${time}" data-qty="${qty}" data-image="${image}">
        <div class="top ${accent}">
          <img class="dishimg" src="${image}" alt="${name}" />
          <span class="tag1 ${accent}">${discount}% OFF</span>
          <span class="tag2 ${type === "NonVeg" ? "nonvegtype" : "vegtype"}">${typeLabel}</span>
        </div>
        <div class="body">
          <div class="hotel">${hotel}</div>
          <div class="name">${name}</div>
          <div class="loc"><span class="material-symbols-rounded">location_on</span> ${place}</div>
          <div class="meta"><span><span class="material-symbols-rounded">star</span> ${stars}</span><span><span class="material-symbols-rounded">schedule</span> ${time}</span></div>
          <div class="qty ${qty < 10 ? "qty-low" : "qty-ok"}"><span class="material-symbols-rounded">${qty < 10 ? "local_fire_department" : "inventory_2"}</span> ${qty} left</div>
          <div class="foot">
            <div class="pricing"><span class="mrp">Rs. ${original}</span><span class="sell">Rs. ${sale}</span><span class="off">${discount}% OFF</span></div>
            <button class="addbtn ${accent}" data-add-id="${id}">Add</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  dishCards = Array.from(document.querySelectorAll(".item"));
}

async function hydrateBackendData() {
  try {
    const user = await getSignedInUser();
    // RBAC: Hotel users cannot access the user homepage
    if (user && user.role === "hotel") {
      window.location.href = "dashboard.html";
      return;
    }
    // Clear stale local cart before loading backend cart (fixes cart persistence bug)
    if (user) {
      localStorage.removeItem(CART_KEY);
    }
    const [cart, listings] = await Promise.all([
      loadBackendCart(),
      getBackendListings([]),
    ]);
    if (Array.isArray(cart)) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    }
    renderBackendListings(listings);
  } catch (error) {
    console.error("Backend hydration failed:", error);
  }
}

/* ══════════════════════════════════════════════════
   Init
   ══════════════════════════════════════════════════ */
await hydrateBackendData();
buildFilters();
updateCount();
filterCards();

document.getElementById("cart").addEventListener("click", () => {
  if (!isLoggedIn()) {
    showAuthToast();
    setTimeout(() => { window.location.href = "login.html"; }, 1200);
    return;
  }
  window.location.href = "cart.html";
});
document.getElementById("loginbtn").addEventListener("click", () => {
  window.location.href = "login.html";
});
document.getElementById("hamburger").addEventListener("click", toggleMenu);
document.querySelectorAll(".mobile-menu-link").forEach((link) => link.addEventListener("click", toggleMenu));
document.getElementById("findbtn").addEventListener("click", scrollToListings);
document.getElementById("aiPickBtn").addEventListener("click", geminiAiPick);
searchInput.addEventListener("input", filterCards);

cityGroup.addEventListener("click", (event) => {
  const button = event.target.closest("[data-city]");
  if (!button) return;
  pickedCity = button.dataset.city;
  refreshFilters();
  filterCards();
});

catGroup.addEventListener("click", (event) => {
  const button = event.target.closest("[data-type]");
  if (!button) return;
  pickedType = button.dataset.type;
  refreshFilters();
  filterCards();
});

document.getElementById("grid").addEventListener("click", (event) => {
  const incBtn = event.target.closest('[data-qty-inc]');
  const decBtn = event.target.closest('[data-qty-dec]');
  if (incBtn) { incrementCartItem(incBtn.dataset.qtyInc); return; }
  if (decBtn) { decrementCartItem(decBtn.dataset.qtyDec); return; }
  const button = event.target.closest('[data-add-id]');
  if (!button || button.classList.contains('added')) return;
  addToCart(button.dataset.addId);
});

window.addEventListener("storage", updateCount);

/* ── Auth Toast for non-logged-in users ── */
function showAuthToast() {
  let toast = document.getElementById("authToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "authToast";
    toast.style.cssText = `
      position: fixed; bottom: -80px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #1a2e1a, #2d9b5a); color: white;
      padding: 16px 28px; border-radius: 16px; display: flex; align-items: center;
      gap: 12px; font-size: 15px; font-weight: 600; font-family: 'Montserrat', sans-serif;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 999;
      transition: bottom 0.4s cubic-bezier(.22,.61,.36,1);
    `;
    toast.innerHTML = '<span class="material-symbols-rounded" style="font-size:24px">login</span> Please log in to add items to your cart';
    document.body.appendChild(toast);
  }
  requestAnimationFrame(() => { toast.style.bottom = "32px"; });
  setTimeout(() => { toast.style.bottom = "-80px"; }, 2000);
}

/* ── Smooth scroll for nav anchor links ── */
document.querySelectorAll('#links a[href^="#"], #mobileMenu a[href^="#"]').forEach(link => {
  link.addEventListener("click", (e) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (target) {
      e.preventDefault();
      const navHeight = document.getElementById("navbar").offsetHeight;
      const targetPos = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
      window.scrollTo({ top: targetPos, behavior: "smooth" });
    }
  });
});

/* ── Gemini-powered AI Pick button ── */
async function geminiAiPick() {
  const visible = dishCards.filter(c => c.style.display !== "none");
  if (visible.length === 0) {
    updateAiPrompt(0);
    return;
  }

  aiPickText.textContent = "✨ AI is analyzing deals...";

  const dealsInfo = visible.map(c =>
    `${c.dataset.name} from ${c.dataset.hotel}: was Rs.${c.dataset.original} now Rs.${c.dataset.sale}, rating ${c.dataset.stars}, ${c.dataset.qty} left`
  ).join("\n");

  const sysPrompt = "You are a food recommendation AI. DO NOT use markdown, bold text, or formatting. Reply in plain text only.";
  const prompt = `From these rescue food deals, pick the single best value deal and explain why in one short sentence. Reply with just the dish name and your reason.\n\nDeals:\n${dealsInfo}`;

  const aiResponse = await callGeminiAI(prompt, sysPrompt);
  if (aiResponse) {
    // Still highlight the best programmatically
    findBestAiPick();
    aiPickText.textContent = `🤖 ${aiResponse}`;
  } else {
    // Fallback to local logic
    findBestAiPick();
  }
}

// Initialize new features
initScrollReveal();
initStatCounters();
initCardTilt();
initChatbot();
initHeroParticles();

// ══════════════════════════════════════════════════
// Profile Dropdown — Zomato-style
// ══════════════════════════════════════════════════
(function initProfile() {
  const loginBtn = document.getElementById("loginbtn");
  const profileWrap = document.getElementById("profileWrap");
  const profileBtn = document.getElementById("profileBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!profileWrap) return;

  if (isLoggedIn()) {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY));
    const name = auth.name || "User";
    const email = auth.email || "";
    const initial = name.charAt(0).toUpperCase();

    // Hide login, show profile
    loginBtn.style.display = "none";
    profileWrap.style.display = "block";

    // Fill avatar + name
    const profileAvatar = document.getElementById("profileAvatar");
    const profileBigAvatar = document.getElementById("profileBigAvatar");
    if (auth.photoURL) {
      profileAvatar.innerHTML = `<img src="${auth.photoURL}" alt="Profile" />`;
      profileBigAvatar.innerHTML = `<img src="${auth.photoURL}" alt="Profile" />`;
    } else {
      profileAvatar.textContent = initial;
      profileBigAvatar.textContent = initial;
    }
    document.getElementById("profileName").textContent = name;
    document.getElementById("profileFullName").textContent = name;
    document.getElementById("profileEmail").textContent = email;

    // Toggle dropdown on click
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profileWrap.classList.toggle("open");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!profileWrap.contains(e.target)) {
        profileWrap.classList.remove("open");
      }
    });

    // Close dropdown when clicking a menu link
    profileWrap.querySelectorAll(".profileItem[href]").forEach(link => {
      link.addEventListener("click", () => {
        profileWrap.classList.remove("open");
      });
    });

    // Logout
    logoutBtn.addEventListener("click", async () => {
      await logoutUser();
      localStorage.removeItem(CART_KEY);
      window.location.reload();
    });
  } else {
    loginBtn.style.display = "";
    profileWrap.style.display = "none";
  }
})();
