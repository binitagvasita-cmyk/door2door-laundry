/* ============================================================
   Door2Door Laundry — api.js
   ALL fetch() calls live here.

   API_BASE auto-detects local vs. production — no manual edit
   needed before deploying. On localhost/127.0.0.1 it talks to the
   local Flask dev server; anywhere else (e.g. your Vercel domain)
   it talks to the deployed Render backend below.
   Override PRODUCTION_API_BASE if your backend URL ever changes.
   ============================================================ */

"use strict";

// ── Base URL (auto-detected) ────────────────────────────────────
const PRODUCTION_API_BASE = "https://door2door-laundry.onrender.com/api";
const LOCAL_API_BASE = "http://127.0.0.1:5001/api";
const _isLocalHost = ["localhost", "127.0.0.1", ""].includes(
  window.location.hostname
);
const API_BASE = _isLocalHost ? LOCAL_API_BASE : PRODUCTION_API_BASE;

// ── Helpers ───────────────────────────────────────────────────
// Customer-session headers (uses Auth)
function _getHeaders(requireAuth = false) {
  const headers = { "Content-Type": "application/json" };
  if (requireAuth) {
    const token = Auth.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// Admin-session headers (uses AdminAuth) — kept fully separate from
// the customer Auth store so an admin login in one tab can never be
// mistaken for / overwrite a customer session in another tab.
function _getAdminHeaders(requireAuth = false) {
  const headers = { "Content-Type": "application/json" };
  if (requireAuth) {
    const token = AdminAuth.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
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

  /** Customer login — stores JWT in the customer Auth store. */
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

  /**
   * Admin login — same endpoint, but stores the JWT in the separate
   * AdminAuth store so it never collides with a customer session.
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
   * Save profile / address changes for the logged-in user.
   * Accepts any subset of: fullName, phone, streetAddress, apartment,
   * buildingName, landmark, pinCode, marketingOptIn.
   * On success, merges the returned fields into the cached Auth user
   * object so the UI reflects the change immediately.
   */
  async updateProfile(payload) {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: "PATCH",
      headers: _getHeaders(true),
      body: JSON.stringify(payload),
    });
    const data = await _handleResponse(res);
    if (data.data) {
      const merged = { ...Auth.getUser(), ...data.data };
      localStorage.setItem(Auth.USER_KEY, JSON.stringify(merged));
    }
    return data;
  },

  /** Log out locally (clears customer JWT — no server call needed). */
  logout() {
    Auth.clearToken();
    window.location.href = "login.html";
  },

  /** Log out the admin session locally. */
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
