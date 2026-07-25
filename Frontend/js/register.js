/* ============================================================
   Door2Door Laundry — register.js
   3-step registration wizard
   Handles: validation, step transitions, Email OTP flow,
            summary population, form submit, success state
   ============================================================ */

"use strict";

/* ──────────────────────────────────────────
         1.  STATE
      ────────────────────────────────────────── */
const state = {
  currentStep: 1,
  otpSent: false,
  otpVerified: false,
  otpResendTimer: null,
  formData: {},
  emailLocked: false, // true after email OTP is verified
};

/* ──────────────────────────────────────────
         2.  HELPERS
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

function clearError(fieldId) {
  setError(fieldId, "");
}

function showBanner(msg) {
  const banner = $("formErrorBanner");
  const bannerMsg = $("formErrorMsg");
  if (!banner) return;
  if (msg) {
    bannerMsg.textContent = msg;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

/* ──────────────────────────────────────────
         3.  VALIDATION
      ────────────────────────────────────────── */

// All Ahmedabad-area PIN codes served by Door2Door
const SERVED_PINS = new Set([
  "380001",
  "380002",
  "380003",
  "380004",
  "380005",
  "380006",
  "380007",
  "380008",
  "380009",
  "380013",
  "380014",
  "380015",
  "380016",
  "380018",
  "380019",
  "380021",
  "380022",
  "380023",
  "380024",
  "380025",
  "380026",
  "380027",
  "380028",
  "380051",
  "380052",
  "380053",
  "380054",
  "380055",
  "380058",
  "380059",
  "380060",
  "380061",
  "380063",
  "380115",
  "382006",
  "382007",
  "382009",
  "382010",
  "382016",
  "382024",
  "382110",
  "382150",
  "382210",
  "382213",
  "382220",
  "382325",
  "382330",
  "382340",
  "382346",
  "382350",
  "382355",
  "382360",
  "382415",
  "382416",
  "382418",
  "382421",
  "382422",
  "382424",
  "382425",
  "382426",
  "382427",
  "382428",
  "382430",
  "382440",
  "382443",
  "382445",
  "382449",
  "382450",
  "382455",
  "382460",
  "382463",
  "382465",
  "382470",
  "382475",
  "382480",
  "382481",
  "382610",
  "382620",
  "382630",
  "382640",
  "382650",
]);

const validators = {
  fullName(val) {
    if (!val.trim()) return "Full name is required.";
    if (val.trim().length < 3) return "Name must be at least 3 characters.";
    if (!/^[a-zA-Z\s'-]+$/.test(val.trim()))
      return "Name can only contain letters, spaces, hyphens, or apostrophes.";
    return "";
  },
  email(val) {
    if (!val.trim()) return "Email address is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()))
      return "Please enter a valid email address.";
    return "";
  },
  phone(val) {
    const digits = val.replace(/\D/g, "");
    if (!digits) return "Phone number is required.";
    if (digits.length !== 10)
      return "Enter a valid 10-digit Indian mobile number.";
    if (!/^[6-9]/.test(digits)) return "Number must start with 6, 7, 8, or 9.";
    return "";
  },
  password(val) {
    if (!val) return "Password is required.";
    if (val.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(val)) return "Include at least one uppercase letter.";
    if (!/[0-9]/.test(val)) return "Include at least one number.";
    return "";
  },
  confirmPassword(val) {
    const pwd = $("password")?.value || "";
    if (!val) return "Please confirm your password.";
    if (val !== pwd) return "Passwords do not match.";
    return "";
  },
  // streetAddress, buildingName are now optional — no validator needed
  pinCode(val) {
    if (!val || !val.trim()) return ""; // optional field
    const digits = val.replace(/\D/g, "");
    if (digits.length !== 6) return "PIN code must be exactly 6 digits.";
    if (!SERVED_PINS.has(digits))
      return "We currently serve Ahmedabad area only. This PIN is not in our service zone.";
    return "";
  },
};

function validateField(fieldId) {
  const el = $(fieldId);
  if (!el) return true;
  const val = el.value;
  const fn = validators[fieldId];
  if (!fn) return true;
  const msg = fn(val);
  setError(fieldId, msg);
  return !msg;
}

function validateStep(stepNum) {
  let valid = true;
  if (stepNum === 1) {
    ["fullName", "email", "phone", "password", "confirmPassword"].forEach(
      (f) => {
        if (!validateField(f)) valid = false;
      }
    );
  }
  if (stepNum === 2) {
    // Only pinCode needs validation if filled (Ahmedabad-only check)
    if ($("pinCode")?.value.trim()) {
      if (!validateField("pinCode")) valid = false;
    }
  }
  return valid;
}

/* ──────────────────────────────────────────
         4.  STEP NAVIGATION
      ────────────────────────────────────────── */
function goStep(targetStep) {
  const current = state.currentStep;

  // Moving forward — validate first
  if (targetStep > current) {
    if (!validateStep(current)) return;
  }

  // If email is verified and user tries to go back to step 1 from step 3, block only email editing
  // (we allow navigation but keep email locked)

  const currentEl = $("step" + current);
  const targetEl = $("step" + targetStep);
  if (!currentEl || !targetEl) return;

  // Animate out current
  currentEl.classList.add("leaving");
  setTimeout(() => {
    currentEl.classList.remove("active", "leaving");
    targetEl.classList.add("active");
    state.currentStep = targetStep;
    updateIndicator(targetStep);

    // Populate summary on step 3
    if (targetStep === 3) populateSummary();

    // If email is locked, disable email field and show lock notice
    if (state.emailLocked && targetStep === 1) {
      lockEmailField();
    }

    // Scroll to top of form
    document
      .querySelector(".reg-form-wrap")
      ?.scrollTo({ top: 0, behavior: "smooth" });
  }, 260);
}

/* ──────────────────────────────────────────
         5.  STEP INDICATOR
      ────────────────────────────────────────── */
function updateIndicator(step) {
  const dots = document.querySelectorAll(".step-dot");
  const labels = document.querySelectorAll(".step-label");
  const fill = $("trackFill");

  const fillMap = { 1: "0%", 2: "50%", 3: "100%" };
  if (fill) fill.style.width = fillMap[step] || "0%";

  dots.forEach((dot, i) => {
    const dotStep = i + 1;
    dot.classList.remove("active", "completed");
    if (dotStep < step) dot.classList.add("completed");
    else if (dotStep === step) dot.classList.add("active");
  });

  labels.forEach((lbl, i) => {
    const lblStep = i + 1;
    lbl.classList.remove("active", "completed");
    if (lblStep < step) lbl.classList.add("completed");
    else if (lblStep === step) lbl.classList.add("active");
  });

  const indicator = $("stepIndicator");
  if (indicator) indicator.setAttribute("aria-valuenow", step);
}

/* ──────────────────────────────────────────
         6.  PASSWORD STRENGTH
      ────────────────────────────────────────── */
function calcStrength(pwd) {
  if (!pwd) return { score: 0, label: "Enter a password", color: "#CBD5E1" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { score: 20, label: "Weak", color: "#E05252" };
  if (score === 2) return { score: 40, label: "Fair", color: "#F59E0B" };
  if (score === 3) return { score: 60, label: "Good", color: "#3B82F6" };
  if (score === 4) return { score: 80, label: "Strong", color: "#22C55E" };
  return { score: 100, label: "Very Strong", color: "#16A34A" };
}

function updateStrengthBar(pwd) {
  const fill = $("pwdFill");
  const label = $("pwdLabel");
  if (!fill || !label) return;
  const { score, label: lbl, color } = calcStrength(pwd);
  fill.style.width = score + "%";
  fill.style.backgroundColor = color;
  label.textContent = lbl;
  label.style.color = color;
}

/* ──────────────────────────────────────────
         7.  PASSWORD TOGGLE
      ────────────────────────────────────────── */
function initPasswordToggle(btnId, inputId) {
  const btn = $(btnId);
  const input = $(inputId);
  if (!btn || !input) return;

  btn.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    const svg = btn.querySelector("svg");
    if (svg) {
      svg.innerHTML = isHidden
        ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>`;
    }
  });
}

/* ──────────────────────────────────────────
         8.  PIN CODE — AHMEDABAD ONLY CHECK
      ────────────────────────────────────────── */
function checkServiceAvailability(pin) {
  const check = $("serviceCheck");
  const icon = $("serviceIcon");
  const text = $("serviceText");
  if (!check) return;

  if (!pin || pin.length !== 6) {
    check.style.display = "none";
    return;
  }

  const available = SERVED_PINS.has(pin);
  check.style.display = "flex";
  check.className = "service-check" + (available ? "" : " unavailable");
  icon.textContent = available ? "✅" : "❌";
  text.textContent = available
    ? "Great news! We serve your area."
    : "Sorry, we only cover Ahmedabad area PINs. This code is outside our zone.";
}

/* ──────────────────────────────────────────
         9.  SUMMARY POPULATION
      ────────────────────────────────────────── */
function populateSummary() {
  const name = $("fullName")?.value.trim() || "—";
  const email = $("email")?.value.trim() || "—";
  const phone = $("phone")?.value.trim() || "—";

  const street = $("streetAddress")?.value.trim() || "";
  const apt = $("apartment")?.value.trim() || "";
  const building = $("buildingName")?.value.trim() || "";
  const landmark = $("landmark")?.value.trim() || "";
  const pin = $("pinCode")?.value.trim() || "";

  const addrParts = [
    street,
    apt,
    building,
    landmark,
    pin ? "PIN " + pin : "",
  ].filter(Boolean);
  const address = addrParts.join(", ") || "Not provided";

  if ($("sum-name")) $("sum-name").textContent = name;
  if ($("sum-email")) $("sum-email").textContent = email;
  if ($("sum-phone")) $("sum-phone").textContent = phone ? "+91 " + phone : "—";
  if ($("sum-address")) $("sum-address").textContent = address;

  // Email display in OTP section
  const otpEmailDisplay = $("otp-email-display");
  if (otpEmailDisplay) otpEmailDisplay.textContent = email || "—";

  state.formData = { name, email, phone, address, pin };
}

/* ──────────────────────────────────────────
         10.  EMAIL LOCK — after OTP verified
      ────────────────────────────────────────── */
function lockEmailField() {
  const emailInput = $("email");
  const emailHint = $("email-hint");
  if (emailInput) {
    emailInput.disabled = true;
    emailInput.classList.add("is-valid");
  }
  if (emailHint) {
    emailHint.textContent = "✅ Email verified — cannot be changed.";
    emailHint.style.color = "#28A745";
    emailHint.style.fontWeight = "500";
  }
}

function disableEditAfterOtp() {
  // Lock "Edit Details" button and back-to-step-1 navigation
  const editBtn = $("editDetailsBtn");
  if (editBtn) {
    editBtn.disabled = true;
    editBtn.title = "Email is verified — details locked.";
  }
  // Keep Back button (back to step 2) but step-dot click to step 1 won't re-enable email
  state.emailLocked = true;
}

/* ──────────────────────────────────────────
         11.  OTP FLOW (Email — swap for real API later)
      ────────────────────────────────────────── */
let mockOtp = "";

async function sendOtp() {
  const btn = $("sendOtpBtn");
  const inputs = $("otpInputs");
  const verifyBtn = $("verifyOtpBtn");
  const status = $("otpStatus");
  const email = $("email")?.value.trim();
  const name = $("fullName")?.value.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (status) {
      status.textContent =
        "⚠️ Please enter a valid email address in Step 1 first.";
      status.style.color = "#E05252";
    }
    return;
  }

  if (btn) btn.disabled = true;
  if (status) {
    status.textContent = "Sending OTP…";
    status.style.color = "#42BABC";
  }

  try {
    await AuthAPI.sendOtp(email, name);

    // Start 30s resend countdown
    let countdown = 30;
    if (btn) {
      btn.textContent = `Resend in ${countdown}s`;
      state.otpResendTimer = setInterval(() => {
        countdown--;
        btn.textContent =
          countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP";
        if (countdown <= 0) {
          clearInterval(state.otpResendTimer);
          btn.disabled = false;
        }
      }, 1000);
    }

    if (inputs) inputs.style.display = "flex";
    if (verifyBtn) verifyBtn.style.display = "inline-flex";
    if (status) {
      status.textContent = `✅ OTP sent to ${email}. Check your inbox.`;
      status.style.color = "#28A745";
    }

    const firstBox = inputs?.querySelector(".otp-box");
    if (firstBox) firstBox.focus();
  } catch (err) {
    if (status) {
      status.textContent = `❌ ${err.message || "Failed to send OTP."}`;
      status.style.color = "#E05252";
    }
    if (btn) btn.disabled = false;
  }
}
async function verifyOtp() {
  const boxes = document.querySelectorAll(".otp-box");
  const entered = Array.from(boxes)
    .map((b) => b.value)
    .join("");
  const status = $("otpStatus");
  const email = $("email")?.value.trim();

  if (entered.length < 6) {
    if (status) {
      status.textContent = "⚠️ Please enter all 6 digits.";
      status.style.color = "#E05252";
    }
    boxes.forEach((b) => (b.style.borderColor = "#E05252"));
    return;
  }

  const verifyBtn = $("verifyOtpBtn");
  if (verifyBtn) verifyBtn.disabled = true;
  if (status) {
    status.textContent = "Verifying…";
    status.style.color = "#42BABC";
  }

  try {
    await AuthAPI.verifyOtp(email, entered);

    state.otpVerified = true;
    if (status) {
      status.textContent = "✅ Email verified successfully!";
      status.style.color = "#28A745";
    }
    boxes.forEach((b) => {
      b.style.borderColor = "#28A745";
      b.disabled = true;
    });
    if (verifyBtn) {
      verifyBtn.textContent = "Verified ✓";
      verifyBtn.disabled = true;
      verifyBtn.style.background = "#28A745";
    }
    disableEditAfterOtp();
  } catch (err) {
    if (status) {
      status.textContent = `❌ ${err.message || "Incorrect OTP."}`;
      status.style.color = "#E05252";
    }
    boxes.forEach((b) => (b.style.borderColor = "#E05252"));
    if (verifyBtn) verifyBtn.disabled = false;
    const otpRow = document.querySelector(".otp-inputs");
    if (otpRow) {
      otpRow.style.animation = "shake 0.4s ease";
      setTimeout(() => (otpRow.style.animation = ""), 450);
    }
  }
}

/* ──────────────────────────────────────────
         12.  FORM SUBMIT
      ────────────────────────────────────────── */
async function submitRegistration() {
  showBanner("");

  if (!validateStep(1) || !validateStep(2)) {
    showBanner(
      "Some required fields are incomplete. Please go back and fix them."
    );
    return;
  }

  if (!state.otpVerified) {
    showBanner(
      "Please verify your email address with the OTP before submitting."
    );
    return;
  }

  const terms = $("termsCheck");
  if (!terms?.checked) {
    setError("terms", "You must accept the Terms of Use and Privacy Policy.");
    return;
  }
  setError("terms", "");

  // ── Loading state ──────────────────────────────────────────
  const submitBtn = $("submitBtn");
  const submitText = $("submitText");
  const submitSpinner = $("submitSpinner");
  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.style.display = "none";
  if (submitSpinner) submitSpinner.style.display = "inline-block";

  // ── Build payload (matches backend expected keys) ──────────
  const payload = {
    fullName: $("fullName")?.value.trim() || "",
    email: $("email")?.value.trim() || "",
    phone: $("phone")?.value.trim() || "",
    password: $("password")?.value || "",
    streetAddress: $("streetAddress")?.value.trim() || "",
    apartment: $("apartment")?.value.trim() || "",
    buildingName: $("buildingName")?.value.trim() || "",
    landmark: $("landmark")?.value.trim() || "",
    pinCode: $("pinCode")?.value.trim() || "",
    marketingOptIn: $("marketingCheck")?.checked ?? false,
    emailVerified: state.otpVerified,
  };

  try {
    // ── Real API call via api.js ───────────────────────────
    await AuthAPI.register(payload);
    // AuthAPI.register auto-saves the JWT token via Auth.setToken()
    showSuccess();
  } catch (err) {
    // Backend returned an error message — show it in the banner
    showBanner(err.message || "Registration failed. Please try again.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.style.display = "";
    if (submitSpinner) submitSpinner.style.display = "none";
  }
}

function showSuccess() {
  const current = $("step" + state.currentStep);
  if (current) {
    current.classList.add("leaving");
    setTimeout(() => {
      current.classList.remove("active", "leaving");
      const success = $("stepSuccess");
      if (success) success.classList.add("active");
      updateIndicator(4);
    }, 260);
  }
}

/* ──────────────────────────────────────────
         13.  OTP BOX KEYBOARD NAVIGATION
      ────────────────────────────────────────── */
function initOtpBoxes() {
  const boxes = document.querySelectorAll(".otp-box");
  boxes.forEach((box, i) => {
    box.addEventListener("input", (e) => {
      const val = e.target.value.replace(/\D/g, "");
      e.target.value = val.slice(-1);
      e.target.style.borderColor = "";
      if (val && i < boxes.length - 1) boxes[i + 1].focus();
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && i > 0) boxes[i - 1].focus();
      if (e.key === "ArrowLeft" && i > 0) boxes[i - 1].focus();
      if (e.key === "ArrowRight" && i < boxes.length - 1) boxes[i + 1].focus();
    });

    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData)
        .getData("text")
        .replace(/\D/g, "");
      [...text.slice(0, 6)].forEach((ch, j) => {
        if (boxes[j]) boxes[j].value = ch;
      });
      const next = Math.min(text.length, 5);
      boxes[next]?.focus();
    });
  });
}

/* ──────────────────────────────────────────
         14.  LIVE INLINE VALIDATION
      ────────────────────────────────────────── */
function initLiveValidation() {
  const liveFields = [
    "fullName",
    "email",
    "phone",
    "password",
    "confirmPassword",
    "pinCode",
  ];
  liveFields.forEach((id) => {
    const el = $(id);
    if (!el) return;

    el.addEventListener("blur", () => validateField(id));
    el.addEventListener("input", () => {
      if (el.classList.contains("is-error")) validateField(id);
      if (id === "password") updateStrengthBar(el.value);
      if (id === "pinCode") {
        const digits = el.value.replace(/\D/g, "");
        el.value = digits;
        checkServiceAvailability(digits);
        // Live validate if already errored
        if (digits.length === 6) validateField("pinCode");
      }
      if (id === "phone") {
        el.value = el.value.replace(/\D/g, "").slice(0, 10);
      }
      // Prevent email changes after verification
      if (id === "email" && state.emailLocked) {
        el.value = state.formData.email || el.value;
      }
    });
  });

  const terms = $("termsCheck");
  if (terms) {
    terms.addEventListener("change", () => {
      if (terms.checked) setError("terms", "");
    });
  }
}

/* ──────────────────────────────────────────
         15.  HEADER COMPONENT LOADER
      ────────────────────────────────────────── */
function loadHeader() {
  const placeholder = $("header-placeholder");
  if (!placeholder) return;
  fetch("header.html")
    .then((r) => {
      if (!r.ok) throw new Error("Header not found");
      return r.text();
    })
    .then((html) => {
      placeholder.innerHTML = html;
      if (typeof initHeader === "function") initHeader();
    })
    .catch(() => {});
}

/* ──────────────────────────────────────────
         16.  SHAKE KEYFRAME (injected once)
      ────────────────────────────────────────── */
function injectShakeKeyframe() {
  if (document.querySelector("#d2d-shake-style")) return;
  const style = document.createElement("style");
  style.id = "d2d-shake-style";
  style.textContent = `
       @keyframes shake {
         0%,100% { transform: translateX(0); }
         20%      { transform: translateX(-6px); }
         40%      { transform: translateX(6px); }
         60%      { transform: translateX(-4px); }
         80%      { transform: translateX(4px); }
       }
     `;
  document.head.appendChild(style);
}

/* ──────────────────────────────────────────
         17.  STEP DOT CLICK (navigate back freely)
      ────────────────────────────────────────── */
function initStepDotNav() {
  document.querySelectorAll(".step-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      const target = parseInt(dot.dataset.step, 10);
      if (isNaN(target)) return;
      if (target < state.currentStep) goStep(target);
    });
  });
}

/* ──────────────────────────────────────────
         18.  INIT
      ────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  injectShakeKeyframe();
  loadHeader();
  initPasswordToggle("pwdToggle1", "password");
  initPasswordToggle("pwdToggle2", "confirmPassword");
  initOtpBoxes();
  initLiveValidation();
  initStepDotNav();
  updateIndicator(1);

  // Expose functions used by inline onclick attributes in HTML
  window.goStep = goStep;
  window.sendOtp = sendOtp;
  window.verifyOtp = verifyOtp;
  window.submitRegistration = submitRegistration;
});
