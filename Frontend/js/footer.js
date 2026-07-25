(function () {
  "use strict";

  // ── 1. Current year ──
  const yearEl = document.getElementById("footerYear");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ── 2. Lazy-load Google Map ──
  // The map iframe starts with src="about:blank" and data-src holding the real URL.
  // We swap it in as soon as the footer enters the viewport (or immediately on older browsers).
  function loadMap() {
    const mapIframe = document.getElementById("footerMap");
    if (!mapIframe) return;
    const src = mapIframe.getAttribute("data-src");
    if (!src) return;
    mapIframe.setAttribute("src", src);
    mapIframe.removeAttribute("data-src");
  }

  const mapIframe = document.getElementById("footerMap");
  if (mapIframe) {
    if ("IntersectionObserver" in window) {
      const mapObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              loadMap();
              mapObserver.disconnect();
            }
          });
        },
        { rootMargin: "400px" } // load well before user reaches it
      );
      mapObserver.observe(mapIframe);
    } else {
      loadMap(); // fallback: load immediately
    }
  }

  // ── 3. Scroll Reveal ──
  const revealEls = document.querySelectorAll("[data-reveal]");
  if (revealEls.length && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = parseInt(entry.target.dataset.delay || "0", 10);
            setTimeout(() => entry.target.classList.add("visible"), delay);
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("visible"));
  }

  // ── 4. Animated counters ──
  function animateCounter(el, target, duration) {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        el.textContent = target.toLocaleString("en-IN");
        clearInterval(timer);
      } else {
        el.textContent = Math.floor(start).toLocaleString("en-IN");
      }
    }, 16);
  }

  const statNums = document.querySelectorAll(".stat-num[data-count]");
  if (statNums.length && "IntersectionObserver" in window) {
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(
              entry.target,
              parseInt(entry.target.dataset.count, 10),
              1800
            );
            counterObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    statNums.forEach((el) => counterObserver.observe(el));
  } else {
    statNums.forEach((el) => {
      el.textContent = parseInt(el.dataset.count, 10).toLocaleString("en-IN");
    });
  }

  // ── 4b. Hide Login/Register once the customer is already signed in ──
  // (auth.js must be loaded before footer.js on every page that includes
  // the footer component — it already is, per each page's <script> order.)
  if (window.Auth && Auth.isLoggedIn()) {
    const loginLi = document.getElementById("footerLoginLink");
    const registerLi = document.getElementById("footerRegisterLink");
    if (loginLi) loginLi.style.display = "none";
    if (registerLi) registerLi.style.display = "none";
  }

  // ── 5. Active footer link ──
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".footer-links a").forEach((link) => {
    if (link.getAttribute("href") === currentPage) {
      link.style.color = "#ffffff";
      link.style.fontWeight = "600";
    }
  });
})();
