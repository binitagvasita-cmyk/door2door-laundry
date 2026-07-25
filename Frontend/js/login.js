/* ============================================================
   Door2Door Laundry — login.js
   Handles:
     • Header + Footer component loading
     • Form validation (inline)
     • Login API call via AuthAPI
     • JWT + user storage via Auth utility
     • Redirect after success (with returnTo support)
     • Password show/hide toggle
   ============================================================ */

"use strict";

/* ──────────────────────────────────────────
      1. COMPONENT LOADER
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
    const component = doc.body.firstElementChild || doc.body;
    el.replaceWith(component.cloneNode ? component : el);
    if (component.cloneNode) el.replaceWith(component);
  } catch (err) {
    console.warn(`Component load error (${filePath}):`, err.message);
  }
}

function loadScript(src) {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = resolve;
    document.body.appendChild(s);
  });
}

/* ──────────────────────────────────────────
      2. HELPERS
      ────────────────────────────────────────── */

function $(id) {
  return document.getElementById(id);
}

function setError(fieldId, msg) {
  const errEl = $("err-" + fieldId);
  const inputEl = $(fieldId);
  if (errEl) errEl.textContent = msg;
  if (inputEl) {
    inputEl.classList.toggle("is-error", !!msg);
    inputEl.classList.toggle("is-valid", !msg && inputEl.value.trim() !== "");
  }
}

function showBanner(msg, type = "error") {
  const banner = $("formErrorBanner");
  const text = $("formErrorMsg");
  if (!banner) return;
  if (msg) {
    text.textContent = msg;
    banner.style.display = "flex";
    // Teal colour for info banners (already-logged-in notice)
    banner.style.background = type === "info" ? "#e8f9f9" : "";
    banner.style.borderColor = type === "info" ? "#42BABC" : "";
    banner.style.color = type === "info" ? "#1a6a6a" : "";
  } else {
    banner.style.display = "none";
    banner.style.background = "";
    banner.style.borderColor = "";
    banner.style.color = "";
  }
}

/* ──────────────────────────────────────────
      3. VALIDATION
      ────────────────────────────────────────── */

const validators = {
  email(val) {
    if (!val.trim()) return "Email address is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()))
      return "Please enter a valid email address.";
    return "";
  },
  password(val) {
    if (!val) return "Password is required.";
    if (val.length < 6) return "Password must be at least 6 characters.";
    return "";
  },
};

function validateField(fieldId) {
  const el = $(fieldId);
  if (!el) return true;
  const fn = validators[fieldId];
  if (!fn) return true;
  const msg = fn(el.value);
  setError(fieldId, msg);
  return !msg;
}

function validateAll() {
  // NB: must NOT short-circuit with && — both fields need their
  // error state set even if the first one is already invalid.
  const emailOk = validateField("email");
  const passwordOk = validateField("password");
  return emailOk && passwordOk;
}

/* ──────────────────────────────────────────
      4. PASSWORD TOGGLE
      ────────────────────────────────────────── */

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

/* ──────────────────────────────────────────
      5. LIVE VALIDATION
      ────────────────────────────────────────── */

function initLiveValidation() {
  ["email", "password"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("blur", () => validateField(id));
    el.addEventListener("input", () => {
      if (el.classList.contains("is-error")) validateField(id);
    });
  });
}

/* ──────────────────────────────────────────
      6. REDIRECT HELPER
      ────────────────────────────────────────── */

function getReturnUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo");
    if (returnTo) return decodeURIComponent(returnTo);
  } catch (_) {}
  return "index.html";
}

/* ──────────────────────────────────────────
      7. SUBMIT
      ────────────────────────────────────────── */

async function submitLogin() {
  showBanner("");

  if (!validateAll()) return;

  const email = $("email").value.trim();
  const password = $("password").value;

  const btn = $("loginBtn");
  const txt = $("loginText");
  const spinner = $("loginSpinner");
  if (btn) btn.disabled = true;
  if (txt) txt.style.display = "none";
  if (spinner) spinner.style.display = "inline-block";

  try {
    const data = await AuthAPI.login(email, password);
    localStorage.setItem(
      "d2d_user",
      JSON.stringify({ name: data.data.name, email: data.data.email })
    );
    showSuccess(data.data.name);
  } catch (err) {
    const msg = err.message || "";
    if (
      msg.toLowerCase().includes("invalid") ||
      msg.toLowerCase().includes("not found")
    ) {
      showBanner("Incorrect email or password. Please try again.");
    } else if (
      msg.toLowerCase().includes("network") ||
      msg.toLowerCase().includes("failed to fetch")
    ) {
      showBanner("Network error. Please check your connection and try again.");
    } else {
      showBanner(msg || "Login failed. Please try again.");
    }
  } finally {
    if (btn) btn.disabled = false;
    if (txt) txt.style.display = "";
    if (spinner) spinner.style.display = "none";
  }
}

/* ──────────────────────────────────────────
      8. SUCCESS STATE
      ────────────────────────────────────────── */

function showSuccess(name) {
  const form = $("loginForm");
  const success = $("loginSuccess");
  const subMsg = $("successSubMsg");

  if (form) form.style.display = "none";
  if (success) success.classList.add("active");
  if (subMsg && name)
    subMsg.textContent = `Welcome back, ${name}! Redirecting you now…`;

  if (window.Header) Header.setLoggedIn({ name });

  setTimeout(() => {
    window.location.href = getReturnUrl();
  }, 2000);
}

/* ──────────────────────────────────────────
      9. ALREADY-LOGGED-IN CHECK
      ────────────────────────────────────────── */

async function checkAlreadyLoggedIn() {
  if (!window.Auth || !Auth.isLoggedIn()) return; // no token → nothing to do

  // If URL has ?switch=1 (e.g. from "Log in as different account" link),
  // clear the existing session and let the user log in fresh.
  const params = new URLSearchParams(window.location.search);
  if (params.get("switch") === "1") {
    Auth.clearToken();
    return;
  }

  try {
    // Verify the stored token is actually still valid
    const data = await AuthAPI.getProfile();
    const name = data?.data?.full_name || Auth.getUser()?.name || "there";

    // ── Token is valid: show a soft notice instead of silently redirecting ──
    // This prevents the "blink back to home" after registration.
    showBanner(
      `✅ You're already signed in as ${name}. ` +
        `<a href="${getReturnUrl()}" style="color:#1a6a6a;font-weight:600;text-decoration:underline;">` +
        `Go to Home</a> or log in as a different account below.`,
      "info"
    );

    // Allow the banner HTML to render (showBanner uses textContent — swap to innerHTML here)
    const text = $("formErrorMsg");
    if (text) {
      text.innerHTML =
        `✅ Already signed in as <strong>${name}</strong>. ` +
        `<a href="${getReturnUrl()}" style="color:#1a6a6a;font-weight:600;">Go to Home</a>` +
        ` or sign in as a different account below.`;
    }
  } catch (_) {
    // Token expired or invalid → clear it silently, stay on login page
    Auth.clearToken();
  }
}

/* ──────────────────────────────────────────
      10. ENTER KEY SUPPORT
      ────────────────────────────────────────── */

function initEnterKey() {
  ["email", "password"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitLogin();
      }
    });
  });
}

/* ──────────────────────────────────────────
      11. BOOT
      ────────────────────────────────────────── */

async function boot() {
  await Promise.all([
    loadComponent("header-placeholder", "header.html"),
    loadComponent("footer-placeholder", "footer.html"),
  ]);

  await loadScript("js/header.js");
  await loadScript("js/footer.js");

  await checkAlreadyLoggedIn();

  initPasswordToggle();
  initLiveValidation();
  initEnterKey();
  window.submitLogin = submitLogin;
}

document.addEventListener("DOMContentLoaded", boot);