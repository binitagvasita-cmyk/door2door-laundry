# ============================================================
#  Door2Door Laundry — utils/mailer.py
#  Sends:
#    • OTP verification emails
#    • Order confirmation emails
#    • Admin new-order notifications
#    • Order status update emails
#
#  IMPORTANT — why this uses Brevo's HTTPS API instead of Gmail SMTP:
#  As of Sept 26, 2025, Render's free-tier web services block ALL
#  outbound traffic to SMTP ports 25, 465, and 587 at the network
#  level (see https://render.com/changelog/free-web-services-will-
#  no-longer-allow-outbound-traffic-to-smtp-ports). This is a
#  permanent firewall rule on Render's side — no amount of retrying,
#  timeouts, or IPv4/IPv6 forcing can get around it, since the
#  connection is dropped before it leaves Render's network.
#
#  The fix is to stop using SMTP entirely and send email over HTTPS
#  (port 443, which is NOT blocked) via Brevo's transactional email
#  API. Brevo's free tier gives 300 emails/day at no cost.
#
#  Setup required (one-time):
#    1. Create a free account at https://www.brevo.com
#    2. Go to Settings → SMTP & API → API Keys → generate a new key
#    3. Add BREVO_API_KEY=<your key> to Render's Environment tab
#       (and to your local .env for local dev)
#    4. In Brevo, go to Senders & IP → Senders, and add/verify the
#       address you want to send FROM (this can be your existing
#       Gmail address — Brevo just needs to confirm you own it via
#       a verification email, it does not need your Gmail password)
#    5. GMAIL_USER and GMAIL_APP_PASSWORD env vars are no longer
#       used by this file and can eventually be removed, but leaving
#       them set does no harm.
# ============================================================

import random
import string
import requests
import config


# ════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def generate_otp(length: int = 6) -> str:
    """Generate a secure 6-digit numeric OTP."""
    return "".join(random.choices(string.digits, k=length))


def _send(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    """
    Internal email sender — posts to Brevo's transactional email API
    over HTTPS. Returns True on success.
    """
    payload = {
        "sender": {"name": "Door2Door Laundry", "email": config.GMAIL_USER},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content,
    }
    headers = {
        "api-key": config.BREVO_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    try:
        resp = requests.post(BREVO_API_URL, json=payload, headers=headers, timeout=10)
        if resp.status_code in (200, 201):
            return True
        print(f"[Email] Brevo API error: {resp.status_code} {resp.text}")
        return False
    except Exception as e:
        print(f"[Email] Brevo request failed: {e}")
        return False


def _base_html(header_title: str, header_sub: str, body: str) -> str:
    """Shared HTML email shell — teal header + white body + footer."""
    return (
        "<!DOCTYPE html><html>"
        "<body style='margin:0;padding:0;background:#f4f9f9;font-family:Arial,sans-serif;'>"
        "<table width='100%' cellpadding='0' cellspacing='0'>"
        "<tr><td align='center' style='padding:40px 16px;'>"
        "<table width='480' cellpadding='0' cellspacing='0' "
        "style='background:#ffffff;border-radius:16px;overflow:hidden;max-width:480px;width:100%;'>"

        # ── Header ──
        "<tr><td style='background:#42BABC;padding:32px 40px;text-align:center;'>"
        f"<h1 style='color:#ffffff;font-size:22px;margin:0;font-weight:700;'>{header_title}</h1>"
        f"<p style='color:rgba(255,255,255,0.85);font-size:13px;margin:6px 0 0;'>{header_sub}</p>"
        "</td></tr>"

        # ── Body ──
        f"<tr><td style='padding:36px 40px;'>{body}</td></tr>"

        # ── Footer ──
        "<tr><td style='background:#f4f9f9;padding:20px 40px;text-align:center;"
        "border-top:1px solid #ddf0f0;'>"
        "<p style='color:#8aadad;font-size:12px;margin:0;'>"
        "&copy; 2025 Door2Door Laundry &middot; Ahmedabad, Gujarat</p>"
        "</td></tr>"

        "</table></td></tr></table></body></html>"
    )


# ════════════════════════════════════════════════════════════
#  OTP EMAIL
# ════════════════════════════════════════════════════════════

def send_otp_email(to_email: str, otp: str, user_name: str = "") -> bool:
    """Send OTP verification email. Returns True on success."""
    greeting = f"Hi {user_name}," if user_name else "Hello,"

    body = (
        f"<p style='color:#1a2e2e;font-size:16px;margin:0 0 8px;'>{greeting}</p>"
        "<p style='color:#4a6a6a;font-size:15px;line-height:1.6;margin:0 0 28px;'>"
        "Use the code below to verify your email address. "
        "It expires in <strong>10 minutes</strong>.</p>"
        "<div style='background:#e8f9f9;border:2px dashed #42BABC;"
        "border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;'>"
        "<p style='color:#8aadad;font-size:12px;text-transform:uppercase;"
        "letter-spacing:0.1em;margin:0 0 10px;'>Verification Code</p>"
        f"<p style='color:#1a2e2e;font-size:38px;font-weight:700;"
        f"letter-spacing:0.25em;margin:0;font-family:monospace;'>{otp}</p>"
        "</div>"
        "<p style='color:#8aadad;font-size:13px;line-height:1.6;margin:0;'>"
        "If you didn't request this, please ignore this email. "
        "Never share this code with anyone.</p>"
    )

    text = (
        f"{greeting}\n\nYour verification code is: {otp}\n\n"
        "This code expires in 10 minutes. Do not share it.\n\n-- Door2Door Laundry Team"
    )

    ok = _send(
        to_email=to_email,
        subject="Your Door2Door Laundry Verification Code",
        html_content=_base_html("Door2Door Laundry", "Fast · Fresh · Clean", body),
        text_content=text,
    )
    if not ok:
        print(f"[Email] Failed to send OTP to {to_email}")
    return ok


# ════════════════════════════════════════════════════════════
#  ORDER CONFIRMATION EMAIL
# ════════════════════════════════════════════════════════════

def send_order_confirmation_email(
    to_email: str,
    user_name: str,
    order_id: int,
    service_name: str,
    item_name: str | None,
    quantity: int,
    total_amount: float | None,
    pickup_date: str,
    pickup_time: str | None,
    delivery_address: str,
    payment_method: str,
    special_instructions: str | None = None,
) -> bool:
    """
    Send a beautiful order-confirmation email to the customer.
    Returns True on success, False on failure.
    """

    greeting    = f"Hi {user_name}," if user_name else "Hello,"
    display_item = item_name or service_name
    pay_label    = "💳 Online / UPI" if payment_method == "online" else "💵 Cash on Delivery"
    total_str    = f"₹{total_amount:.0f}" if total_amount else "To be calculated"
    pickup_str   = pickup_date
    if pickup_time:
        pickup_str += f" at {pickup_time}"

    # ── Build detail rows ─────────────────────────────────────
    def row(label: str, value: str) -> str:
        return (
            "<tr>"
            f"<td style='padding:10px 20px;color:#8aadad;font-size:13px;"
            f"font-weight:600;width:38%;border-bottom:1px solid #eef5f5;'>{label}</td>"
            f"<td style='padding:10px 20px;color:#1a2e2e;font-size:14px;"
            f"font-weight:500;border-bottom:1px solid #eef5f5;'>{value}</td>"
            "</tr>"
        )

    rows  = row("Order #",        f"<strong>#{order_id}</strong>")
    rows += row("Service",        service_name)
    rows += row("Item / Garment", display_item)
    rows += row("Quantity",       str(quantity))
    rows += row("Pickup",         pickup_str)
    rows += row("Address",        delivery_address)
    rows += row("Payment",        pay_label)
    if special_instructions:
        rows += row("Instructions", special_instructions)

    body = (
        f"<p style='color:#1a2e2e;font-size:16px;margin:0 0 6px;'>{greeting}</p>"
        "<p style='color:#4a6a6a;font-size:15px;line-height:1.6;margin:0 0 24px;'>"
        "Your laundry pickup has been <strong style='color:#42BABC;'>confirmed</strong>! "
        "Here's a summary of your order:</p>"

        # Order detail table
        "<div style='border-radius:12px;overflow:hidden;border:1.5px solid #ddf0f0;margin-bottom:24px;'>"
        "<table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;'>"
        f"{rows}"
        "</table>"
        # Total row
        "<div style='background:linear-gradient(90deg,#1a3a4a,#1e5c5e);"
        "padding:14px 20px;display:flex;justify-content:space-between;align-items:center;'>"
        "<span style='color:rgba(255,255,255,0.75);font-size:14px;font-weight:600;'>Total Amount</span>"
        f"<span style='color:#ffffff;font-size:22px;font-weight:700;"
        f"font-family:Georgia,serif;'>{total_str}</span>"
        "</div>"
        "</div>"

        # What's next
        "<div style='background:#e8f9f9;border-radius:12px;padding:18px 20px;margin-bottom:20px;'>"
        "<p style='color:#1a2e2e;font-size:14px;font-weight:700;margin:0 0 8px;'>What happens next?</p>"
        "<p style='color:#4a6a6a;font-size:13px;line-height:1.7;margin:0;'>"
        "📞 We'll call you to confirm the pickup time.<br>"
        "🚗 Our team will pick up your laundry from your door.<br>"
        "✨ Your clothes will be cleaned with care within 48 hours.<br>"
        "📦 We'll deliver them back fresh to your address.</p>"
        "</div>"

        "<p style='color:#8aadad;font-size:12px;line-height:1.6;margin:0;'>"
        "Questions? Reply to this email or call us anytime. "
        "Thank you for choosing Door2Door Laundry! 🧺</p>"
    )

    text = (
        f"{greeting}\n\n"
        f"Your order #{order_id} has been confirmed!\n\n"
        f"Service: {service_name}\n"
        f"Item: {display_item}\n"
        f"Quantity: {quantity}\n"
        f"Pickup: {pickup_str}\n"
        f"Address: {delivery_address}\n"
        f"Payment: {pay_label}\n"
        f"Total: {total_str}\n\n"
        "We'll call you to confirm the exact pickup time.\n"
        "Thank you for choosing Door2Door Laundry!\n\n-- Door2Door Laundry Team"
    )

    ok = _send(
        to_email=to_email,
        subject=f"✅ Order #{order_id} Confirmed — Door2Door Laundry",
        html_content=_base_html("Order Confirmed! 🎉", f"Order #{order_id} · {pickup_str}", body),
        text_content=text,
    )
    if not ok:
        print(f"[Email] Failed to send order confirmation to {to_email}")
    return ok


# ════════════════════════════════════════════════════════════
#  ADMIN — NEW ORDER NOTIFICATION EMAIL
# ════════════════════════════════════════════════════════════

def send_admin_order_notification_email(
    order_id: int,
    customer_name: str,
    customer_email: str,
    customer_phone: str | None,
    service_name: str,
    item_name: str | None,
    quantity: int,
    total_amount: float | None,
    pickup_date: str,
    pickup_time: str | None,
    delivery_address: str,
    payment_method: str,
    special_instructions: str | None = None,
) -> bool:
    """Notify the admin inbox whenever a customer places a new order."""

    display_item = item_name or service_name
    pay_label    = "💳 Online / UPI" if payment_method == "online" else "💵 Cash on Delivery"
    total_str    = f"₹{total_amount:.0f}" if total_amount else "To be calculated"
    pickup_str   = pickup_date
    if pickup_time:
        pickup_str += f" at {pickup_time}"

    def row(label: str, value: str) -> str:
        return (
            "<tr>"
            f"<td style='padding:10px 20px;color:#8aadad;font-size:13px;"
            f"font-weight:600;width:38%;border-bottom:1px solid #eef5f5;'>{label}</td>"
            f"<td style='padding:10px 20px;color:#1a2e2e;font-size:14px;"
            f"font-weight:500;border-bottom:1px solid #eef5f5;'>{value}</td>"
            "</tr>"
        )

    rows  = row("Order #",   f"<strong>#{order_id}</strong>")
    rows += row("Customer",  customer_name)
    rows += row("Email",     customer_email)
    if customer_phone:
        rows += row("Phone", customer_phone)
    rows += row("Service",   service_name)
    rows += row("Item / Garment", display_item)
    rows += row("Quantity",  str(quantity))
    rows += row("Pickup",    pickup_str)
    rows += row("Address",   delivery_address)
    rows += row("Payment",   pay_label)
    if special_instructions:
        rows += row("Instructions", special_instructions)

    body = (
        "<p style='color:#1a2e2e;font-size:16px;margin:0 0 6px;'>New order placed! 🔔</p>"
        "<p style='color:#4a6a6a;font-size:15px;line-height:1.6;margin:0 0 24px;'>"
        "A customer just booked a pickup. Details below:</p>"

        "<div style='border-radius:12px;overflow:hidden;border:1.5px solid #ddf0f0;margin-bottom:24px;'>"
        "<table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;'>"
        f"{rows}"
        "</table>"
        "<div style='background:linear-gradient(90deg,#1a3a4a,#1e5c5e);"
        "padding:14px 20px;display:flex;justify-content:space-between;align-items:center;'>"
        "<span style='color:rgba(255,255,255,0.75);font-size:14px;font-weight:600;'>Total Amount</span>"
        f"<span style='color:#ffffff;font-size:22px;font-weight:700;"
        f"font-family:Georgia,serif;'>{total_str}</span>"
        "</div>"
        "</div>"

        "<p style='color:#8aadad;font-size:12px;line-height:1.6;margin:0;'>"
        "Log in to the admin dashboard to confirm and manage this order.</p>"
    )

    text = (
        "New order placed!\n\n"
        f"Order #{order_id}\n"
        f"Customer: {customer_name} ({customer_email}"
        + (f", {customer_phone}" if customer_phone else "") + ")\n"
        f"Service: {service_name}\n"
        f"Item: {display_item}\n"
        f"Quantity: {quantity}\n"
        f"Pickup: {pickup_str}\n"
        f"Address: {delivery_address}\n"
        f"Payment: {pay_label}\n"
        f"Total: {total_str}\n"
    )

    ok = _send(
        to_email=config.ADMIN_NOTIFICATION_EMAIL,
        subject=f"🔔 New Order #{order_id} — {customer_name}",
        html_content=_base_html("New Order! 🔔", f"Order #{order_id} · {customer_name}", body),
        text_content=text,
    )
    if not ok:
        print(f"[Email] Failed to send admin notification for order {order_id}")
    return ok


# ════════════════════════════════════════════════════════════
#  ORDER STATUS UPDATE EMAIL (customer-facing)
# ════════════════════════════════════════════════════════════

_STATUS_COPY = {
    "confirmed": {
        "emoji": "✅",
        "title": "Order Confirmed",
        "line": "Your order has been confirmed and is scheduled for pickup.",
    },
    "picked_up": {
        "emoji": "🚗",
        "title": "Picked Up",
        "line": "Our team has picked up your laundry and it's on its way to us.",
    },
    "in_process": {
        "emoji": "✨",
        "title": "Being Washed",
        "line": "Your clothes are being cleaned with care right now.",
    },
    "out_for_delivery": {
        "emoji": "📦",
        "title": "Out for Delivery",
        "line": "Your freshly cleaned laundry is on its way back to you!",
    },
    "delivered": {
        "emoji": "🎉",
        "title": "Delivered",
        "line": "Your order has been delivered. Thank you for choosing Door2Door Laundry!",
    },
    "cancelled": {
        "emoji": "❌",
        "title": "Order Cancelled",
        "line": "Your order has been cancelled. Contact us if this wasn't expected.",
    },
}


def send_order_status_update_email(
    to_email: str,
    user_name: str,
    order_id: int,
    new_status: str,
    service_name: str,
    pickup_date: str,
    pickup_time: str | None,
    delivery_address: str,
) -> bool:
    """
    Notify the customer whenever the admin changes an order's status.
    Silently returns False (no email sent) for statuses with no copy defined
    (e.g. "pending", which the customer already saw at checkout).
    """
    copy = _STATUS_COPY.get(new_status)
    if not copy:
        return False

    greeting  = f"Hi {user_name}," if user_name else "Hello,"
    pickup_str = pickup_date
    if pickup_time:
        pickup_str += f" at {pickup_time}"

    body = (
        f"<p style='color:#1a2e2e;font-size:16px;margin:0 0 6px;'>{greeting}</p>"
        f"<p style='color:#4a6a6a;font-size:15px;line-height:1.6;margin:0 0 24px;'>{copy['line']}</p>"
        "<div style='background:#e8f9f9;border-radius:12px;padding:18px 20px;margin-bottom:20px;'>"
        f"<p style='color:#1a2e2e;font-size:14px;margin:4px 0;'><strong>Order #{order_id}</strong></p>"
        f"<p style='color:#4a6a6a;font-size:13px;margin:4px 0;'>Service: {service_name}</p>"
        f"<p style='color:#4a6a6a;font-size:13px;margin:4px 0;'>Pickup: {pickup_str}</p>"
        f"<p style='color:#4a6a6a;font-size:13px;margin:4px 0;'>Address: {delivery_address}</p>"
        "</div>"
        "<p style='color:#8aadad;font-size:12px;line-height:1.6;margin:0;'>"
        "Track your order anytime from the Door2Door Laundry website.</p>"
    )

    text = (
        f"{greeting}\n\n{copy['line']}\n\n"
        f"Order #{order_id}\nService: {service_name}\nPickup: {pickup_str}\n"
        f"Address: {delivery_address}\n\n-- Door2Door Laundry Team"
    )

    ok = _send(
        to_email=to_email,
        subject=f"{copy['emoji']} Order #{order_id} — {copy['title']}",
        html_content=_base_html(f"{copy['emoji']} {copy['title']}", f"Order #{order_id}", body),
        text_content=text,
    )
    if not ok:
        print(f"[Email] Failed to send status update ({new_status}) for order {order_id}")
    return ok