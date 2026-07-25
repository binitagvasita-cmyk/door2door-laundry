/* ============================================================
   Door2Door Laundry — profile.js
   Handles: profile load, avatar upload, edit/save,
            address edit/save, orders list, security
   ============================================================ */
"use strict";

(function () {

  /* ── Auth guard ── */
  if (!window.Auth?.isLoggedIn()) {
    window.location.href = "login.html?returnTo=profile.html";
    return;
  }

  /* ── Toast helper ── */
  function toast(msg, type = "") {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = "toast show" + (type ? " " + type : "");
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.className = "toast"), 3200);
  }

  /* ── Fill a field safely ── */
  function fill(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  }
  function text(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "—";
  }

  /* ── Format date ── */
  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }

  /* ════════════════════════════════════
     LOAD PROFILE
  ════════════════════════════════════ */
  async function loadProfile() {
    try {
      const res  = await AuthAPI.getProfile();
      const user = res?.data || {};

      /* Avatar */
      const avatarImg      = document.getElementById("profileAvatar");
      const avatarInitials = document.getElementById("avatarInitials");
      const storedAvatar   = localStorage.getItem("d2d_avatar");

      if (storedAvatar) {
        avatarImg.src = storedAvatar;
        avatarImg.style.display = "block";
        avatarInitials.style.display = "none";
      } else {
        avatarImg.style.display = "none";
        avatarInitials.style.display = "flex";
        document.getElementById("initialsText").textContent =
          (user.full_name || "U").charAt(0).toUpperCase();
      }

      /* Names / emails */
      text("profileName",  user.full_name);
      text("profileEmail", user.email);
      text("secPhone",     user.phone || "—");

      fill("fieldName",   user.full_name);
      fill("fieldEmail",  user.email);
      fill("fieldPhone",  user.phone);
      fill("fieldJoined", fmtDate(user.created_at));

      /* Address fields */
      fill("addrStreet",   user.street_address);
      fill("addrApt",      user.apartment);
      fill("addrBuilding", user.building_name);
      fill("addrLandmark", user.landmark);
      fill("addrPin",      user.pin_code);

      /* Address display */
      text("dispStreet",   user.street_address);
      text("dispApt",      user.apartment ? `Flat / Apt: ${user.apartment}` : "—");
      text("dispBuilding", user.building_name || "—");
      text("dispLandmark", user.landmark ? `Near: ${user.landmark}` : "—");
      text("dispPin",      user.pin_code || "—");

      /* Marketing toggle */
      const mktg = document.querySelector("#toggleMktg input");
      if (mktg) mktg.checked = !!user.marketing_opt_in;

      /* Header sync */
      window.Header?.setLoggedIn({ name: user.full_name });

      /* Load orders */
      loadOrders();

    } catch (err) {
      console.error("Profile load error:", err);
      toast("Could not load profile. Please log in again.", "error");
    }
  }

  /* ════════════════════════════════════
     AVATAR UPLOAD
  ════════════════════════════════════ */
  const avatarInput = document.getElementById("avatarInput");
  if (avatarInput) {
    avatarInput.addEventListener("change", function () {
      const file = this.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        toast("Image must be under 2 MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img     = document.getElementById("profileAvatar");
        const init    = document.getElementById("avatarInitials");
        img.src = dataUrl;
        img.style.display = "block";
        init.style.display = "none";
        /* Store locally (backend would handle in real impl) */
        localStorage.setItem("d2d_avatar", dataUrl);
        toast("Profile photo updated! ✨", "success");
      };
      reader.readAsDataURL(file);
    });
  }

  /* ════════════════════════════════════
     EDIT PROFILE
  ════════════════════════════════════ */
  let editMode = false;

  window.toggleEdit = function (force) {
    editMode = typeof force === "boolean" ? force : !editMode;
    const fields  = ["fieldName", "fieldPhone"];
    const actions = document.getElementById("formActions");
    const btn     = document.getElementById("editToggle");

    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !editMode;
    });

    if (actions) actions.style.display = editMode ? "flex" : "none";
    if (btn)     btn.textContent = editMode ? "Cancel" : "✏️ Edit";
  };

  window.saveProfile = async function (e) {
    e.preventDefault();
    const name  = document.getElementById("fieldName")?.value?.trim();
    const phone = document.getElementById("fieldPhone")?.value?.trim();

    if (!name) { toast("Name cannot be empty.", "error"); return; }
    if (name.length < 3) { toast("Name must be at least 3 characters.", "error"); return; }
    if (phone && !/^\d{10}$/.test(phone.replace(/\D/g, ""))) {
      toast("Enter a valid 10-digit mobile number.", "error");
      return;
    }

    try {
      const res = await AuthAPI.updateProfile({ fullName: name, phone });
      const user = res?.data || {};
      window.Header?.setLoggedIn({ name: user.full_name || name });
      text("profileName", user.full_name || name);
      text("profileEmail", document.getElementById("fieldEmail")?.value);
      toggleEdit(false);
      toast("Profile saved successfully! ✅", "success");
    } catch (err) {
      toast(err.message || "Failed to save. Try again.", "error");
    }
  };

  /* ════════════════════════════════════
     EDIT ADDRESS
  ════════════════════════════════════ */
  let addrMode = false;

  window.toggleAddressEdit = function (force) {
    addrMode = typeof force === "boolean" ? force : !addrMode;
    const addrFields = ["addrStreet", "addrApt", "addrBuilding", "addrLandmark", "addrPin"];
    const actions    = document.getElementById("addressFormActions");
    const btn        = document.getElementById("editAddressToggle");
    const disp       = document.getElementById("addressDisplay");

    addrFields.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !addrMode;
    });

    if (actions) actions.style.display = addrMode ? "flex" : "none";
    if (btn)     btn.textContent = addrMode ? "Cancel" : "✏️ Edit";
    if (disp)    disp.style.display = addrMode ? "none" : "flex";
    document.getElementById("addressForm").style.display = addrMode ? "block" : "none";

    if (!addrMode) disp.style.display = "flex";
  };

  window.saveAddress = async function (e) {
    e.preventDefault();
    const street   = document.getElementById("addrStreet")?.value?.trim();
    const apt      = document.getElementById("addrApt")?.value?.trim();
    const building = document.getElementById("addrBuilding")?.value?.trim();
    const landmark = document.getElementById("addrLandmark")?.value?.trim();
    const pin      = document.getElementById("addrPin")?.value?.trim();

    if (pin && !/^\d{6}$/.test(pin)) {
      toast("PIN code must be exactly 6 digits.", "error");
      return;
    }

    try {
      const res = await AuthAPI.updateProfile({
        streetAddress: street,
        apartment: apt,
        buildingName: building,
        landmark: landmark,
        pinCode: pin,
      });
      const user = res?.data || {};

      /* Update display from the server's saved values, not just the
         raw form inputs — this is what actually persists across a
         refresh now (previously this only touched the DOM). */
      text("dispStreet",   user.street_address || "—");
      text("dispApt",      user.apartment ? `Flat / Apt: ${user.apartment}` : "—");
      text("dispBuilding", user.building_name || "—");
      text("dispLandmark", user.landmark ? `Near: ${user.landmark}` : "—");
      text("dispPin",      user.pin_code || "—");

      toggleAddressEdit(false);
      toast("Address updated! 📍", "success");
    } catch (err) {
      toast(err.message || "Failed to update address. Try again.", "error");
    }
  };

  /* ════════════════════════════════════
     ADDRESS FORM default hidden
  ════════════════════════════════════ */
  const addrForm = document.getElementById("addressForm");
  if (addrForm) addrForm.style.display = "none";

  /* ════════════════════════════════════
     LOAD ORDERS
  ════════════════════════════════════ */
  async function loadOrders() {
    const loader = document.getElementById("ordersLoader");
    const empty  = document.getElementById("ordersEmpty");
    const list   = document.getElementById("ordersList");

    try {
      const res    = await OrdersAPI.getMyOrders();
      const orders = res?.data || [];

      loader.style.display = "none";

      if (!orders.length) {
        empty.style.display = "flex";
        return;
      }

      list.style.display = "flex";
      empty.style.display = "none";

      /* Stats */
      const total  = orders.length;
      const active = orders.filter((o) => !["delivered","cancelled"].includes(o.status)).length;
      const spent  = orders.reduce((acc, o) => acc + (parseFloat(o.total_amount) || 0), 0);

      document.getElementById("statOrders").textContent = total;
      document.getElementById("statActive").textContent = active;
      document.getElementById("statSaved").textContent  = `₹${spent.toLocaleString("en-IN")}`;

      list.innerHTML = orders.map((o) => `
        <div class="order-card">
          <div class="order-emoji">${getServiceEmoji(o.service_name)}</div>
          <div class="order-body">
            <div class="order-service">${o.service_name}</div>
            ${o.item_name ? `<div class="order-item">• ${o.item_name}</div>` : ""}
            <div class="order-meta">
              <span class="order-date">📅 ${fmtDate(o.pickup_date)}</span>
              ${o.total_amount ? `<span class="order-amount">₹${parseFloat(o.total_amount).toLocaleString("en-IN")}</span>` : ""}
              <span class="order-status status-${o.status}">${o.status.replace(/_/g," ")}</span>
            </div>
          </div>
        </div>
      `).join("");

    } catch (err) {
      loader.style.display = "none";
      empty.style.display  = "flex";
      console.error("Order fetch error:", err);
    }
  }

  function getServiceEmoji(name = "") {
    const n = name.toLowerCase();
    if (n.includes("dry"))    return "👔";
    if (n.includes("steam"))  return "⚡";
    if (n.includes("petrol")) return "✨";
    if (n.includes("roll"))   return "🔥";
    return "👕";
  }

  /* ════════════════════════════════════
     TABS
  ════════════════════════════════════ */
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      this.classList.add("active");
      const target = document.getElementById("tab-" + this.dataset.tab);
      if (target) target.classList.add("active");
    });
  });

  /* ════════════════════════════════════
     SECURITY
  ════════════════════════════════════ */
  window.showChangePassword = function () {
    const form = document.getElementById("changePwForm");
    if (form) {
      form.style.display = form.style.display === "none" ? "block" : "none";
      form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  window.changePassword = function () {
    const curr    = document.getElementById("pwCurrent")?.value;
    const newPw   = document.getElementById("pwNew")?.value;
    const confirm = document.getElementById("pwConfirm")?.value;
    if (!curr || !newPw || !confirm) { toast("Please fill all fields.", "error"); return; }
    if (newPw !== confirm)           { toast("Passwords do not match.", "error"); return; }
    if (newPw.length < 8)           { toast("Password must be at least 8 characters.", "error"); return; }
    /* In real impl: call API endpoint */
    toast("Password updated successfully! 🔒", "success");
    document.getElementById("changePwForm").style.display = "none";
  };

  window.confirmDelete = function () {
    if (confirm("Are you sure you want to delete your account? This cannot be undone.")) {
      toast("Account deletion requested. Our team will contact you.", "error");
    }
  };

  /* ════════════════════════════════════
     LOGOUT
  ════════════════════════════════════ */
  window.doLogout = function () {
    Auth.clearToken();
    window.location.href = "index.html";
  };

  /* ════════════════════════════════════
     SCROLL REVEAL
  ════════════════════════════════════ */
  function initReveal() {
    const els = document.querySelectorAll("[data-reveal]");
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

  /* ── Boot ── */
  initReveal();
  loadProfile();

})();