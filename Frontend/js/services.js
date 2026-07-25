/* ============================================================
   Door2Door Laundry — services.js
   Handles:
     • Header + Footer component loading
     • Fetching all services + sub-items from backend
     • Rendering filter tabs, grid cards, horizontal scroll, table
     • Booking modal:
         – Login-gate: only logged-in users can book
         – Auto-fills name + address from profile
         – Pickup date + time picker
         – Real API call to POST /api/orders/
         – Thank-you email sent server-side after confirm
   ============================================================ */

"use strict";

/* ──────────────────────────────────────────
   COMPONENT LOADER
────────────────────────────────────────── */
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
    s.src = src; s.onload = resolve; s.onerror = resolve;
    document.body.appendChild(s);
  });
}

/* ──────────────────────────────────────────
   STATE
────────────────────────────────────────── */
let activeServiceId = null;
let viewMode = "grid"; // "grid" | "horizontal" | "table"

/* ──────────────────────────────────────────
   GLOBAL VIEW TOGGLE BAR
────────────────────────────────────────── */
function buildGlobalViewBar() {
  const bar = document.createElement("div");
  bar.className = "global-view-bar";
  bar.id = "globalViewBar";
  bar.innerHTML = `
    <span class="global-view-bar__label">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>
      <span>View as</span>
    </span>
    <div class="global-view-bar__btns">
      <button class="view-btn ${viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="Grid view">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span>Grid</span>
      </button>
      <button class="view-btn ${viewMode === 'horizontal' ? 'active' : ''}" data-view="horizontal" title="Horizontal scroll">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="2" y="6" width="5" height="12" rx="1"/><rect x="9.5" y="6" width="5" height="12" rx="1"/>
          <rect x="17" y="6" width="5" height="12" rx="1"/>
          <path d="M0 20h24" stroke-dasharray="2 2"/>
        </svg>
        <span>Horizontal</span>
      </button>
      <button class="view-btn ${viewMode === 'table' ? 'active' : ''}" data-view="table" title="Table view">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
        <span>Table</span>
      </button>
    </div>
  `;
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    setViewMode(btn.dataset.view);
  });
  return bar;
}

function setViewMode(newView) {
  viewMode = newView;
  document.querySelectorAll("#globalViewBar .view-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === newView);
  });
  document.querySelectorAll(".svc-panel").forEach((panel) => {
    const sid = panel.dataset.serviceId;
    const grid        = document.getElementById(`grid-${sid}`);
    const hscrollWrap = document.getElementById(`hscroll-wrap-${sid}`);
    const tableWrap   = document.getElementById(`table-${sid}`);
    if (grid)        grid.style.display        = newView === "grid"       ? "" : "none";
    if (hscrollWrap) hscrollWrap.style.display = newView === "horizontal" ? "" : "none";
    if (tableWrap)   tableWrap.style.display   = newView === "table"      ? "" : "none";
  });
}

/* ──────────────────────────────────────────
   LOAD SERVICES FROM BACKEND
────────────────────────────────────────── */
async function loadServices() {
  const skeleton = document.getElementById("svcSkeleton");
  const errorEl  = document.getElementById("svcError");
  const content  = document.getElementById("svcContent");
  const errMsg   = document.getElementById("svcErrorMsg");

  skeleton.style.display = "";
  errorEl.style.display  = "none";
  content.style.display  = "none";

  try {
    const data = await ServicesAPI.getAllWithItems();
    if (!data.data || !data.data.length) throw new Error("No services found.");

    skeleton.style.display = "none";
    content.style.display  = "";

    renderTabs(data.data);
    renderAllPanels(data.data);
    initReveal();
    // Default to "All Services" — previously defaulted to the first
    // service by display_order (curtain wash has display_order 0, so
    // it was winning the sort and showing pre-filtered instead of "all").
    activateTab("all");
  } catch (err) {
    skeleton.style.display = "none";
    errorEl.style.display  = "";
    errMsg.textContent = err.message || "Could not reach the server.";
    console.error("[Services] Load error:", err);
  }
}

/* ──────────────────────────────────────────
   RENDER TABS
────────────────────────────────────────── */
function renderTabs(services) {
  const tabsEl = document.getElementById("svcTabs");
  tabsEl.innerHTML = "";

  const allBtn = makeTab("all", "🧺", "All Services");
  allBtn.addEventListener("click", () => activateTab("all"));
  tabsEl.appendChild(allBtn);

  services.forEach((svc) => {
    const btn = makeTab(svc.id, svc.icon_emoji || "🧺", svc.name);
    btn.addEventListener("click", () => activateTab(svc.id));
    tabsEl.appendChild(btn);
  });
}

function makeTab(id, emoji, label) {
  const btn = document.createElement("button");
  btn.className = "svc-tab";
  btn.dataset.serviceId = id;
  btn.setAttribute("role", "tab");
  btn.setAttribute("aria-selected", "false");
  btn.innerHTML = `
    <span class="svc-tab__emoji">${emoji}</span>
    <span>${escapeHtml(label)}</span>
  `;
  return btn;
}

function activateTab(serviceId) {
  activeServiceId = serviceId;
  document.querySelectorAll(".svc-tab").forEach((btn) => {
    const isActive = String(btn.dataset.serviceId) === String(serviceId);
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive);
  });
  document.querySelectorAll(".svc-panel").forEach((panel) => {
    if (serviceId === "all") {
      panel.classList.add("active");
    } else {
      panel.classList.toggle("active", String(panel.dataset.serviceId) === String(serviceId));
    }
  });
  setTimeout(initReveal, 50);
}

/* ──────────────────────────────────────────
   RENDER ALL PANELS
────────────────────────────────────────── */
function renderAllPanels(services) {
  const panelsEl = document.getElementById("svcPanels");
  panelsEl.innerHTML = "";
  panelsEl.appendChild(buildGlobalViewBar());
  services.forEach((svc) => panelsEl.appendChild(buildPanel(svc)));
}

function buildPanel(svc) {
  const panel = document.createElement("div");
  panel.className = "svc-panel";
  panel.dataset.serviceId = svc.id;
  const hasItems = svc.items && svc.items.length > 0;
  const priceStr = `₹${parseFloat(svc.price).toFixed(0)}`;

  panel.innerHTML = `
    <div class="svc-panel__header" data-reveal>
      <div class="svc-panel__icon-wrap">${svc.icon_emoji || "🧺"}</div>
      <div class="svc-panel__meta">
        <h2 class="svc-panel__name">${escapeHtml(svc.name)}</h2>
        <p class="svc-panel__desc">${escapeHtml(svc.description || "")}</p>
      </div>
      <div class="svc-panel__right">
        <div class="svc-panel__base-price">
          <span class="price-label">Starting from</span>
          <span class="price-val">${priceStr}</span>
          <span class="price-unit">${escapeHtml(svc.unit || "per kg")}</span>
        </div>
        <button class="btn-book-service"
                data-svc-id="${svc.id}"
                data-svc-name="${escapeHtml(svc.name)}"
                data-svc-price="${parseFloat(svc.price).toFixed(0)}"
                data-svc-unit="${escapeHtml(svc.unit || 'per kg')}"
                data-svc-emoji="${svc.icon_emoji || '🧺'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round">
            <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          Book Service
        </button>
      </div>
    </div>
    <div id="itemsArea-${svc.id}"></div>
  `;

  const itemsArea = panel.querySelector(`#itemsArea-${svc.id}`);
  itemsArea.appendChild(buildItemsSection(svc, hasItems));
  return panel;
}

function buildItemsSection(svc, hasItems) {
  const wrap = document.createElement("div");
  if (!hasItems) {
    wrap.innerHTML = `
      <div class="no-items-note" data-reveal>
        <strong>Pricing:</strong> ₹${parseFloat(svc.price).toFixed(0)} ${escapeHtml(svc.unit)}.
        This service is charged by weight. Drop off your clothes and we'll weigh &amp; quote before proceeding.
      </div>
    `;
    return wrap;
  }

  const toggleRow = document.createElement("div");
  toggleRow.className = "view-toggle";
  toggleRow.innerHTML = `
    <span class="view-toggle__label">${svc.items.length} item${svc.items.length !== 1 ? "s" : ""} available</span>
  `;

  const grid        = buildGrid(svc.items, svc.id);
  const hscrollWrap = buildHorizontalScroll(svc.items, svc.id);
  const tableWrap   = buildTable(svc.items, svc.id);

  grid.style.display        = viewMode === "grid"       ? "" : "none";
  hscrollWrap.style.display = viewMode === "horizontal" ? "" : "none";
  tableWrap.style.display   = viewMode === "table"      ? "" : "none";

  wrap.appendChild(toggleRow);
  wrap.appendChild(grid);
  wrap.appendChild(hscrollWrap);
  wrap.appendChild(tableWrap);
  return wrap;
}

/* ── Card builders ──────────────────────────────────────────── */
function buildCardHTML(item) {
  const imgUrl = item.image_url || null;
  return `
    <div class="item-card__img-wrap">
      ${imgUrl
        ? `<img class="item-card__img" src="${imgUrl}" alt="${escapeHtml(item.name)}" loading="lazy"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <span class="item-card__emoji-fallback" style="display:none">${item.icon_emoji || "👕"}</span>`
        : `<span class="item-card__emoji-fallback" style="display:flex">${item.icon_emoji || "👕"}</span>`
      }
    </div>
    <span class="item-card__emoji item-card__emoji--badge">${item.icon_emoji || "👕"}</span>
    <span class="item-card__name">${escapeHtml(item.name)}</span>
    <span class="item-card__price">₹${parseFloat(item.price).toFixed(0)}</span>
    <span class="item-card__unit">${escapeHtml(item.unit)}</span>
    <button class="btn-book-item"
            data-item-id="${item.id}"
            data-item-name="${escapeHtml(item.name)}"
            data-item-price="${parseFloat(item.price).toFixed(2)}"
            data-item-unit="${escapeHtml(item.unit)}"
            data-item-emoji="${item.icon_emoji || '👕'}"
            data-svc-id="${item.service_id}">
      🛒 Book
    </button>
  `;
}

function buildGrid(items, sid) {
  const grid = document.createElement("div");
  grid.className = "items-grid";
  grid.id = `grid-${sid}`;
  items.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.setAttribute("data-reveal", "");
    card.style.setProperty("--delay", `${i * 40}ms`);
    card.innerHTML = buildCardHTML(item);
    grid.appendChild(card);
  });
  return grid;
}

function buildHorizontalScroll(items, sid) {
  const wrap = document.createElement("div");
  wrap.className = "items-hscroll-wrap";
  wrap.id = `hscroll-wrap-${sid}`;
  wrap.innerHTML = `
    <div class="scroll-hint">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
      Swipe to see more
    </div>
  `;
  const row = document.createElement("div");
  row.className = "items-hscroll";
  items.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.setAttribute("data-reveal", "");
    card.style.setProperty("--delay", `${i * 40}ms`);
    card.innerHTML = buildCardHTML(item);
    row.appendChild(card);
  });
  wrap.appendChild(row);
  return wrap;
}

function buildTable(items, sid) {
  const wrap = document.createElement("div");
  wrap.className = "items-table-wrap";
  wrap.id = `table-${sid}`;
  const rowsHtml = items.map((item, i) => `
    <tr>
      <td style="color:var(--text-light);font-size:.82rem;text-align:center;width:36px;">${i + 1}</td>
      <td class="item-name-cell">
        <span class="item-icon">${item.icon_emoji || "👕"}</span>
        ${escapeHtml(item.name)}
      </td>
      <td><span class="item-unit-badge">${escapeHtml(item.unit)}</span></td>
      <td>₹${parseFloat(item.price).toFixed(0)}</td>
      <td>
        <button class="btn-book-item btn-book-item--table"
                data-item-id="${item.id}"
                data-item-name="${escapeHtml(item.name)}"
                data-item-price="${parseFloat(item.price).toFixed(2)}"
                data-item-unit="${escapeHtml(item.unit)}"
                data-item-emoji="${item.icon_emoji || '👕'}"
                data-svc-id="${item.service_id}">
          🛒 Book
        </button>
      </td>
    </tr>
  `).join("");
  wrap.innerHTML = `
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:36px;">#</th>
          <th>Item / Garment</th>
          <th>Unit</th>
          <th>Price</th>
          <th style="text-align:center;">Action</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
  return wrap;
}

/* ══════════════════════════════════════════════════════════════
   BOOKING MODAL
   • Login-gate: if not logged in, shows a login prompt
   • Auto-fills name + address from Auth + API profile
   • Pickup date (today onwards) + time slot picker
   • Step 1 → Step 2 review → real API call → email sent
══════════════════════════════════════════════════════════════ */
const BookingModal = {
  currentItem: null,
  _userProfile: null,   // cached profile fetched from /api/auth/profile
  _profileFetched: false,
  _lastOrder: null,     // cached most recent order, used to suggest an address
  _lastOrderFetched: false,

  /* ── Init (called once) ─────────────────────────────────── */
  init() {
    if (document.getElementById("bookingModal")) return;

    const overlay = document.createElement("div");
    overlay.id = "bookingModal";
    overlay.className = "bm-overlay";
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("role", "dialog");
    overlay.innerHTML = `
      <div class="bm-box" id="bmBox">
        <button class="bm-close" id="bmClose" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- Step indicator -->
        <div class="bm-steps">
          <div class="bm-step active" id="bmStep1dot">
            <span class="bm-step__num">1</span>
            <span class="bm-step__label">Details</span>
          </div>
          <div class="bm-step-line"></div>
          <div class="bm-step" id="bmStep2dot">
            <span class="bm-step__num">2</span>
            <span class="bm-step__label">Confirm</span>
          </div>
        </div>

        <!-- Login gate (shown when not logged in) -->
        <div id="bmLoginGate" style="display:none; text-align:center; padding:32px 16px;">
          <div style="font-size:3rem; margin-bottom:12px;">🔒</div>
          <h3 style="font-family:'Playfair Display',serif; color:var(--text-dark);
                     font-size:1.25rem; margin-bottom:8px;">Login Required</h3>
          <p style="color:var(--text-body); font-size:.93rem; margin-bottom:24px; line-height:1.6;">
            Please log in to place a booking. Your address and details will be filled in automatically.
          </p>
          <a href="login.html" class="bm-btn-primary"
             style="display:inline-flex; text-decoration:none; width:auto; padding:12px 32px;">
            Go to Login
          </a>
        </div>

        <!-- STEP 1: Booking form -->
        <div id="bmStep1" class="bm-step-content">
          <div class="bm-header">
            <div class="bm-header__emoji" id="bmEmoji">👕</div>
            <div>
              <h3 class="bm-title" id="bmTitle">Item Name</h3>
              <p class="bm-subtitle" id="bmSubtitle">₹0 per piece</p>
            </div>
          </div>
          <div class="bm-form">

            <!-- Auto-fill user info banner -->
            <div id="bmUserBanner" class="bm-user-banner" style="display:none;">
              <span id="bmUserBannerText"></span>
            </div>

            <!-- Quantity -->
            <div class="bm-field">
              <label class="bm-label">Quantity <span id="bmUnitHint" class="bm-unit-hint"></span></label>
              <div class="bm-qty-row">
                <button class="bm-qty-btn" id="bmQtyMinus" aria-label="Decrease">−</button>
                <input class="bm-qty-input" id="bmQty" type="number" value="1" min="1" max="99" />
                <button class="bm-qty-btn" id="bmQtyPlus" aria-label="Increase">+</button>
              </div>
            </div>

            <!-- Pickup Date -->
            <div class="bm-field">
              <label class="bm-label" for="bmPickupDate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Pickup Date
              </label>
              <input class="bm-input" type="date" id="bmPickupDate" />
            </div>

            <!-- Pickup Time -->
            <div class="bm-field">
              <label class="bm-label" for="bmPickupTime">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Preferred Pickup Time
              </label>
              <div class="bm-time-slots" id="bmTimeSlots">
                <button type="button" class="bm-time-btn" data-time="08:00 AM – 10:00 AM">🌅 08–10 AM</button>
                <button type="button" class="bm-time-btn" data-time="10:00 AM – 12:00 PM">☀️ 10–12 PM</button>
                <button type="button" class="bm-time-btn" data-time="12:00 PM – 02:00 PM">🌤️ 12–2 PM</button>
                <button type="button" class="bm-time-btn" data-time="02:00 PM – 05:00 PM">⛅ 2–5 PM</button>
                <button type="button" class="bm-time-btn" data-time="05:00 PM – 08:00 PM">🌆 5–8 PM</button>
              </div>
            </div>

            <!-- Delivery Speed -->
            <div class="bm-field" id="bmDeliverySpeedField">
              <label class="bm-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Delivery Speed
              </label>
              <div class="bm-delivery-opts" id="bmDeliveryOpts">
                <!-- Options injected by JS based on service type -->
              </div>
              <div class="bm-delivery-note" id="bmDeliveryNote" style="display:none;"></div>
            </div>

            <!-- Pickup Address (auto-filled) -->
            <div class="bm-field">
              <label class="bm-label" for="bmAddress">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" style="margin-right:4px;">
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Pickup Address
              </label>
              <textarea class="bm-textarea" id="bmAddress" rows="2"
                        placeholder="Enter your pickup address…"></textarea>
            </div>

            <!-- PIN Code (auto-filled) -->
            <div class="bm-field">
              <label class="bm-label" for="bmPinCode">PIN Code <span class="bm-optional">(optional)</span></label>
              <input class="bm-input" type="text" id="bmPinCode"
                     placeholder="e.g. 395001" maxlength="6" inputmode="numeric" />
            </div>

            <!-- Special Instructions -->
            <div class="bm-field">
              <label class="bm-label">Special Instructions <span class="bm-optional">(optional)</span></label>
              <textarea class="bm-textarea" id="bmInstructions" rows="2"
                        placeholder="e.g. Handle with care, stain on collar…"></textarea>
            </div>

            <!-- Live total -->
            <div class="bm-live-total">
              <span>Estimated Total</span>
              <strong id="bmLiveTotalVal">₹0</strong>
            </div>

            <!-- Payment method -->
            <div class="bm-field">
              <label class="bm-label">Payment Method</label>
              <div class="bm-payment-opts">
                <label class="bm-pay-opt">
                  <input type="radio" name="bm-payment" value="online" id="bmPayOnline" checked />
                  <span class="bm-pay-card">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                      <rect x="1" y="4" width="22" height="16" rx="2"/>
                      <line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                    Online / UPI
                    <em class="bm-pay-badge bm-pay-badge--online">All orders</em>
                  </span>
                </label>
                <label class="bm-pay-opt">
                  <input type="radio" name="bm-payment" value="cod" id="bmPayCod" />
                  <span class="bm-pay-card">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2">
                      <rect x="2" y="6" width="20" height="12" rx="2"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    Cash on Delivery
                    <em class="bm-pay-badge bm-pay-badge--cod">Min ₹100</em>
                  </span>
                </label>
              </div>
              <div class="bm-cod-warn" id="bmCodWarn" style="display:none">
                ⚠️ COD is only available for orders <strong>₹100 or above</strong>.
                Please increase quantity or switch to Online / UPI.
              </div>
            </div>

            <button class="bm-btn-primary" id="bmProceedBtn">
              Review Order
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- STEP 2: Summary + Confirm -->
        <div id="bmStep2" class="bm-step-content" style="display:none">
          <h3 class="bm-summary-title">Order Summary</h3>
          <div class="bm-summary-card" id="bmSummaryCard"></div>
          <div class="bm-summary-actions" id="bmSummaryActions">
            <button class="bm-btn-secondary" id="bmBackBtn">← Edit</button>
            <button class="bm-btn-primary" id="bmConfirmBtn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Confirm Booking
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._bindStaticEvents(overlay);
  },

  /* ── Open (checks login first, then fetches profile) ─────── */
  async open(data) {
    // Login gate — only logged-in users can book
    if (!window.Auth || !Auth.isLoggedIn()) {
      this._showLoginGate();
      document.getElementById("bookingModal").classList.add("open");
      document.body.classList.add("bm-no-scroll");
      return;
    }

    this.currentItem = data;
    this._resetForm();
    this._showStep(1);
    document.getElementById("bookingModal").classList.add("open");
    document.body.classList.add("bm-no-scroll");
    setTimeout(() => document.getElementById("bmClose")?.focus(), 80);

    // Auto-fill from cached profile or fetch fresh
    await this._loadAndFillProfile();
  },

  /* ── Close ──────────────────────────────────────────────── */
  close() {
    document.getElementById("bookingModal").classList.remove("open");
    document.body.classList.remove("bm-no-scroll");
  },

  /* ── Reset form to clean state ──────────────────────────── */
  _resetForm() {
    const item = this.currentItem;
    document.getElementById("bmLoginGate").style.display = "none";
    document.getElementById("bmStep1").style.display     = "";
    document.getElementById("bmQty").value               = 1;
    document.getElementById("bmInstructions").value      = "";
    document.getElementById("bmAddress").value           = "";
    document.getElementById("bmPinCode").value           = "";
    document.getElementById("bmCodWarn").style.display   = "none";
    document.getElementById("bmPayOnline").checked       = true;
    document.getElementById("bmEmoji").textContent       = item.emoji;
    document.getElementById("bmTitle").textContent       = item.name;
    document.getElementById("bmSubtitle").textContent    = `₹${parseFloat(item.price).toFixed(0)} ${item.unit}`;
    document.getElementById("bmUnitHint").textContent    = `(${item.unit})`;
    document.getElementById("bmUserBanner").style.display = "none";

    // Set min date = today
    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("bmPickupDate");
    dateInput.min   = today;
    dateInput.value = "";

    // Clear time slot selection
    document.querySelectorAll(".bm-time-btn").forEach(b => b.classList.remove("active"));

    // ── Delivery Speed options ────────────────────────────────
    // Service ID 1 = Iron (only service that supports Same Day)
    const isIron = String(item.serviceId) === "1";
    const optsEl = document.getElementById("bmDeliveryOpts");
    const noteEl = document.getElementById("bmDeliveryNote");

    if (isIron) {
      optsEl.innerHTML = `
        <label class="bm-delivery-opt">
          <input type="radio" name="bm-delivery" value="same_day" id="bmDeliverySameDay" />
          <span class="bm-delivery-card">
            <span class="bm-delivery-icon">⚡</span>
            <span class="bm-delivery-info">
              <strong>Same Day</strong>
              <em>Ready by evening</em>
            </span>
            <span class="bm-delivery-badge bm-delivery-badge--express">+10%</span>
          </span>
        </label>
        <label class="bm-delivery-opt">
          <input type="radio" name="bm-delivery" value="next_day" id="bmDeliveryNextDay" checked />
          <span class="bm-delivery-card">
            <span class="bm-delivery-icon">📅</span>
            <span class="bm-delivery-info">
              <strong>Next Day</strong>
              <em>Delivered within 24 hrs</em>
            </span>
            <span class="bm-delivery-badge bm-delivery-badge--standard">Standard</span>
          </span>
        </label>
        <label class="bm-delivery-opt">
          <input type="radio" name="bm-delivery" value="no_rush" id="bmDeliveryNoRush" />
          <span class="bm-delivery-card">
            <span class="bm-delivery-icon">🌿</span>
            <span class="bm-delivery-info">
              <strong>No Rush</strong>
              <em>2–3 days, no extra charge</em>
            </span>
            <span class="bm-delivery-badge bm-delivery-badge--norush">Save</span>
          </span>
        </label>
      `;
      noteEl.style.display = "none";
    } else {
      optsEl.innerHTML = `
        <label class="bm-delivery-opt">
          <input type="radio" name="bm-delivery" value="next_day" id="bmDeliveryNextDay" checked />
          <span class="bm-delivery-card">
            <span class="bm-delivery-icon">📅</span>
            <span class="bm-delivery-info">
              <strong>24 Hours</strong>
              <em>Delivered within 24 hrs</em>
            </span>
            <span class="bm-delivery-badge bm-delivery-badge--express">+5%</span>
          </span>
        </label>
        <label class="bm-delivery-opt">
          <input type="radio" name="bm-delivery" value="no_rush" id="bmDeliveryNoRush" />
          <span class="bm-delivery-card">
            <span class="bm-delivery-icon">🌿</span>
            <span class="bm-delivery-info">
              <strong>No Rush</strong>
              <em>2–3 days, standard rate</em>
            </span>
            <span class="bm-delivery-badge bm-delivery-badge--norush">No extra</span>
          </span>
        </label>
      `;
      noteEl.textContent = "ℹ️ Same day delivery is available for Iron service only.";
      noteEl.style.display = "";
    }

    // Reset summary actions buttons
    const sa = document.getElementById("bmSummaryActions");
    if (sa) sa.innerHTML = `
      <button class="bm-btn-secondary" id="bmBackBtn">← Edit</button>
      <button class="bm-btn-primary" id="bmConfirmBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Confirm Booking
      </button>
    `;
    document.getElementById("bmConfirmBtn")?.addEventListener("click", () => this._confirmBooking());
    document.getElementById("bmBackBtn")?.addEventListener("click", () => this._showStep(1));

    this._updateTotal();
  },

  /* ── Show login gate ──────────────────────────────────────── */
  _showLoginGate() {
    document.getElementById("bmLoginGate").style.display = "";
    document.getElementById("bmStep1").style.display     = "none";
    document.getElementById("bmStep2").style.display     = "none";
    document.getElementById("bmStep1dot").classList.remove("active");
    document.getElementById("bmStep2dot").classList.remove("active");
  },

  /* ── Fetch profile and auto-fill fields ───────────────────── */
  async _loadAndFillProfile() {
    try {
      // Try localStorage cache first (from login), then fetch fresh
      const cached = Auth.getUser();
      let profile = this._userProfile;

      if (!profile) {
        // Fetch full profile (has address fields)
        const resp = await AuthAPI.getProfile();
        profile = resp.data;
        this._userProfile = profile;
        this._profileFetched = true;
      }

      // Build address string from saved profile fields
      const parts = [
        profile.apartment,
        profile.building_name,
        profile.street_address,
        profile.landmark,
      ].filter(Boolean);
      let addressStr = parts.join(", ");
      let pinCode = profile.pin_code || "";
      let bannerNote = addressStr ? ` · Address auto-filled` : "";

      // No saved profile address? Fall back to suggesting the delivery
      // address from their most recent order instead of leaving it blank —
      // still fully editable, just a head start.
      if (!addressStr) {
        try {
          if (!this._lastOrderFetched) {
            const ordersRes = await OrdersAPI.getMyOrders(); // newest-first (see routes/orders.py)
            this._lastOrder = (ordersRes?.data || [])[0] || null;
            this._lastOrderFetched = true;
          }
          if (this._lastOrder?.delivery_address) {
            addressStr = this._lastOrder.delivery_address;
            if (this._lastOrder.pin_code) pinCode = this._lastOrder.pin_code;
            bannerNote =
              ` · Suggested from your last order — edit if it's changed, or <a href="profile.html" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">save it to your profile</a> for next time`;
          }
        } catch (_) {
          // No past orders / request failed — leave address blank, handled below.
        }
      }

      // Auto-fill address
      if (addressStr) {
        document.getElementById("bmAddress").value = addressStr;
      }
      if (pinCode) {
        document.getElementById("bmPinCode").value = pinCode;
      }

      // Show banner. If there's genuinely nothing to suggest (no saved
      // profile address AND no past orders), let the customer know why the
      // field below is blank instead of leaving them guessing.
      const name = profile.full_name || cached.name || "";
      if (name || addressStr) {
        const banner = document.getElementById("bmUserBanner");
        document.getElementById("bmUserBannerText").innerHTML =
          `✅ Booking as <strong>${escapeHtml(name)}</strong>` +
          (bannerNote ||
            ` · No saved address yet — type it below, or <a href="profile.html" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">add one to your profile</a> for next time`);
        banner.style.display = "";
      }
    } catch (err) {
      console.warn("[BookingModal] Could not fetch profile:", err.message);
    }
  },

  /* ── Step switch ──────────────────────────────────────────── */
  _showStep(n) {
    document.getElementById("bmStep1").style.display = n === 1 ? "" : "none";
    document.getElementById("bmStep2").style.display = n === 2 ? "" : "none";
    document.getElementById("bmStep1dot").classList.toggle("active", n >= 1);
    document.getElementById("bmStep2dot").classList.toggle("active", n >= 2);
  },

  /* ── Helpers ──────────────────────────────────────────────── */
  _getQty()        { return Math.max(1, parseInt(document.getElementById("bmQty").value) || 1); },
  _getPayment()    { return document.querySelector('input[name="bm-payment"]:checked')?.value || "online"; },
  _getPickupDate() { return document.getElementById("bmPickupDate").value; },
  _getPickupTime() {
    return document.querySelector(".bm-time-btn.active")?.dataset.time || "";
  },
  _getAddress()    { return document.getElementById("bmAddress").value.trim(); },
  _getPinCode()    { return document.getElementById("bmPinCode").value.trim(); },

  _getDeliverySpeed() {
    return document.querySelector('input[name="bm-delivery"]:checked')?.value || "no_rush";
  },
  _getDeliverySurcharge() {
    const speed  = this._getDeliverySpeed();
    const isIron = String(this.currentItem?.serviceId) === "1";
    if (speed === "same_day" && isIron)  return 1.10;   // +10%
    if (speed === "next_day" && !isIron) return 1.05;   // +5%
    return 1.00;                                         // no surcharge
  },
  _getDeliveryLabel() {
    const speed  = this._getDeliverySpeed();
    const isIron = String(this.currentItem?.serviceId) === "1";
    if (speed === "same_day")            return "⚡ Same Day (+10%)";
    if (speed === "next_day" && !isIron) return "📅 24 Hours (+5%)";
    if (speed === "next_day" && isIron)  return "📅 Next Day (Standard)";
    return "🌿 No Rush (Standard)";
  },

  _updateTotal() {
    const base  = this._getQty() * parseFloat(this.currentItem?.price || 0);
    const total = base * this._getDeliverySurcharge();
    const el = document.getElementById("bmLiveTotalVal");
    if (el) el.textContent = `₹${total.toFixed(0)}`;
    return total;
  },

  _checkCod() {
    const warn = document.getElementById("bmCodWarn");
    if (!warn) return;
    warn.style.display = (this._getPayment() === "cod" && this._updateTotal() < 100) ? "" : "none";
  },

  /* ── Validation before proceeding to Step 2 ──────────────── */
  _validate() {
    if (!this._getPickupDate()) {
      this._shake(); this._toast("Please select a pickup date."); return false;
    }
    if (!this._getPickupTime()) {
      this._shake(); this._toast("Please select a preferred pickup time slot."); return false;
    }
    if (!this._getAddress()) {
      this._shake(); this._toast("Please enter your pickup address."); return false;
    }
    if (this._getPayment() === "cod" && this._updateTotal() < 100) {
      document.getElementById("bmCodWarn").style.display = "";
      this._shake(); return false;
    }
    return true;
  },

  _shake() {
    const box = document.getElementById("bmBox");
    box.classList.add("bm-shake");
    setTimeout(() => box.classList.remove("bm-shake"), 500);
  },

  _toast(msg) {
    let t = document.getElementById("bmToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "bmToast";
      t.style.cssText = `
        position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
        background:#1a2e2e; color:#fff; padding:10px 20px;
        border-radius:999px; font-size:.88rem; font-weight:600;
        z-index:99999; pointer-events:none;
        box-shadow:0 4px 16px rgba(0,0,0,.25);
        opacity:0; transition:opacity .2s;
      `;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 2800);
  },

  _buildSummary() {
    const qty        = this._getQty();
    const price      = parseFloat(this.currentItem.price);
    const surcharge  = this._getDeliverySurcharge();
    const total      = qty * price * surcharge;
    const payment    = this._getPayment();
    const date       = this._getPickupDate();
    const time       = this._getPickupTime();
    const address    = this._getAddress();
    const pinCode    = this._getPinCode();
    const notes      = document.getElementById("bmInstructions").value.trim();
    const profile    = this._userProfile;
    const userName   = profile?.full_name || Auth.getUser()?.name || "";
    const delivLabel = this._getDeliveryLabel();

    const row = (label, val) => `
      <div class="bm-summary-row">
        <span class="bm-sr-label">${label}</span>
        <span class="bm-sr-val">${val}</span>
      </div>
    `;

    const surchargeRow = surcharge > 1
      ? row("Speed Surcharge", `+${Math.round((surcharge - 1) * 100)}% (₹${(qty * price * (surcharge - 1)).toFixed(0)})`)
      : "";

    document.getElementById("bmSummaryCard").innerHTML =
      row("Booking for",    `<strong>${escapeHtml(userName)}</strong>`) +
      row("Service / Item", `${this.currentItem.emoji} ${escapeHtml(this.currentItem.name)}`) +
      row("Unit Price",     `₹${price.toFixed(0)} <em>${escapeHtml(this.currentItem.unit)}</em>`) +
      row("Quantity",       `${qty} ${escapeHtml(this.currentItem.unit)}`) +
      row("Delivery Speed", escapeHtml(delivLabel)) +
      surchargeRow +
      row("Pickup Date",    escapeHtml(date)) +
      row("Pickup Time",    escapeHtml(time)) +
      row("Address",        escapeHtml(address) + (pinCode ? ` – <em>${escapeHtml(pinCode)}</em>` : "")) +
      (notes ? row("Instructions", `<span class="bm-sr-note">${escapeHtml(notes)}</span>`) : "") +
      row("Payment",        payment === "cod" ? "💵 Cash on Delivery" : "💳 Online / UPI") +
      `<div class="bm-summary-total">
        <span>Total Amount</span>
        <strong>₹${total.toFixed(0)}</strong>
      </div>`;
  },

  /* ── Bind static events (once) ────────────────────────────── */
  _bindStaticEvents(overlay) {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) this.close(); });
    document.getElementById("bmClose").addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.close(); });

    const qtyInput = document.getElementById("bmQty");
    document.getElementById("bmQtyMinus").addEventListener("click", () => {
      qtyInput.value = Math.max(1, this._getQty() - 1);
      this._updateTotal(); this._checkCod();
    });
    document.getElementById("bmQtyPlus").addEventListener("click", () => {
      qtyInput.value = Math.min(99, this._getQty() + 1);
      this._updateTotal(); this._checkCod();
    });
    qtyInput.addEventListener("input", () => { this._updateTotal(); this._checkCod(); });
    overlay.addEventListener("change", (e) => {
      if (e.target.name === "bm-payment")  this._checkCod();
      if (e.target.name === "bm-delivery") { this._updateTotal(); this._checkCod(); }
    });

    // Time slot buttons
    overlay.addEventListener("click", (e) => {
      const btn = e.target.closest(".bm-time-btn");
      if (!btn) return;
      document.querySelectorAll(".bm-time-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });

    document.getElementById("bmProceedBtn").addEventListener("click", () => {
      if (!this._validate()) return;
      this._buildSummary();
      this._showStep(2);
    });
  },

  /* ── Confirm: real API call ───────────────────────────────── */
  async _confirmBooking() {
    const btn = document.getElementById("bmConfirmBtn");
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="bm-spinner"></span> Placing order…`;

    try {
      const qty      = this._getQty();
      const surcharge = this._getDeliverySurcharge();
      const total    = qty * parseFloat(this.currentItem.price) * surcharge;

      const payload = {
        service_id:           this.currentItem.serviceId || null,
        item_id:              this.currentItem.itemId    || null,
        item_name:            this.currentItem.name,
        address:              this._getAddress(),
        pin_code:             this._getPinCode() || null,
        pickup_date:          this._getPickupDate(),
        pickup_time:          this._getPickupTime(),
        special_instructions: document.getElementById("bmInstructions").value.trim() || null,
        payment_method:       this._getPayment(),
        quantity:             qty,
        total_amount:         total,
        delivery_speed:       this._getDeliverySpeed(),
      };

      const resp = await OrdersAPI.create(payload);
      const orderId = resp.data?.orderId;

      // ── Success state ──────────────────────────────────────
      const isOnline = this._getPayment() === "online";
      const upiId    = "9173576732@ibl"; // 🔧 apna UPI ID yahan daalo

      // UPI deep-link (apps jaise GPay, PhonePe, Paytm isko handle karte hain)
      const upiLink  = `upi://pay?pa=${upiId}&pn=Door2Door+Laundry&am=${total.toFixed(2)}&cu=INR&tn=Order+%23${orderId}`;
      // QR code image — Google Charts API se generate hota hai (free, no key needed)
      const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;

      document.getElementById("bmSummaryCard").innerHTML = `
        <div class="bm-success">
          <div class="bm-success__icon">✅</div>
          <h4>Booking Confirmed!</h4>
          <p>Your order <strong>#${orderId}</strong> for
             <strong>${escapeHtml(this.currentItem.name)}</strong> has been placed.</p>
          <p class="bm-success__total">
            Total: <strong>₹${total.toFixed(0)}</strong> via
            ${isOnline ? "Online / UPI" : "Cash on Delivery"}
          </p>
          ${isOnline ? `
          <!-- ── UPI Payment Section ── -->
          <div class="bm-upi-box">
            <p class="bm-upi-title">💳 Complete Your Payment</p>
            <p class="bm-upi-sub">
              Scan this QR code with any UPI app<br>
              <em>(GPay, PhonePe, Paytm, BHIM…)</em>
            </p>
            <div class="bm-qr-wrap">
              <img src="${qrUrl}" alt="UPI QR Code for Order #${orderId}"
                   class="bm-qr-img" width="180" height="180"
                   onerror="this.style.display='none';document.getElementById('bm-qr-fallback-${orderId}').style.display='block'" />
              <div id="bm-qr-fallback-${orderId}" style="display:none;padding:12px;background:#f1f5f9;border-radius:10px;font-size:.85rem;color:#475569;text-align:center;">
                QR load nahi hua. Neeche UPI ID copy karein.
              </div>
            </div>
            <div class="bm-upi-id-row">
              <span class="bm-upi-id-label">UPI ID:</span>
              <code class="bm-upi-id-val" id="bmUpiIdText">${upiId}</code>
              <button class="bm-upi-copy-btn" onclick="
                navigator.clipboard.writeText('${upiId}').then(()=>{
                  this.textContent='✓ Copied!';
                  setTimeout(()=>this.textContent='Copy',2000);
                })
              ">Copy</button>
            </div>
            <a href="${upiLink}" class="bm-upi-app-btn" target="_blank" rel="noopener">
              📱 Open in UPI App
            </a>
            <p class="bm-upi-note">
              ⚠️ Amount: <strong>₹${total.toFixed(0)}</strong> — 
              Payment reference mein <strong>Order #${orderId}</strong> zaroor likhein.
            </p>
          </div>
          ` : `
          <p class="bm-success__note">
            💵 Cash on Delivery — pickup ke waqt payment karein.<br>
          </p>
          `}
          <p class="bm-success__note" style="margin-top:10px;">
            📧 A confirmation email has been sent to you.<br>
            🧺 We'll call you to confirm the pickup time!
          </p>
        </div>
      `;
      document.getElementById("bmSummaryActions").innerHTML = `
        <button class="bm-btn-primary" onclick="BookingModal.close()" style="width:100%">
          ✓ Done
        </button>
      `;

      // Invalidate profile / last-order caches so the next booking re-fetches
      // fresh (e.g. picks up this order as the new "last order" suggestion)
      this._userProfile = null;
      this._lastOrderFetched = false;

    } catch (err) {
      // Show inline error
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Confirm Booking
      `;
      this._toast(`❌ ${err.message || "Could not place order. Please try again."}`);
    }
  },
};

/* ── Event delegation for all Book buttons ────────────────── */
function initBookingButtons() {
  document.addEventListener("click", (e) => {
    const itemBtn = e.target.closest(".btn-book-item");
    if (itemBtn) {
      BookingModal.open({
        name:      itemBtn.dataset.itemName,
        price:     itemBtn.dataset.itemPrice,
        unit:      itemBtn.dataset.itemUnit,
        emoji:     itemBtn.dataset.itemEmoji,
        itemId:    itemBtn.dataset.itemId     || null,
        serviceId: itemBtn.dataset.svcId      || null,
      });
      return;
    }
    const svcBtn = e.target.closest(".btn-book-service");
    if (svcBtn) {
      BookingModal.open({
        name:      svcBtn.dataset.svcName,
        price:     svcBtn.dataset.svcPrice,
        unit:      svcBtn.dataset.svcUnit,
        emoji:     svcBtn.dataset.svcEmoji,
        itemId:    null,
        serviceId: svcBtn.dataset.svcId || null,
      });
    }
  });
}
window.BookingModal = BookingModal;

/* ──────────────────────────────────────────
   REVEAL ANIMATION
────────────────────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll("[data-reveal]:not(.visible)");
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("visible"));
    return;
  }
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const delay = entry.target.style.getPropertyValue("--delay") || "0ms";
          const ms = parseInt(delay) || 0;
          setTimeout(() => entry.target.classList.add("visible"), ms);
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  els.forEach((el) => obs.observe(el));
}

/* ──────────────────────────────────────────
   SERVICES API EXTENSION
────────────────────────────────────────── */
function extendServicesAPI() {
  if (!window.ServicesAPI) return;
  ServicesAPI.getAllWithItems = async function () {
    const res = await fetch(`${window.API_BASE}/services/all-with-items`, {
      headers: { "Content-Type": "application/json" },
    });
    return window._handleResponsePublic
      ? window._handleResponsePublic(res)
      : res.json().then((data) => {
          if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
          return data;
        });
  };
}

/* ──────────────────────────────────────────
   UTILITY
────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ──────────────────────────────────────────
   BOOT
────────────────────────────────────────── */
async function boot() {
  await Promise.all([
    loadComponent("header-placeholder", "header.html"),
    loadComponent("footer-placeholder", "footer.html"),
  ]);
  await loadScript("js/auth.js");
  await loadScript("js/api.js");
  await loadScript("js/header.js");
  if (window.Header) Header.init();
  await loadScript("js/footer.js");

  extendServicesAPI();
  await loadServices();

  BookingModal.init();
  initBookingButtons();
  window.loadServices = loadServices;
}

document.addEventListener("DOMContentLoaded", boot);