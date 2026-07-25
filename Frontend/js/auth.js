/* ============================================================
   Door2Door Laundry — auth.js
   JWT store / read / logout helper.
   Include this BEFORE api.js on every page.

   IMPORTANT: customer sessions and admin sessions use completely
   separate localStorage keys (via _makeAuthStore). Previously both
   shared the same keys, so logging into the admin panel in one tab
   would silently hijack whatever customer session was open in
   another tab — actions taken as "logged in customer" would
   actually run as the admin. Auth and AdminAuth below never touch
   each other's storage.
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

    // Called after successful login — kept separate from setToken
    // so login.js code works without changes to this file
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

    requireAuth() {
      if (!this.isLoggedIn()) {
        const returnTo = encodeURIComponent(window.location.href);
        window.location.href = `login.html?returnTo=${returnTo}`;
      }
    },
  };
}

const Auth = _makeAuthStore("d2d_client_token", "d2d_client_user");
const AdminAuth = _makeAuthStore("d2d_admin_token", "d2d_admin_user");

window.Auth = Auth;
window.AdminAuth = AdminAuth;
