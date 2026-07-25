(function () {
  "use strict";

  function getEl(id) {
    return document.getElementById(id);
  }

  function init() {
    // ── 1. Scroll shadow ──
    const header = getEl("siteHeader");
    if (header) {
      window.addEventListener(
        "scroll",
        () => {
          header.classList.toggle("scrolled", window.scrollY > 10);
        },
        { passive: true }
      );
    }

    // ── 2. Hamburger ──
    const hamburger = getEl("hamburger");
    const mobileMenu = getEl("mobileMenu");

    function closeMobile() {
      if (!mobileMenu || !hamburger) return;
      mobileMenu.classList.remove("open");
      hamburger.classList.remove("active");
      hamburger.setAttribute("aria-expanded", "false");
      mobileMenu.setAttribute("aria-hidden", "true");
    }

    if (hamburger && mobileMenu) {
      hamburger.addEventListener("click", () => {
        const open = mobileMenu.classList.toggle("open");
        hamburger.classList.toggle("active", open);
        hamburger.setAttribute("aria-expanded", open);
        mobileMenu.setAttribute("aria-hidden", !open);
      });
      document.querySelectorAll(".mobile-link").forEach((link) => {
        link.addEventListener("click", closeMobile);
      });
    }

    // ── 3. Active nav link ──
    const currentPage =
      window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-link, .mobile-link").forEach((link) => {
      link.classList.toggle(
        "active",
        link.getAttribute("href") === currentPage
      );
    });

    // ── 4. User dropdown ──
    const userMenu = getEl("userMenu");
    const userAvatarBtn = getEl("userAvatarBtn");
    const userDropdown = getEl("userDropdown");

    if (userAvatarBtn && userDropdown) {
      userAvatarBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = userDropdown.classList.toggle("open");
        userAvatarBtn.setAttribute("aria-expanded", open);
      });
    }

    document.addEventListener("click", (e) => {
      if (userMenu && !userMenu.contains(e.target)) {
        userDropdown?.classList.remove("open");
        userAvatarBtn?.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        userDropdown?.classList.remove("open");
        closeMobile();
      }
    });

    // ── 5. Logout handler ──
    const logoutBtn = getEl("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.Auth?.clearToken();
        setLoggedOut();
        window.location.href = "index.html";
      });
    }

    // ── 6. Restore auth state ──
    try {
      const saved = localStorage.getItem("d2d_user");
      if (saved) setLoggedIn(JSON.parse(saved));
    } catch (_) {
      localStorage.removeItem("d2d_user");
    }
  }

  // ── Auth state functions ──
  function setLoggedIn(user) {
    if (!user?.name) return;

    const loginBtn = getEl("loginBtn");
    const bookBtn = getEl("bookBtn");
    const userMenu = getEl("userMenu");
    const mobileLoginBtn = getEl("mobileLoginBtn");
    const mobileBookBtn = getEl("mobileBookBtn");
    const userInitial = getEl("userInitial");
    const dropdownName = getEl("dropdownUserName");

    if (loginBtn) loginBtn.style.display = "none";
    if (bookBtn) bookBtn.style.display = "flex";
    if (userMenu) userMenu.style.display = "flex";
    if (mobileLoginBtn) mobileLoginBtn.style.display = "none";
    if (mobileBookBtn) mobileBookBtn.style.display = "flex";
    if (userInitial)
      userInitial.textContent = user.name.charAt(0).toUpperCase();
    if (dropdownName) dropdownName.textContent = user.name;

    localStorage.setItem("d2d_user", JSON.stringify(user));
  }

  function setLoggedOut() {
    const loginBtn = getEl("loginBtn");
    const bookBtn = getEl("bookBtn");
    const userMenu = getEl("userMenu");
    const mobileLoginBtn = getEl("mobileLoginBtn");
    const mobileBookBtn = getEl("mobileBookBtn");

    if (loginBtn) loginBtn.style.display = "";
    if (bookBtn) bookBtn.style.display = "none";
    if (userMenu) userMenu.style.display = "none";
    if (mobileLoginBtn) mobileLoginBtn.style.display = "";
    if (mobileBookBtn) mobileBookBtn.style.display = "none";

    localStorage.removeItem("d2d_user");
  }

  // ── Public API ──
  window.Header = { init, setLoggedIn, setLoggedOut };

  // Auto-init if header is already in the DOM (index.html, direct pages)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init(); // DOM already ready (script injected after load)
  }
})();
