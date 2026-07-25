/* ============================================================
   Door2Door Laundry — admin/js/admin-dashboard.js
   Loads live orders from GET /api/admin/orders and lets the
   admin update status via PATCH /api/admin/orders/<id>/status
   ============================================================ */

"use strict";

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  picked_up: "Picked Up",
  in_process: "In Process",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_ORDER = Object.keys(STATUS_LABELS);

const PAYMENT_LABELS = { pending: "Pending", paid: "Paid" };
const PAYMENT_ORDER = Object.keys(PAYMENT_LABELS);

let _allOrders = [];
let _activeFilter = "all";

function $(id) {
  return document.getElementById(id);
}

/* ── Auth guard ─────────────────────────────────────────────── */
function guardAdmin() {
  if (!window.AdminAuth || !AdminAuth.isLoggedIn() || !localStorage.getItem("d2d_admin")) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

function loadAdminHeader() {
  try {
    const admin = JSON.parse(localStorage.getItem("d2d_admin")) || {};
    $("adminName").textContent = admin.name || "Admin";
    $("adminEmail").textContent = admin.email || "";
    $("adminAvatar").textContent = (admin.name || "A").trim().charAt(0).toUpperCase();
  } catch (_) {}
}

function logout() {
  AdminAuth.clearToken();
  localStorage.removeItem("d2d_admin");
  window.location.href = "login.html";
}

/* ── Mobile sidebar ─────────────────────────────────────────── */
function openSidebar() {
  $("adminSidebar").classList.add("open");
  $("sidebarOverlay").classList.add("show");
}
function closeSidebar() {
  $("adminSidebar").classList.remove("open");
  $("sidebarOverlay").classList.remove("show");
}
function initSidebarToggle() {
  const hamburger = $("hamburgerBtn");
  const closeBtn = $("sidebarCloseBtn");
  const overlay = $("sidebarOverlay");
  if (hamburger) hamburger.addEventListener("click", openSidebar);
  if (closeBtn) closeBtn.addEventListener("click", closeSidebar);
  if (overlay) overlay.addEventListener("click", closeSidebar);
}

/* ── Toast ──────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, isError = false) {
  const el = $("adminToast");
  el.textContent = msg;
  el.classList.toggle("admin-toast--error", isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

/* ── Formatting helpers ─────────────────────────────────────── */
function formatMoney(val) {
  if (val === null || val === undefined) return "—";
  return "₹" + Number(val).toLocaleString("en-IN");
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function formatPickupDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Load user stats ────────────────────────────────────────── */
async function loadUserStats() {
  const el = $("statUsers");
  try {
    const res = await AdminAPI.getUserStats();
    const { total_users } = res.data || {};
    el.textContent = total_users ?? "—";
    el.title = "";
  } catch (err) {
    // Show the actual error right on the card (no DevTools needed to see it)
    el.textContent = "⚠️";
    el.title = err.message || "Unknown error";
    el.style.cursor = "help";
    console.error("Failed to load user stats:", err.message);
    showToast(`Users stat failed: ${err.message}`, true);
  }
}

/* ── Load orders ────────────────────────────────────────────── */
async function loadOrders() {
  const tbody = $("ordersTableBody");
  tbody.innerHTML = `<tr><td colspan="9" class="admin-table__empty">Loading orders…</td></tr>`;

  try {
    const res = await AdminAPI.getAllOrders();
    _allOrders = res.data || [];
    renderStats();
    renderTable();
    $("lastUpdated").textContent = "Last updated: " + new Date().toLocaleTimeString("en-IN");
  } catch (err) {
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("admin access required") || msg.includes("authentication") || msg.includes("invalid or expired")) {
      // Session invalid / not an admin anymore — bounce to login
      AdminAuth.clearToken();
      localStorage.removeItem("d2d_admin");
      window.location.href = "login.html";
      return;
    }
    tbody.innerHTML = `<tr><td colspan="9" class="admin-table__empty">Failed to load orders: ${err.message}</td></tr>`;
    showToast("Failed to load orders.", true);
  }
}

/* ── Stats ──────────────────────────────────────────────────── */
function renderStats() {
  const total = _allOrders.length;
  const pending = _allOrders.filter((o) => o.status === "pending").length;
  const delivered = _allOrders.filter((o) => o.status === "delivered").length;
  const revenue = _allOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  $("statTotal").textContent = total;
  $("statPending").textContent = pending;
  $("statDelivered").textContent = delivered;
  $("statRevenue").textContent = formatMoney(revenue);
}

/* ── Table ──────────────────────────────────────────────────── */
function renderTable() {
  const tbody = $("ordersTableBody");
  const filtered = _activeFilter === "all"
    ? _allOrders
    : _allOrders.filter((o) => o.status === _activeFilter);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="admin-table__empty">No orders found.</td></tr>`;
    return;
  }

  // data-label attrs let the CSS turn each <td> into a labeled row
  // when the table collapses into stacked cards on phone screens.
  tbody.innerHTML = filtered.map((o) => `
    <tr>
      <td data-label="Order"><strong>#${o.id}</strong></td>
      <td data-label="Customer">
        <div class="cust-name">${escapeHtml(o.customer_name || "—")}</div>
        <div class="cust-phone">${escapeHtml(o.customer_phone || "")}</div>
      </td>
      <td data-label="Service">${escapeHtml(o.service_name || "—")}</td>
      <td data-label="Pickup">${formatPickupDate(o.pickup_date)}</td>
      <td data-label="Amount">${formatMoney(o.total_amount)}</td>
      <td data-label="Placed">${formatDateTime(o.created_at)}</td>
      <td data-label="Status">
        <div class="select-cell">
          <select class="status-select status-select--${o.status}" data-id="${o.id}" data-original="${o.status}">
            ${STATUS_ORDER.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}
          </select>
          <button class="btn-save-cell" data-id="${o.id}" title="Save status change">💾</button>
        </div>
      </td>
      <td data-label="Payment">
        <div class="select-cell">
          <select class="payment-select payment-select--${o.payment_status || "pending"}" data-id="${o.id}" data-original="${o.payment_status || "pending"}">
            ${PAYMENT_ORDER.map((p) => `<option value="${p}" ${p === (o.payment_status || "pending") ? "selected" : ""}>${PAYMENT_LABELS[p]}</option>`).join("")}
          </select>
          <button class="btn-save-cell" data-id="${o.id}" title="Save payment change">💾</button>
        </div>
      </td>
      <td data-label="Contact">
        ${renderContactActions(
          o.customer_name,
          o.customer_phone,
          `Hi ${o.customer_name || ""}, this is Door2Door Laundry regarding your order #${o.id} (status: ${STATUS_LABELS[o.status] || o.status}).`
        )}
        <a class="btn-bill" href="../invoice.html?order=${o.id}" target="_blank" rel="noopener" title="View / print bill">🧾 Bill</a>
      </td>
    </tr>
  `).join("");

  // Selecting a new value only stages the change (shows the Save button);
  // it does NOT hit the API until the admin explicitly clicks Save. This
  // avoids accidentally updating a live order's status/payment just from
  // browsing the dropdown.
  tbody.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", () => toggleSaveButton(sel));
  });
  tbody.querySelectorAll(".payment-select").forEach((sel) => {
    sel.addEventListener("change", () => toggleSaveButton(sel));
  });
  tbody.querySelectorAll(".status-select ~ .btn-save-cell").forEach((btn) => {
    btn.addEventListener("click", onStatusSave);
  });
  tbody.querySelectorAll(".payment-select ~ .btn-save-cell").forEach((btn) => {
    btn.addEventListener("click", onPaymentSave);
  });
}

/* Show the Save button only while the select's value differs from what's
   actually saved; hide it again if the admin flips it back manually. */
function toggleSaveButton(select) {
  const saveBtn = select.parentElement.querySelector(".btn-save-cell");
  if (!saveBtn) return;
  const changed = select.value !== select.dataset.original;
  saveBtn.style.display = changed ? "flex" : "none";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ── Contact helpers (Call / WhatsApp) ─────────────────────────
   Shared by the Orders table (here) and the Reports > Top
   Customers table (admin-reports.js). Assumes Indian 10-digit
   mobile numbers per is_valid_phone() in the backend; prepends
   country code 91 for the wa.me / tel: link format. */
function _phoneDigits(phone) {
  return (phone || "").replace(/\D/g, "");
}

function _phoneWithCountryCode(phone) {
  const digits = _phoneDigits(phone);
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}

function isContactablePhone(phone) {
  return _phoneDigits(phone).length >= 10;
}

function buildTelLink(phone) {
  return `tel:+${_phoneWithCountryCode(phone)}`;
}

function buildWaLink(phone, message) {
  return `https://wa.me/${_phoneWithCountryCode(phone)}?text=${encodeURIComponent(message || "")}`;
}

/**
 * Returns the <div class="row-actions">…</div> HTML for a Contact
 * cell. If the phone number looks invalid/missing, the buttons are
 * rendered disabled rather than omitted, so the column stays aligned.
 */
function renderContactActions(name, phone, waMessage) {
  const contactable = isContactablePhone(phone);
  const disabledCls = contactable ? "" : " btn-call--disabled";
  const disabledClsWa = contactable ? "" : " btn-whatsapp--disabled";
  const telHref = contactable ? buildTelLink(phone) : "#";
  const waHref = contactable ? buildWaLink(phone, waMessage) : "#";

  return `
    <div class="row-actions">
      <a class="btn-call${disabledCls}" href="${telHref}" title="Call ${escapeHtml(name || "")}">📞 Call</a>
      <a class="btn-whatsapp${disabledClsWa}" href="${waHref}" target="_blank" rel="noopener" title="WhatsApp ${escapeHtml(name || "")}">💬 WhatsApp</a>
    </div>
  `;
}

/* ── Status update (fires on Save click, not on select change) ──────── */
async function onStatusSave(e) {
  const saveBtn = e.currentTarget;
  const select = saveBtn.parentElement.querySelector(".status-select");
  if (!select) return;
  const orderId = select.dataset.id;
  const newStatus = select.value;
  const prevClass = [...select.classList].find((c) => c.startsWith("status-select--"));

  select.disabled = true;
  saveBtn.disabled = true;
  try {
    await AdminAPI.updateStatus(orderId, newStatus);
    const order = _allOrders.find((o) => String(o.id) === String(orderId));
    if (order) order.status = newStatus;

    if (prevClass) select.classList.remove(prevClass);
    select.classList.add(`status-select--${newStatus}`);
    select.dataset.original = newStatus;
    saveBtn.style.display = "none";

    showToast(`Order #${orderId} updated to "${STATUS_LABELS[newStatus]}".`);
    renderStats();
    if (_activeFilter !== "all" && newStatus !== _activeFilter) {
      renderTable();
    }
  } catch (err) {
    showToast(`Failed to update order #${orderId}: ${err.message}`, true);
    loadOrders(); // resync on failure
  } finally {
    select.disabled = false;
    saveBtn.disabled = false;
  }
}

/* ── Payment status update (fires on Save click, not on select change) ── */
async function onPaymentSave(e) {
  const saveBtn = e.currentTarget;
  const select = saveBtn.parentElement.querySelector(".payment-select");
  if (!select) return;
  const orderId = select.dataset.id;
  const newStatus = select.value;
  const prevClass = [...select.classList].find((c) => c.startsWith("payment-select--"));

  select.disabled = true;
  saveBtn.disabled = true;
  try {
    await AdminAPI.updatePaymentStatus(orderId, newStatus);
    const order = _allOrders.find((o) => String(o.id) === String(orderId));
    if (order) order.payment_status = newStatus;

    if (prevClass) select.classList.remove(prevClass);
    select.classList.add(`payment-select--${newStatus}`);
    select.dataset.original = newStatus;
    saveBtn.style.display = "none";

    showToast(`Order #${orderId} payment marked "${PAYMENT_LABELS[newStatus]}".`);
  } catch (err) {
    showToast(`Failed to update payment for #${orderId}: ${err.message}`, true);
    loadOrders(); // resync on failure
  } finally {
    select.disabled = false;
    saveBtn.disabled = false;
  }
}

/* ── Filters ────────────────────────────────────────────────── */
function initTabs() {
  $("statusTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".status-tab");
    if (!btn) return;
    document.querySelectorAll(".status-tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    _activeFilter = btn.dataset.status;
    renderTable();
  });
}

/* ── Sidebar nav → view switching (Orders / Categories) ───────── */
function initNavViews() {
  document.querySelectorAll(".admin-nav__item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      if (!view) return;

      document.querySelectorAll(".admin-nav__item").forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      document.querySelectorAll(".admin-view").forEach((v) => (v.style.display = "none"));
      const target = $("view-" + view);
      if (target) target.style.display = "";

      if (view === "categories" && !_categoriesLoadedOnce) {
        loadCategories();
      }
      if (view === "reports" && window.initReportsViewIfNeeded) {
        window.initReportsViewIfNeeded();
      }
    });
  });
}

/* ════════════════════════════════════════════════════════════
   CATEGORIES  (services table)
   ════════════════════════════════════════════════════════════ */

let _allCategories = [];
let _categoriesLoadedOnce = false;

/* ── Load ───────────────────────────────────────────────────── */
async function loadCategories() {
  const tbody = $("categoriesTableBody");
  tbody.innerHTML = `<tr><td colspan="7" class="admin-table__empty">Loading categories…</td></tr>`;

  try {
    const res = await AdminAPI.getAllServices();
    _allCategories = res.data || [];
    _categoriesLoadedOnce = true;
    renderCategoriesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-table__empty">Failed to load categories: ${err.message}</td></tr>`;
    showToast("Failed to load categories.", true);
  }
}

/* ── Render ─────────────────────────────────────────────────── */
function renderCategoriesTable() {
  const tbody = $("categoriesTableBody");

  if (!_allCategories.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="admin-table__empty">No categories yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = _allCategories.map((c) => `
    <tr>
      <td data-label="Icon" class="cat-icon-cell">${escapeHtml(c.icon_emoji || "🧺")}</td>
      <td data-label="Name"><strong>${escapeHtml(c.name)}</strong></td>
      <td data-label="Price">${formatMoney(c.price)}</td>
      <td data-label="Unit">${escapeHtml(c.unit || "—")}</td>
      <td data-label="Order">${c.display_order ?? 0}</td>
      <td data-label="Status">
        <span class="status-pill ${c.is_active ? "status-pill--active" : "status-pill--inactive"}">
          ${c.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="btn-items" data-action="items" data-id="${c.id}">Items</button>
          <button class="btn-edit" data-action="edit" data-id="${c.id}">Edit</button>
          <button class="${c.is_active ? "btn-deactivate" : "btn-activate"}" data-action="toggle" data-id="${c.id}">
            ${c.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", onCategoryAction);
  });
}

async function onCategoryAction(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "edit") {
    openCategoryModal(_allCategories.find((c) => String(c.id) === String(id)));
    return;
  }

  if (action === "items") {
    openItemsModal(_allCategories.find((c) => String(c.id) === String(id)));
    return;
  }

  if (action === "toggle") {
    const cat = _allCategories.find((c) => String(c.id) === String(id));
    const verb = cat && cat.is_active ? "deactivate" : "activate";
    if (!confirm(`Are you sure you want to ${verb} "${cat ? cat.name : "this category"}"?`)) return;

    btn.disabled = true;
    try {
      const res = await AdminAPI.toggleServiceStatus(id);
      if (cat) cat.is_active = res.data.is_active;
      renderCategoriesTable();
      showToast(res.message || "Category updated.");
    } catch (err) {
      showToast(`Failed to update category: ${err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  }
}

/* ── Modal (add / edit) ────────────────────────────────────────
   A single modal handles both creating a new category and
   editing an existing one. When `category` is null/undefined,
   the form starts blank and Save issues a POST; otherwise the
   form is pre-filled and Save issues a PATCH for that id.       */
function openCategoryModal(category) {
  const isEdit = !!category;
  $("categoryModalTitle").textContent = isEdit ? "Edit Category" : "Add Category";
  $("catId").value = isEdit ? category.id : "";
  $("catName").value = isEdit ? category.name : "";
  $("catDescription").value = isEdit ? (category.description || "") : "";
  $("catPrice").value = isEdit ? category.price : "";
  $("catUnit").value = isEdit ? (category.unit || "") : "per kg";
  $("catIcon").value = isEdit ? (category.icon_emoji || "") : "🧺";
  $("catImage").value = isEdit ? (category.image_url || "") : "";
  $("catOrder").value = isEdit ? (category.display_order ?? 0) : 0;

  setCatError("catName", "");
  setCatError("catPrice", "");
  showCatBanner("");

  $("categoryModalOverlay").style.display = "flex";
}

function closeCategoryModal() {
  $("categoryModalOverlay").style.display = "none";
}

function setCatError(fieldId, msg) {
  const el = $("err-" + fieldId);
  if (el) el.textContent = msg;
}

function showCatBanner(msg) {
  const banner = $("catFormErrorBanner");
  const text = $("catFormErrorMsg");
  if (!banner) return;
  if (msg) {
    text.textContent = msg;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

async function saveCategory() {
  showCatBanner("");
  setCatError("catName", "");
  setCatError("catPrice", "");

  const id = $("catId").value;
  const name = $("catName").value.trim();
  const priceRaw = $("catPrice").value;
  const price = parseFloat(priceRaw);

  let ok = true;
  if (!name) {
    setCatError("catName", "Category name is required.");
    ok = false;
  }
  if (priceRaw === "" || isNaN(price) || price < 0) {
    setCatError("catPrice", "Enter a valid, non-negative price.");
    ok = false;
  }
  if (!ok) return;

  const payload = {
    name,
    description: $("catDescription").value.trim(),
    price,
    unit: $("catUnit").value.trim() || "per kg",
    icon_emoji: $("catIcon").value.trim() || "🧺",
    image_url: $("catImage").value.trim(),
    display_order: parseInt($("catOrder").value || "0", 10),
  };

  const saveBtn = $("categorySaveBtn");
  saveBtn.disabled = true;
  try {
    if (id) {
      await AdminAPI.updateService(id, payload);
      showToast("Category updated successfully.");
    } else {
      await AdminAPI.createService(payload);
      showToast("Category created successfully.");
    }
    closeCategoryModal();
    loadCategories();
  } catch (err) {
    showCatBanner(err.message || "Could not save category. Please try again.");
  } finally {
    saveBtn.disabled = false;
  }
}

function initCategoryModal() {
  $("addCategoryBtn").addEventListener("click", () => openCategoryModal(null));
  $("categoryModalCloseBtn").addEventListener("click", closeCategoryModal);
  $("categoryModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "categoryModalOverlay") closeCategoryModal();
  });
  $("categorySaveBtn").addEventListener("click", saveCategory);
}

/* ════════════════════════════════════════════════════════════
   ITEMS  (service_items table — sub-items under a category)
   ════════════════════════════════════════════════════════════ */

let _currentCategory = null; // category the items modal is open for
let _currentItems = [];

/* ── Open / load ────────────────────────────────────────────── */
async function openItemsModal(category) {
  if (!category) return;
  _currentCategory = category;

  $("itemsModalTitle").textContent = `Items — ${category.name}`;
  $("itemsModalSubhead").textContent = `${category.icon_emoji || "🧺"} ${category.name}`;
  $("itemsModalOverlay").style.display = "flex";

  await loadItems();
}

function closeItemsModal() {
  $("itemsModalOverlay").style.display = "none";
  _currentCategory = null;
  _currentItems = [];
}

async function loadItems() {
  const tbody = $("itemsTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="items-mini-table__empty">Loading items…</td></tr>`;
  if (!_currentCategory) return;

  try {
    const res = await AdminAPI.getItemsForService(_currentCategory.id);
    _currentItems = (res.data && res.data.items) || [];
    renderItemsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="items-mini-table__empty">Failed to load items: ${err.message}</td></tr>`;
    showToast("Failed to load items.", true);
  }
}

/* ── Render ─────────────────────────────────────────────────── */
function renderItemsTable() {
  const tbody = $("itemsTableBody");

  if (!_currentItems.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="items-mini-table__empty">No items in this category yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = _currentItems.map((it) => `
    <tr>
      <td data-label="Icon" class="cat-icon-cell">${escapeHtml(it.icon_emoji || "🧺")}</td>
      <td data-label="Name"><strong>${escapeHtml(it.name)}</strong></td>
      <td data-label="Price">${formatMoney(it.price)}</td>
      <td data-label="Unit">${escapeHtml(it.unit || "—")}</td>
      <td data-label="Status">
        <span class="status-pill ${it.is_active ? "status-pill--active" : "status-pill--inactive"}">
          ${it.is_active ? "Active" : "Inactive"}
        </span>
      </td>
      <td data-label="Actions">
        <div class="row-actions">
          <button class="btn-edit" data-action="edit-item" data-id="${it.id}">Edit</button>
          <button class="${it.is_active ? "btn-deactivate" : "btn-activate"}" data-action="toggle-item" data-id="${it.id}">
            ${it.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", onItemAction);
  });
}

async function onItemAction(e) {
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "edit-item") {
    openItemModal(_currentItems.find((it) => String(it.id) === String(id)));
    return;
  }

  if (action === "toggle-item") {
    const item = _currentItems.find((it) => String(it.id) === String(id));
    const verb = item && item.is_active ? "deactivate" : "activate";
    if (!confirm(`Are you sure you want to ${verb} "${item ? item.name : "this item"}"?`)) return;

    btn.disabled = true;
    try {
      const res = await AdminAPI.toggleItemStatus(id);
      if (item) item.is_active = res.data.is_active;
      renderItemsTable();
      showToast(res.message || "Item updated.");
    } catch (err) {
      showToast(`Failed to update item: ${err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  }
}

/* ── Item add/edit modal ────────────────────────────────────── */
function openItemModal(item) {
  const isEdit = !!item;
  $("itemModalTitle").textContent = isEdit ? "Edit Item" : "Add Item";
  $("itemId").value = isEdit ? item.id : "";
  $("itemServiceId").value = _currentCategory ? _currentCategory.id : "";
  $("itemName").value = isEdit ? item.name : "";
  $("itemPrice").value = isEdit ? item.price : "";
  $("itemUnit").value = isEdit ? (item.unit || "") : "per piece";
  $("itemIcon").value = isEdit ? (item.icon_emoji || "") : "🧺";
  $("itemImage").value = isEdit ? (item.image_url || "") : "";
  $("itemOrder").value = isEdit ? (item.display_order ?? 0) : 0;

  setItemError("itemName", "");
  setItemError("itemPrice", "");
  showItemBanner("");

  $("itemModalOverlay").style.display = "flex";
}

function closeItemModal() {
  $("itemModalOverlay").style.display = "none";
}

function setItemError(fieldId, msg) {
  const el = $("err-" + fieldId);
  if (el) el.textContent = msg;
}

function showItemBanner(msg) {
  const banner = $("itemFormErrorBanner");
  const text = $("itemFormErrorMsg");
  if (!banner) return;
  if (msg) {
    text.textContent = msg;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

async function saveItem() {
  showItemBanner("");
  setItemError("itemName", "");
  setItemError("itemPrice", "");

  const id = $("itemId").value;
  const serviceId = $("itemServiceId").value;
  const name = $("itemName").value.trim();
  const priceRaw = $("itemPrice").value;
  const price = parseFloat(priceRaw);

  let ok = true;
  if (!name) {
    setItemError("itemName", "Item name is required.");
    ok = false;
  }
  if (priceRaw === "" || isNaN(price) || price < 0) {
    setItemError("itemPrice", "Enter a valid, non-negative price.");
    ok = false;
  }
  if (!ok) return;

  const payload = {
    name,
    price,
    unit: $("itemUnit").value.trim() || "per piece",
    icon_emoji: $("itemIcon").value.trim() || "🧺",
    image_url: $("itemImage").value.trim(),
    display_order: parseInt($("itemOrder").value || "0", 10),
  };

  const saveBtn = $("itemSaveBtn");
  saveBtn.disabled = true;
  try {
    if (id) {
      await AdminAPI.updateItem(id, payload);
      showToast("Item updated successfully.");
    } else {
      await AdminAPI.createItem(serviceId, payload);
      showToast("Item created successfully.");
    }
    closeItemModal();
    loadItems();
  } catch (err) {
    showItemBanner(err.message || "Could not save item. Please try again.");
  } finally {
    saveBtn.disabled = false;
  }
}

function initItemsModal() {
  $("itemsModalCloseBtn").addEventListener("click", closeItemsModal);
  $("itemsModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "itemsModalOverlay") closeItemsModal();
  });
  $("addItemBtn").addEventListener("click", () => openItemModal(null));

  $("itemModalCloseBtn").addEventListener("click", closeItemModal);
  $("itemModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "itemModalOverlay") closeItemModal();
  });
  $("itemSaveBtn").addEventListener("click", saveItem);
}

/* ── Boot ───────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  if (!guardAdmin()) return;
  loadAdminHeader();
  initTabs();
  initSidebarToggle();
  initNavViews();
  initCategoryModal();
  initItemsModal();
  $("refreshBtn").addEventListener("click", () => {
    loadOrders();
    loadUserStats();
  });
  $("logoutBtn").addEventListener("click", logout);
  loadOrders();
  loadUserStats();
});