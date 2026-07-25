/* ============================================================
   Door2Door Laundry — invoice.js
   Loads ?order=<id> and renders the printable bill.
   Works for both the customer (track-order.html → Download Bill)
   and the admin (admin dashboard → Bill button) using the same
   markup — it just calls a different API depending on role.
   ============================================================ */

"use strict";

function $(id) { return document.getElementById(id); }

const PAYMENT_LABELS = { paid: "💳 Paid", pending: "⏳ Payment Pending" };
const STATUS_LABELS = {
  pending: "Pending", confirmed: "Confirmed", picked_up: "Picked Up",
  in_process: "In Process", out_for_delivery: "Out for Delivery",
  delivered: "Delivered", cancelled: "Cancelled",
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return dateStr; }
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return dateStr; }
}

function formatAmount(val) {
  if (val === null || val === undefined) return "—";
  return `₹${parseFloat(val).toFixed(2)}`;
}

function showError(msg) {
  $("invLoading").style.display = "none";
  const err = $("invError");
  err.textContent = msg;
  err.style.display = "block";
}

function renderInvoice(o) {
  $("invLoading").style.display = "none";
  $("invSheet").style.display = "block";

  $("iOrderId").textContent = o.id;
  $("iDate").textContent = "Placed on " + formatDateTime(o.created_at);

  const statusPill = $("iOrderStatus");
  statusPill.textContent = STATUS_LABELS[o.status] || o.status;
  statusPill.className = "inv-pill" + (o.status === "cancelled" ? " cancelled" : "");

  const payStatus = o.payment_status || "pending";
  const payPill = $("iPaymentStatus");
  payPill.textContent = PAYMENT_LABELS[payStatus] || payStatus;
  payPill.className = "inv-pill " + payStatus;

  $("iCustName").textContent = o.customer_name || "—";
  $("iCustPhone").textContent = o.customer_phone || "—";
  $("iCustEmail").textContent = o.customer_email || "—";
  $("iAddress").textContent = o.delivery_address || "—";

  let pickup = formatDate(o.pickup_date);
  if (o.pickup_time) pickup += ` · ${o.pickup_time}`;
  $("iPickup").textContent = pickup;

  const itemLabel = o.item_name || o.service_name || "—";
  $("iItemsBody").innerHTML = `
    <tr>
      <td>${o.service_name || "—"}</td>
      <td>${itemLabel}</td>
      <td>${o.quantity || 1}</td>
      <td class="inv-right">${formatAmount(o.total_amount)}</td>
    </tr>`;

  $("iTotal").textContent = formatAmount(o.total_amount);

  $("iPaymentMethod").textContent = o.payment_method === "cod" ? "Cash on Delivery" : "Online / UPI";
  $("iPaidAt").textContent = o.paid_at ? formatDateTime(o.paid_at) : "Not paid yet";

  if (o.special_instructions) {
    $("iNoteRow").style.display = "block";
    $("iNote").textContent = o.special_instructions;
  }

  document.title = `Invoice #${o.id} — Door2Door Laundry`;
}

async function boot() {
  // This page is opened from two different places: the admin dashboard's
  // "🧾 Bill" link (any order) and the customer's "Download Bill" button
  // (their own orders only). We can't tell which just from the URL, so we
  // check which session is actually logged in — using the separate
  // AdminAuth / Auth namespaces (see auth.js) rather than a flag on the
  // customer user object, which was never populated with isAdmin and made
  // this detection silently always fail.
  const isAdminView = !!(window.AdminAuth && AdminAuth.isLoggedIn() && localStorage.getItem("d2d_admin"));

  if (!isAdminView && (!window.Auth || !Auth.isLoggedIn())) {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `login.html?returnTo=${returnTo}`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order");
  if (!orderId || isNaN(orderId)) {
    showError("No order specified. Go back and choose an order to view its bill.");
    return;
  }

  try {
    const res = isAdminView
      ? await AdminAPI.getInvoice(orderId)
      : await OrdersAPI.getInvoice(orderId);
    if (!res?.data) throw new Error("Bill not found.");
    renderInvoice(res.data);
  } catch (err) {
    showError(err.message || "Could not load this bill. Please try again.");
  }
}

document.addEventListener("DOMContentLoaded", boot);