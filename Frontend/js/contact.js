/* ============================================================
   Door2Door Laundry — js/contact.js
   Handles:
     • Header + Footer component loading
     • Scroll reveal animations
     • Lazy map load
     • Contact form validation + email via backend
   ============================================================ */

"use strict";

/* ─────────────────────────────────────────
   COMPONENT LOADER (same pattern as home.js)
───────────────────────────────────────── */
async function loadComponent(placeholderId, filePath) {
  const el = document.getElementById(placeholderId);
  if (!el) return;
  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`Failed to load ${filePath}`);
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const content = doc.body.firstElementChild;
    if (content) el.replaceWith(content);
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

/* ─────────────────────────────────────────
   SCROLL REVEAL
───────────────────────────────────────── */
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
          const delay = parseInt(entry.target.dataset.delay || "0", 10);
          setTimeout(() => entry.target.classList.add("visible"), delay);
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  els.forEach((el) => obs.observe(el));
}

/* ─────────────────────────────────────────
   LAZY MAP
───────────────────────────────────────── */
function initLazyMap() {
  const iframe = document.getElementById("ctMap");
  if (!iframe) return;
  const src = iframe.getAttribute("data-src");
  if (!src) return;

  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          iframe.setAttribute("src", src);
          iframe.removeAttribute("data-src");
          obs.disconnect();
        }
      });
    }, { rootMargin: "300px" });
    obs.observe(iframe);
  } else {
    iframe.setAttribute("src", src);
  }
}

/* ─────────────────────────────────────────
   FORM VALIDATION + SUBMIT
───────────────────────────────────────── */
function getVal(id) { return (document.getElementById(id)?.value || "").trim(); }
function setErr(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}
function clearErrs() {
  ["ctNameErr", "ctPhoneErr", "ctEmailErr", "ctSubjectErr", "ctMessageErr"].forEach(
    (id) => setErr(id, "")
  );
  document.querySelectorAll(".ct-input").forEach((el) => el.classList.remove("ct-error"));
}
function markErr(inputId, errId, msg) {
  setErr(errId, msg);
  document.getElementById(inputId)?.classList.add("ct-error");
}

function validateForm() {
  clearErrs();
  let valid = true;

  const name    = getVal("ctName");
  const phone   = getVal("ctPhone");
  const email   = getVal("ctEmail");
  const subject = getVal("ctSubject");
  const message = getVal("ctMessage");

  if (name.length < 2) {
    markErr("ctName", "ctNameErr", "Please enter your name.");
    valid = false;
  }
  if (!/^\d{10}$/.test(phone)) {
    markErr("ctPhone", "ctPhoneErr", "Enter a valid 10-digit mobile number.");
    valid = false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    markErr("ctEmail", "ctEmailErr", "Enter a valid email address.");
    valid = false;
  }
  if (!subject) {
    markErr("ctSubject", "ctSubjectErr", "Please select a subject.");
    valid = false;
  }
  if (message.length < 10) {
    markErr("ctMessage", "ctMessageErr", "Message must be at least 10 characters.");
    valid = false;
  }
  return valid;
}

function initContactForm() {
  const form      = document.getElementById("contactForm");
  const submitBtn = document.getElementById("ctSubmitBtn");
  const successEl = document.getElementById("ctSuccess");
  const errorEl   = document.getElementById("ctFormError");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    // Loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="ct-spinner"></span> Sending…`;
    successEl.style.display = "none";
    errorEl.style.display   = "none";

    const payload = {
      name:    getVal("ctName"),
      phone:   getVal("ctPhone"),
      email:   getVal("ctEmail"),
      subject: getVal("ctSubject"),
      message: getVal("ctMessage"),
    };

    try {
      // ── Try backend endpoint if it exists ──────────────────
      // If you add POST /api/contact on your Flask backend, it will be called.
      // Otherwise, we fall through to the fallback below.
      const API_BASE = window.API_BASE || "http://127.0.0.1:5001/api";
      const res = await fetch(`${API_BASE}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("server_error");
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed");

      _showSuccess(form, successEl, submitBtn);

    } catch (err) {
      if (err.message === "server_error" || err.message.includes("fetch") || err.message.includes("Failed to fetch")) {
        // ── Fallback: open mailto if no backend endpoint yet ──
        const mailBody = encodeURIComponent(
          `Name: ${payload.name}\nPhone: ${payload.phone}\nEmail: ${payload.email}\nSubject: ${payload.subject}\n\nMessage:\n${payload.message}`
        );
        window.location.href = `mailto:quicklaundry0212@gmail.com?subject=Contact: ${encodeURIComponent(payload.subject)}&body=${mailBody}`;
        _showSuccess(form, successEl, submitBtn);
      } else {
        errorEl.textContent = "Something went wrong. Please try again or call us directly.";
        errorEl.style.display = "";
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
          Send Message
        `;
      }
    }
  });
}

function _showSuccess(form, successEl, submitBtn) {
  // Reset and hide form fields, show success
  document.getElementById("ctName").value    = "";
  document.getElementById("ctPhone").value   = "";
  document.getElementById("ctEmail").value   = "";
  document.getElementById("ctSubject").value = "";
  document.getElementById("ctMessage").value = "";

  successEl.style.display = "flex";
  submitBtn.disabled = false;
  submitBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
    Send Message
  `;
  // Scroll success into view
  successEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ─────────────────────────────────────────
   BOOT
───────────────────────────────────────── */
async function boot() {
  await Promise.all([
    loadComponent("header-placeholder", "./header.html"),
    loadComponent("footer-placeholder", "./footer.html"),
  ]);

  await loadScript("./js/auth.js");
  await loadScript("./js/api.js");
  await loadScript("./js/header.js");
  if (window.Header) Header.init();
  await loadScript("./js/footer.js");

  initReveal();
  initLazyMap();
  initContactForm();
}

document.addEventListener("DOMContentLoaded", boot);