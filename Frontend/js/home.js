(function () {
  "use strict";

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

  async function boot() {
    await Promise.all([
      loadComponent("header-placeholder", "./header.html"),
      loadComponent("footer-placeholder", "./footer.html"),
    ]);

    // ← Replace the two loadScript lines with these:
    await loadScript("./js/auth.js");
    await loadScript("./js/api.js");
    await loadScript("./js/header.js");
    if (window.Header) Header.init(); // ← init AFTER header HTML is injected
    await loadScript("./js/footer.js");

    initReveal();
    initCounters();
    initTestimonialSlider();
  }

  // ── Scroll Reveal ──
  function initReveal() {
    const els = document.querySelectorAll("[data-reveal]");
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
      { threshold: 0.1 }
    );
    els.forEach((el) => obs.observe(el));
  }

  // ── Animated Counters — works for both .stats-num and .stat-val ──
  function animateCounter(el, target, duration) {
    const step = target / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        el.textContent = target.toLocaleString("en-IN");
        clearInterval(timer);
      } else {
        el.textContent = Math.floor(current).toLocaleString("en-IN");
      }
    }, 16);
  }

  function initCounters() {
    const nums = document.querySelectorAll("[data-count]");
    if (!nums.length) return;
    if (!("IntersectionObserver" in window)) {
      nums.forEach((el) => {
        el.textContent = parseInt(el.dataset.count, 10).toLocaleString("en-IN");
      });
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(
              entry.target,
              parseInt(entry.target.dataset.count, 10),
              1800
            );
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    nums.forEach((el) => obs.observe(el));
  }

  // ── Testimonial Slider ──
  function initTestimonialSlider() {
    const track = document.getElementById("testimonialsTrack");
    const dotsContainer = document.getElementById("testiDots");
    if (!track || !dotsContainer) return;

    const cards = track.querySelectorAll(".testi-card");
    let current = 0;
    let autoTimer = null;
    const GAP = 24;

    cards.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.className = "testi-dot" + (i === 0 ? " active" : "");
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", `Testimonial ${i + 1}`);
      dot.addEventListener("click", () => goTo(i));
      dotsContainer.appendChild(dot);
    });

    function getCardWidth() {
      return cards[0] ? cards[0].offsetWidth + GAP : 424;
    }

    function goTo(index) {
      current = index;
      track.style.transform = `translateX(-${current * getCardWidth()}px)`;
      dotsContainer.querySelectorAll(".testi-dot").forEach((d, i) => {
        d.classList.toggle("active", i === current);
      });
    }

    function startAuto() {
      autoTimer = setInterval(() => goTo((current + 1) % cards.length), 4200);
    }
    function stopAuto() {
      clearInterval(autoTimer);
    }

    startAuto();
    track.parentElement.addEventListener("mouseenter", stopAuto);
    track.parentElement.addEventListener("mouseleave", startAuto);

    let touchStartX = 0;
    track.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.touches[0].clientX;
        stopAuto();
      },
      { passive: true }
    );
    track.addEventListener("touchend", (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50)
        goTo(
          diff > 0
            ? Math.min(current + 1, cards.length - 1)
            : Math.max(current - 1, 0)
        );
      startAuto();
    });
  }

  boot();
})();
