/* ============================================================
   Door2Door Laundry — admin/js/admin-login.js
   Admin-only login. Rejects non-admin accounts even if the
   email/password are valid, and never stores their token.
   ============================================================ */

"use strict";

function $(id) {
  return document.getElementById(id);
}

function setError(fieldId, msg) {
  const errEl = $("err-" + fieldId);
  const inputEl = $(fieldId);
  if (errEl) errEl.textContent = msg;
  if (inputEl) inputEl.classList.toggle("is-error", !!msg);
}

function showBanner(msg) {
  const banner = $("formErrorBanner");
  const text = $("formErrorMsg");
  if (!banner) return;
  if (msg) {
    text.textContent = msg;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

function validateAll() {
  const email = $("email").value.trim();
  const password = $("password").value;
  let ok = true;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError("email", "Enter a valid email address.");
    ok = false;
  } else {
    setError("email", "");
  }

  if (!password) {
    setError("password", "Password is required.");
    ok = false;
  } else {
    setError("password", "");
  }

  return ok;
}

async function submitAdminLogin() {
  showBanner("");
  if (!validateAll()) return;

  const email = $("email").value.trim();
  const password = $("password").value;

  const btn = $("loginBtn");
  const txt = $("loginText");
  const spinner = $("loginSpinner");
  btn.disabled = true;
  txt.style.display = "none";
  spinner.style.display = "inline-block";

  try {
    const data = await AuthAPI.adminLogin(email, password);

    if (!data.data || !data.data.isAdmin) {
      // Not an admin account — do not let them stay logged in on this page
      AdminAuth.clearToken();
      showBanner("This account does not have admin access.");
      return;
    }

    // Store admin session info (separate key so it never mixes with
    // the customer-side d2d_user data written by the main login.js)
    localStorage.setItem(
      "d2d_admin",
      JSON.stringify({ name: data.data.name, email: data.data.email })
    );

    window.location.href = "dashboard.html";
  } catch (err) {
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("invalid") || msg.includes("not found")) {
      showBanner("Incorrect email or password.");
    } else if (msg.includes("network") || msg.includes("failed to fetch")) {
      showBanner("Network error. Please check your connection and try again.");
    } else {
      showBanner(err.message || "Login failed. Please try again.");
    }
  } finally {
    btn.disabled = false;
    txt.style.display = "";
    spinner.style.display = "none";
  }
}

function initPasswordToggle() {
  const btn = $("pwdToggle");
  const input = $("password");
  const icon = $("eyeIcon");
  if (!btn || !input || !icon) return;

  btn.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    icon.innerHTML = isHidden
      ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8
                  a18.45 18.45 0 015.06-5.94"/>
         <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8
                  a18.5 18.5 0 01-2.16 3.19"/>
         <line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
         <circle cx="12" cy="12" r="3"/>`;
  });
}

function initEnterKey() {
  ["email", "password"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitAdminLogin();
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // If already logged in as admin, skip straight to dashboard
  if (window.AdminAuth && AdminAuth.isLoggedIn() && localStorage.getItem("d2d_admin")) {
    window.location.href = "dashboard.html";
    return;
  }
  initPasswordToggle();
  initEnterKey();
  window.submitAdminLogin = submitAdminLogin;
});