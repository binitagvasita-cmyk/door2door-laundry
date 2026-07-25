/* ============================================================
   Door2Door Laundry — track-order.js
   Handles:
     • Header + Footer component loading (self-contained, no home.js needed)
     • Auth state check → shows "My Orders" hint when logged in
     • Track by Order ID (calls OrdersAPI.track)
     • "My Orders" list (calls OrdersAPI.getMyOrders)
     • Timeline rendering
     • URL param: ?order=1042 auto-tracks on page load
   ============================================================ */

"use strict";

/* ─────────────────────────────────────────
   1. COMPONENT LOADER  (same pattern as home.js / login.js)
───────────────────────────────────────── */

async function loadComponent(placeholderId, filePath) {
  const el = document.getElementById(placeholderId);
  if (!el) return;
  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`Failed: ${filePath}`);
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const component = doc.body.firstElementChild;
    if (component) el.replaceWith(component);
  } catch (err) {
    console.warn(`Component load error (${filePath}):`, err.message);
  }
}

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = resolve;
    document.body.appendChild(s);
  });
}

/* ─────────────────────────────────────────
   2. STATUS CONFIG
───────────────────────────────────────── */

const STATUS_STEPS = [
  { key: "pending",           label: "Order\nPlaced",       icon: "📋" },
  { key: "confirmed",         label: "Confirmed",           icon: "✅" },
  { key: "picked_up",         label: "Picked\nUp",          icon: "🚗" },
  { key: "in_process",        label: "Washing",             icon: "🧺" },
  { key: "out_for_delivery",  label: "Out for\nDelivery",   icon: "🛵" },
  { key: "delivered",         label: "Delivered",           icon: "🎉" },
];

const STATUS_LABELS = {
  pending:          "Pending",
  confirmed:        "Confirmed",
  picked_up:        "Picked Up",
  in_process:       "In Process",
  out_for_delivery: "Out for Delivery",
  delivered:        "Delivered",
  cancelled:        "Cancelled",
};

const PAYMENT_LABELS = {
  paid:    "💳 Paid",
  pending: "⏳ Payment Pending",
};

const PAYMENT_PILL_CLASS = {
  paid:    "s-paid",
  pending: "s-pending-pay",
};

function formatPaymentMethod(method) {
  if (method === "online") return "Paid Online / UPI";
  if (method === "cod")    return "Cash on Delivery";
  return "";
}

function getStatusIndex(status) {
  return STATUS_STEPS.findIndex((s) => s.key === status);
}

/* ─────────────────────────────────────────
   3. HELPERS
───────────────────────────────────────── */

function $(id) { return document.getElementById(id); }

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return dateStr; }
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return dateStr; }
}

function formatAmount(val) {
  if (!val && val !== 0) return null;
  return `₹${parseFloat(val).toFixed(2)}`;
}

function setLoading(on) {
  const btn    = $("trackBtn");
  const text   = $("trackText");
  const spin   = $("trackSpinner");
  const arrow  = $("trackArrow");
  if (btn)   btn.disabled = on;
  if (text)  text.style.display = on ? "none" : "";
  if (spin)  spin.style.display = on ? "inline-block" : "none";
  if (arrow) arrow.style.display = on ? "none" : "";
}

function showSearchError(msg) {
  const box = $("searchError");
  const txt = $("searchErrorMsg");
  if (!box) return;
  if (msg) {
    if (txt) txt.textContent = msg;
    box.style.display = "flex";
  } else {
    box.style.display = "none";
  }
}

/* ─────────────────────────────────────────
   4. TIMELINE RENDERER
───────────────────────────────────────── */

function renderTimeline(status) {
  const container = $("orderTimeline");
  if (!container) return;

  const isCancelled = status === "cancelled";
  const activeIdx   = getStatusIndex(status);

  container.innerHTML = "";

  STATUS_STEPS.forEach((step, i) => {
    const stepEl = document.createElement("div");
    stepEl.className = "timeline-step";

    let stateClass = "";
    if (isCancelled) {
      stateClass = i === 0 ? "done" : (i === 1 ? "cancelled" : "");
    } else {
      if (i < activeIdx)       stateClass = "done";
      else if (i === activeIdx) stateClass = "active";
    }
    if (stateClass) stepEl.classList.add(stateClass);

    // Icon inside dot
    let dotContent = "";
    if (isCancelled && i === 1) {
      dotContent = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    } else if (stateClass === "done") {
      dotContent = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else {
      dotContent = `<span style="font-size:1rem;line-height:1">${step.icon}</span>`;
    }

    stepEl.innerHTML = `
      <div class="step-dot">${dotContent}</div>
      <span class="step-label">${step.label.replace("\n", "<br>")}</span>
    `;
    container.appendChild(stepEl);
  });
}

/* ─────────────────────────────────────────
   5. RESULT PANEL RENDERER
───────────────────────────────────────── */

function showResultPanel(order) {
  // Hide search card, show result panel
  const searchCard  = $("searchCard");
  const resultPanel = $("resultPanel");
  const ordersPanel = $("ordersListPanel");
  if (searchCard)  searchCard.style.display  = "none";
  if (ordersPanel) ordersPanel.style.display = "none";
  if (resultPanel) resultPanel.style.display = "block";

  // ── Header fields ──
  const rOrderId   = $("rOrderId");
  const rService   = $("rServiceName");
  const rPlaced    = $("rPlacedDate");
  const rStatusPill = $("rStatusPill");

  if (rOrderId)   rOrderId.textContent   = order.id;
  if (rService)   rService.textContent   = order.service_name || "—";
  if (rPlaced)    rPlaced.textContent    = "Placed on " + formatDateTime(order.created_at);

  // Status pill
  if (rStatusPill) {
    const cls = "s-" + (order.status || "pending").replace(/_/g, "_");
    rStatusPill.className  = "status-pill " + cls;
    rStatusPill.textContent = STATUS_LABELS[order.status] || order.status;
  }

  // Payment pill + method note — remember order id for the Download Bill button
  window._currentTrackedOrderId = order.id;
  const rPaymentPill = $("rPaymentPill");
  const rPaymentMethodNote = $("rPaymentMethodNote");
  if (rPaymentPill) {
    const payStatus = order.payment_status || "pending";
    rPaymentPill.className = "status-pill " + (PAYMENT_PILL_CLASS[payStatus] || "s-pending-pay");
    rPaymentPill.textContent = PAYMENT_LABELS[payStatus] || payStatus;
  }
  if (rPaymentMethodNote) {
    rPaymentMethodNote.textContent = formatPaymentMethod(order.payment_method);
  }

  // ── Timeline ──
  renderTimeline(order.status);

  // ── Detail cards ──
  const rPickupDate     = $("rPickupDate");
  const rPickupTimeCard = $("rPickupTimeCard");
  const rPickupTime     = $("rPickupTime");
  const rAddress        = $("rAddress");
  const rAmountCard     = $("rAmountCard");
  const rAmount         = $("rAmount");

  if (rPickupDate) rPickupDate.textContent = formatDate(order.pickup_date);

  if (order.pickup_time) {
    if (rPickupTimeCard) rPickupTimeCard.style.display = "flex";
    if (rPickupTime)     rPickupTime.textContent = order.pickup_time;
  } else {
    if (rPickupTimeCard) rPickupTimeCard.style.display = "none";
  }

  if (rAddress) rAddress.textContent = order.delivery_address || "—";

  const amt = formatAmount(order.total_amount);
  if (amt) {
    if (rAmountCard) rAmountCard.style.display = "flex";
    if (rAmount)     rAmount.textContent = amt;
  } else {
    if (rAmountCard) rAmountCard.style.display = "none";
  }

  // ── Special instructions ──
  const noteRow = $("rNoteRow");
  const noteEl  = $("rNote");
  if (order.special_instructions) {
    if (noteEl)  noteEl.textContent = order.special_instructions;
    if (noteRow) noteRow.style.display = "flex";
  } else {
    if (noteRow) noteRow.style.display = "none";
  }
}

/* ─────────────────────────────────────────
   6. TRACK BY ORDER ID
───────────────────────────────────────── */

window.trackOrder = async function () {
  showSearchError("");

  if (!window.Auth || !Auth.isLoggedIn()) {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `login.html?returnTo=${returnTo}`;
    return;
  }

  const input   = $("orderIdInput");
  const orderId = (input?.value || "").trim();

  if (!orderId || isNaN(orderId) || parseInt(orderId) <= 0) {
    showSearchError("Please enter a valid order ID number.");
    input?.focus();
    return;
  }

  setLoading(true);
  try {
    const res = await OrdersAPI.track(parseInt(orderId));
    if (res?.data) {
      showResultPanel(res.data);
      // Update URL without reload so user can share/bookmark
      history.replaceState(null, "", `?order=${orderId}`);
    } else {
      showSearchError("Order not found. Please check the order ID.");
    }
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      showSearchError("Order not found. Check your order ID or ensure you're logged in with the right account.");
    } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
      showSearchError("Network error. Please check your connection and try again.");
    } else {
      showSearchError(msg || "Something went wrong. Please try again.");
    }
  } finally {
    setLoading(false);
  }
};

/* ─────────────────────────────────────────
   6b. DOWNLOAD BILL
───────────────────────────────────────── */

window.downloadBill = function () {
  const orderId = window._currentTrackedOrderId;
  if (!orderId) return;
  window.open(`invoice.html?order=${orderId}`, "_blank", "noopener");
};

/* ─────────────────────────────────────────
   7. MY ORDERS LIST
───────────────────────────────────────── */

window.loadMyOrders = async function () {
  const searchCard  = $("searchCard");
  const resultPanel = $("resultPanel");
  const ordersPanel = $("ordersListPanel");
  const ordersGrid  = $("ordersGrid");
  const ordersSub   = $("ordersListSub");

  if (searchCard)  searchCard.style.display  = "none";
  if (resultPanel) resultPanel.style.display = "none";
  if (ordersPanel) ordersPanel.style.display = "block";

  if (ordersGrid) ordersGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px 0;color:var(--text-light)">Loading your orders…</div>`;

  try {
    const res = await OrdersAPI.getMyOrders();
    const orders = res?.data || [];

    if (ordersSub) {
      ordersSub.textContent = orders.length
        ? `${orders.length} order${orders.length !== 1 ? "s" : ""} found`
        : "No orders yet";
    }

    if (!orders.length) {
      ordersGrid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:56px 0;color:var(--text-light)">
          <div style="font-size:3rem;margin-bottom:16px">🧺</div>
          <p style="font-size:1rem;font-weight:600;color:var(--text-mid)">No orders yet</p>
          <p style="font-size:0.875rem;margin-top:6px">Book your first laundry pickup!</p>
          <a href="services.html" style="display:inline-flex;align-items:center;gap:8px;margin-top:22px;padding:10px 22px;background:var(--teal);color:#fff;border-radius:10px;font-weight:600;font-size:0.9rem;text-decoration:none;">
            Book Now →
          </a>
        </div>`;
      return;
    }

    ordersGrid.innerHTML = orders.map((o) => {
      const statusCls   = "s-" + o.status.replace(/_/g, "_");
      const statusLabel = STATUS_LABELS[o.status] || o.status;
      const amt         = formatAmount(o.total_amount);

      return `
        <div class="order-card" onclick="window.trackOrderById(${o.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter'||event.key===' ')window.trackOrderById(${o.id})">
          <div class="order-card-head">
            <div>
              <div class="order-card-id">Order #${o.id}</div>
              <div class="order-card-service">${o.service_name || "—"}</div>
              ${o.item_name ? `<div class="order-card-item">${o.item_name}</div>` : ""}
            </div>
            <span class="status-pill ${statusCls}" style="flex-shrink:0">${statusLabel}</span>
          </div>

          <div class="order-card-meta">
            <span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Pickup: ${formatDate(o.pickup_date)}
            </span>
            ${o.quantity > 1 ? `<span>Qty: ${o.quantity}</span>` : ""}
          </div>

          <div class="order-card-footer">
            <span class="order-card-amount">${amt || "—"}</span>
            <span style="font-size:0.8rem;color:var(--teal);font-weight:600">View Details →</span>
          </div>
        </div>`;
    }).join("");

  } catch (err) {
    const msg = err.message || "Failed to load orders.";
    ordersGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 0;color:#dc2626">
        <p>${msg}</p>
        <button onclick="window.loadMyOrders()" style="margin-top:14px;padding:9px 20px;border:1.5px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;">
          Retry
        </button>
      </div>`;
  }
};

/* ─────────────────────────────────────────
   8. TRACK BY ID (from My Orders card click)
───────────────────────────────────────── */

window.trackOrderById = async function (orderId) {
  const searchCard  = $("searchCard");
  const resultPanel = $("resultPanel");
  const ordersPanel = $("ordersListPanel");

  if (ordersPanel) ordersPanel.style.display = "none";
  if (searchCard)  searchCard.style.display  = "block";
  if (resultPanel) resultPanel.style.display = "none";

  const input = $("orderIdInput");
  if (input) input.value = orderId;

  await window.trackOrder();
};

/* ─────────────────────────────────────────
   9. RESET — back to search card
───────────────────────────────────────── */

window.resetTracker = function () {
  const searchCard  = $("searchCard");
  const resultPanel = $("resultPanel");
  const ordersPanel = $("ordersListPanel");

  if (resultPanel) resultPanel.style.display = "none";
  if (ordersPanel) ordersPanel.style.display = "none";
  if (searchCard)  searchCard.style.display  = "block";

  showSearchError("");
  const input = $("orderIdInput");
  if (input) { input.value = ""; input.focus(); }

  history.replaceState(null, "", window.location.pathname);
};

/* ─────────────────────────────────────────
   10. ENTER KEY on input
───────────────────────────────────────── */

function initEnterKey() {
  const input = $("orderIdInput");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); window.trackOrder(); }
  });
}

/* ─────────────────────────────────────────
   11. AUTH STATE → show "My Orders" hint
───────────────────────────────────────── */

function initAuthState() {
  if (window.Auth && Auth.isLoggedIn()) {
    const hint = $("myOrdersHint");
    if (hint) hint.style.display = "flex";
  }
}

/* ─────────────────────────────────────────
   12. CHECK URL PARAMS (auto-track on load)
───────────────────────────────────────── */

function checkUrlParam() {
  try {
    const params  = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    if (orderId && !isNaN(orderId) && parseInt(orderId) > 0) {
      const input = $("orderIdInput");
      if (input) input.value = orderId;
      // Slight delay so DOM + auth are fully ready
      setTimeout(() => window.trackOrder(), 200);
    }
  } catch (_) {}
}

/* ─────────────────────────────────────────
   13. BOOT
───────────────────────────────────────── */

async function boot() {
  // 1. Inject header + footer HTML
  await Promise.all([
    loadComponent("header-placeholder", "./header.html"),
    loadComponent("footer-placeholder", "./footer.html"),
  ]);

  // 2. Load shared scripts in order
  await loadScript("./js/auth.js");
  await loadScript("./js/api.js");
  await loadScript("./js/header.js");

  // 3. Init header (needs the injected HTML to be present)
  if (window.Header) Header.init();

  // 4. Load footer behaviours
  await loadScript("./js/footer.js");

  // 5. Init page-specific behaviour
  initAuthState();
  initEnterKey();
  checkUrlParam();
}

document.addEventListener("DOMContentLoaded", boot);