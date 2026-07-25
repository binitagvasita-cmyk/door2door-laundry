/* ============================================================
   Door2Door Laundry — auth.js
   JWT store / read / logout helper.
   Include this BEFORE api.js on every page.

   ── FIX (cross-tab admin/client token collision) ─────────────
   This file used to expose a single `Auth` object with ONE
   localStorage key ("d2d_toke") that was written to by BOTH the
   customer login (login.js) and the admin login (admin-login.js)
   — because both pages load this same shared auth.js/api.js.

   localStorage is shared across every tab of the same origin, so
   logging into the admin dashboard in one tab silently overwrote
   the JWT a customer was using in a completely different tab.
   Any request that tab then made (e.g. placing an order) went out
   with the ADMIN's token, so the order was recorded under the
   admin's account instead of the real customer's.

   Fix: two fully separate, independently-keyed auth namespaces —
   `Auth` for the customer/client side and `AdminAuth` for the
   admin side. They never read or write each other's storage key,
   so an admin login in one tab can no longer hijack a customer
   session (or vice versa) in another tab.
   ============================================================ */

"use strict";

function _makeAuthStore(tokenKey, userKey) {
  return {
    TOKEN_KEY: tokenKey,
    USER_KEY: userKey,

    setToken(token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    },

    getToken() {
      return localStorage.getItem(this.TOKEN_KEY);
    },

    clearToken() {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    },

    isLoggedIn() {
      return !!this.getToken();
    },

    // Called after successful login.
    loginSuccess(token, user) {
      this.setToken(token);
      if (user) localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    },

    getUser() {
      try {
        return JSON.parse(localStorage.getItem(this.USER_KEY)) || {};
      } catch {
        return {};
      }
    },

    requireAuth(loginPage = "login.html") {
      if (!this.isLoggedIn()) {
        const returnTo = encodeURIComponent(window.location.href);
        window.location.href = `${loginPage}?returnTo=${returnTo}`;
      }
    },
  };
}

// Customer / client-side session — used by login.js, register.js,
// profile.js, track-order.js, invoice.js, home.js, header.js, etc.
const Auth = _makeAuthStore("d2d_client_token", "d2d_client_user");

// Admin-side session — used only by admin-login.js / admin-dashboard.js /
// admin-reports.js. Completely separate storage keys from `Auth` above.
const AdminAuth = _makeAuthStore("d2d_admin_token", "d2d_admin_user");

window.Auth = Auth;
window.AdminAuth = AdminAuth;
