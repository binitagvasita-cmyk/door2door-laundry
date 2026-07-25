/* ============================================================
   Door2Door Laundry — api.js
   ALL fetch() calls live here.
   To switch from dev → production, change API_BASE only.
   ============================================================ */

"use strict";

// ── Base URL ──────────────────────────────────────────────────
// Auto-detects environment so nobody has to remember to flip a
// comment before deploying. Loopback hostnames → local Flask dev
// server; anything else (Vercel, custom domain, etc.) → the live
// production API. Override PRODUCTION_API_BASE with your real
// backend URL once it's deployed (Render/Railway/etc — see the
// deployment notes shipped with this project).
const PRODUCTION_API_BASE = "https://door2door-laundry-api.onrender.com/api";
const LOCAL_API_BASE = "http://127.0.0.1:5001/api";
const _isLocalHost = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
const API_BASE = _isLocalHost ? LOCAL_API_BASE : PRODUCTION_API_BASE;

// ── Helpers ───────────────────────────────────────────────────
// `admin = true` reads/writes the AdminAuth token namespace instead
// of the customer Auth namespace — keeps the two sessions from ever
// touching each other's storage key (see auth.js for why this matters).
function _getHeaders(requireAuth = false, admin = false) {
  const headers = { "Content-Type": "application/json" };
  if (requireAuth) {
    const store = admin ? AdminAuth : Auth;
    const token = store.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function _getAdminHeaders(requireAuth = false) {
  return _getHeaders(requireAuth, true);
}

async function _handleResponse(res) {
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const msg = data.message || data.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data; // { success, message, data? }
}

// ════════════════════════════════════════════════════════════
//  AUTH  —  /api/auth/*
// ════════════════════════════════════════════════════════════
const AuthAPI = {
  /**
   * Register a new user.
   * Payload matches exactly what register.js collects.
   * On success, auto-stores the returned JWT.
   */
  async register(payload) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: _getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await _handleResponse(res);
    if (data.data?.token) Auth.setToken(data.data.token);
    return data;
  },

  /** Login and store JWT. Returns full response object. */
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: _getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await _handleResponse(res);
    if (data.data?.token) Auth.setToken(data.data.token);
    return data;
  },
  // Add inside AuthAPI object, after login():

  async sendOtp(email, name = "") {
    const res = await fetch(`${API_BASE}/auth/send-otp`, {
      method: "POST",
      headers: _getHeaders(),
      body: JSON.stringify({ email, name }),
    });
    return _handleResponse(res);
  },

  async verifyOtp(email, otp) {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: "POST",
      headers: _getHeaders(),
      body: JSON.stringify({ email, otp }),
    });
    return _handleResponse(res);
  },
  /** Fetch the logged-in user's profile (JWT required). */
  async getProfile() {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      headers: _getHeaders(true),
    });
    return _handleResponse(res);
  },

  /**
   * Update the logged-in user's own name / phone / address fields.
   * @param {Object} payload — any subset of { fullName, phone, streetAddress,
   *   apartment, buildingName, landmark, pinCode, marketingOptIn }
   */
  async updateProfile(payload) {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: "PATCH",
      headers: _getHeaders(true),
      body: JSON.stringify(payload),
    });
    return _handleResponse(res);
  },

  /** Log out locally (clears JWT — no server call needed). */
  logout() {
    Auth.clearToken();
    window.location.href = "login.html";
  },

  /**
   * Admin login. Hits the SAME /api/auth/login endpoint as the
   * customer login (the backend has one login route for everyone),
   * but stores the resulting JWT under AdminAuth's own key instead
   * of Auth's — so it can never collide with / overwrite a
   * customer session open in another tab.
   */
  async adminLogin(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: _getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await _handleResponse(res);
    if (data.data?.token) AdminAuth.setToken(data.data.token);
    return data;
  },

  /** Log out of the admin session only (customer session untouched). */
  adminLogout() {
    AdminAuth.clearToken();
    localStorage.removeItem("d2d_admin");
    window.location.href = "login.html";
  },
};

// ════════════════════════════════════════════════════════════
//  SERVICES  —  /api/services
// ════════════════════════════════════════════════════════════
const ServicesAPI = {
  /** Get all active laundry services. Public, no auth needed. */
  async getAll() {
    const res = await fetch(`${API_BASE}/services/`, {
      headers: _getHeaders(),
    });
    return _handleResponse(res);
  },
};

// ════════════════════════════════════════════════════════════
//  ORDERS  —  /api/orders  (JWT required)
// ════════════════════════════════════════════════════════════
const OrdersAPI = {
  /**
   * Place a new order.
   * @param {Object} orderData
   *   { service_id, address, pickup_date, pin_code?, special_instructions? }
   */
  async create(orderData) {
    const res = await fetch(`${API_BASE}/orders/`, {
      method: "POST",
      headers: _getHeaders(true),
      body: JSON.stringify(orderData),
    });
    return _handleResponse(res);
  },

  /** Get all orders for the currently logged-in user. */
  async getMyOrders() {
    const res = await fetch(`${API_BASE}/orders/`, {
      headers: _getHeaders(true),
    });
    return _handleResponse(res);
  },

  /** Track a specific order by its ID. */
  async track(orderId) {
    const res = await fetch(`${API_BASE}/orders/${orderId}/track`, {
      headers: _getHeaders(true),
    });
    return _handleResponse(res);
  },

  /** Cancel a pending/confirmed order. */
  async cancel(orderId) {
    const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
      method: "PATCH",
      headers: _getHeaders(true),
    });
    return _handleResponse(res);
  },

  /** Get full bill/invoice data for one of the logged-in user's own orders. */
  async getInvoice(orderId) {
    const res = await fetch(`${API_BASE}/orders/${orderId}/invoice`, {
      headers: _getHeaders(true),
    });
    return _handleResponse(res);
  },
};

// ════════════════════════════════════════════════════════════
//  ADMIN  —  /api/admin/*  (admin JWT required)
// ════════════════════════════════════════════════════════════
const AdminAPI = {
  /** Fetch total registered users (all users, not just those with orders). */
  async getUserStats() {
    const res = await fetch(`${API_BASE}/admin/stats/users`, {
      headers: _getAdminHeaders(true),
    });
    return _handleResponse(res);
  },

  /** Fetch all orders across all users. */
  async getAllOrders() {
    const res = await fetch(`${API_BASE}/admin/orders`, {
      headers: _getAdminHeaders(true),
    });
    return _handleResponse(res);
  },

  /**
   * Update the status of any order.
   * @param {number} orderId
   * @param {string} status — one of the ENUM values in schema.sql
   */
  async updateStatus(orderId, status) {
    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: _getAdminHeaders(true),
      body: JSON.stringify({ status }),
    });
    return _handleResponse(res);
  },

  /**
   * Update the payment status of any order ('pending' or 'paid').
   * @param {number} orderId
   * @param {string} paymentStatus
   */
  async updatePaymentStatus(orderId, paymentStatus) {
    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/payment`, {
      method: "PATCH",
      headers: _getAdminHeaders(true),
      body: JSON.stringify({ payment_status: paymentStatus }),
    });
    return _handleResponse(res);
  },

  /** Get full bill/invoice data for ANY order (admin, not ownership-restricted). */
  async getInvoice(orderId) {
    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/invoice`, {
      headers: _getAdminHeaders(true),
    });
    return _handleResponse(res);
  },

  /** Get every category (active + inactive) for the admin table. */
  async getAllServices() {
    const res = await fetch(`${API_BASE}/admin/services`, {
      headers: _getAdminHeaders(true),
    });
    return _handleResponse(res);
  },

  /**
   * Create a new category.
   * @param {Object} payload — { name, description?, price, unit?, icon_emoji?, image_url?, display_order? }
   */
  async createService(payload) {
    const res = await fetch(`${API_BASE}/admin/services`, {
      method: "POST",
      headers: _getAdminHeaders(true),
      body: JSON.stringify(payload),
    });
    return _handleResponse(res);
  },

  /** Update any subset of a category's fields. */
  async updateService(serviceId, payload) {
    const res = await fetch(`${API_BASE}/admin/services/${serviceId}`, {
      method: "PATCH",
      headers: _getAdminHeaders(true),
      body: JSON.stringify(payload),
    });
    return _handleResponse(res);
  },

  /** Toggle a category between active / inactive. */
  async toggleServiceStatus(serviceId) {
    const res = await fetch(`${API_BASE}/admin/services/${serviceId}/toggle`, {
      method: "PATCH",
      headers: _getAdminHeaders(true),
    });
    return _handleResponse(res);
  },

  /** Get every item (active + inactive) under a given category. */
  async getItemsForService(serviceId) {
    const res = await fetch(`${API_BASE}/admin/services/${serviceId}/items`, {
      headers: _getAdminHeaders(true),
    });
    return _handleResponse(res);
  },

  /**
   * Create a new item under a category.
   * @param {number} serviceId
   * @param {Object} payload — { name, price, unit?, icon_emoji?, image_url?, display_order? }
   */
  async createItem(serviceId, payload) {
    const res = await fetch(`${API_BASE}/admin/services/${serviceId}/items`, {
      method: "POST",
      headers: _getAdminHeaders(true),
      body: JSON.stringify(payload),
    });
    return _handleResponse(res);
  },

  /** Update any subset of an item's fields. */
  async updateItem(itemId, payload) {
    const res = await fetch(`${API_BASE}/admin/items/${itemId}`, {
      method: "PATCH",
      headers: _getAdminHeaders(true),
      body: JSON.stringify(payload),
    });
    return _handleResponse(res);
  },

  /** Toggle an item between active / inactive. */
  async toggleItemStatus(itemId) {
    const res = await fetch(`${API_BASE}/admin/items/${itemId}/toggle`, {
      method: "PATCH",
      headers: _getAdminHeaders(true),
    });
    return _handleResponse(res);
  },

  /**
   * Reports summary: totals, revenue-over-time, top customers,
   * top services, status breakdown.
   * @param {number} [days] — optional window (e.g. 30 for last 30 days). Omit for all-time.
   */
  async getReportsSummary(days) {
    const qs = days ? `?days=${encodeURIComponent(days)}` : "";
    const res = await fetch(`${API_BASE}/admin/reports/summary${qs}`, {
      headers: _getAdminHeaders(true),
    });
    return _handleResponse(res);
  },
};

// ════════════════════════════════════════════════════════════
//  HEALTH CHECK  (optional — useful for debugging cold starts)
// ════════════════════════════════════════════════════════════
const HealthAPI = {
  async ping() {
    try {
      const res = await fetch(`${API_BASE}/health`);
      return res.ok;
    } catch {
      return false;
    }
  },
};

// ── Expose globally ───────────────────────────────────────────
window.API_BASE = API_BASE;
window.AuthAPI = AuthAPI;
window.ServicesAPI = ServicesAPI;
window.OrdersAPI = OrdersAPI;
window.AdminAPI = AdminAPI;
window.HealthAPI = HealthAPI;