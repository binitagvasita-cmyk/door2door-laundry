# ============================================================
#  Door2Door Laundry — utils/mailer.py
#  Sends:
#    • OTP verification emails
#    • Order confirmation emails
#  Via Gmail SMTP (App Password).
# ============================================================

import smtplib
import random
import string
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
import config


# ════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════

def generate_otp(length: int = 6) -> str:
    """Generate a secure 6-digit numeric OTP."""
    return "".join(random.choices(string.digits, k=length))


def _send(msg: MIMEMultipart) -> bool:
    """Internal SMTP sender. Returns True on success."""
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(config.GMAIL_USER, config.GMAIL_APP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"[Email] SMTP error: {e}")
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

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your Door2Door Laundry Verification Code"
    msg["From"]    = formataddr(("Door2Door Laundry", config.GMAIL_USER))
    msg["To"]      = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(_base_html("Door2Door Laundry", "Fast · Fresh · Clean", body), "html", "utf-8"))

    ok = _send(msg)
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

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"✅ Order #{order_id} Confirmed — Door2Door Laundry"
    msg["From"]    = formataddr(("Door2Door Laundry", config.GMAIL_USER))
    msg["To"]      = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(
        _base_html("Order Confirmed! 🎉", f"Order #{order_id} · {pickup_str}", body),
        "html", "utf-8"
    ))

    ok = _send(msg)
    if not ok:
        print(f"[Email] Failed to send order confirmation to {to_email}")
    return ok


# ════════════════════════════════════════════════════════════
#  ORDER STATUS UPDATE EMAIL (customer-facing)
#  Sent whenever the admin moves an order to a new status, so the
#  customer doesn't have to keep refreshing the tracking page.
# ════════════════════════════════════════════════════════════

_STATUS_COPY = {
    "confirmed": {
        "emoji": "✅",
        "title": "Order Confirmed!",
        "line": "Your laundry pickup has been <strong style='color:#42BABC;'>confirmed</strong>.",
    },
    "picked_up": {
        "emoji": "🚚",
        "title": "Picked Up!",
        "line": "Our team has <strong style='color:#42BABC;'>picked up</strong> your laundry.",
    },
    "in_process": {
        "emoji": "🧺",
        "title": "Being Washed!",
        "line": "Your laundry is now <strong style='color:#42BABC;'>being cleaned</strong> with care.",
    },
    "out_for_delivery": {
        "emoji": "🚗",
        "title": "Out for Delivery!",
        "line": "Your fresh laundry is <strong style='color:#42BABC;'>on its way back to you</strong>.",
    },
    "delivered": {
        "emoji": "🎉",
        "title": "Delivered!",
        "line": "Your order has been <strong style='color:#42BABC;'>delivered</strong>. Thank you for choosing us!",
    },
    "cancelled": {
        "emoji": "❌",
        "title": "Order Cancelled",
        "line": "This order has been <strong style='color:#E05252;'>cancelled</strong>.",
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
    Notify the customer that their order moved to a new status.
    Silently does nothing (returns False) for statuses we don't have
    copy for (e.g. 'pending', which is the starting state already
    covered by the order-confirmation email). Returns True on success.
    """
    copy = _STATUS_COPY.get(new_status)
    if not copy:
        return False

    greeting  = f"Hi {user_name}," if user_name else "Hello,"
    pickup_str = pickup_date
    if pickup_time:
        pickup_str += f" at {pickup_time}"

    body = (
        f"<p style='color:#1a2e2e;font-size:16px;margin:0 0 8px;'>{greeting}</p>"
        f"<p style='color:#4a6a6a;font-size:15px;line-height:1.6;margin:0 0 24px;'>{copy['line']}</p>"
        "<div style='background:#e8f9f9;border-radius:12px;padding:18px 20px;margin-bottom:20px;'>"
        f"<p style='color:#1a2e2e;font-size:14px;font-weight:700;margin:0 0 6px;'>Order #{order_id} · {service_name}</p>"
        f"<p style='color:#4a6a6a;font-size:13px;line-height:1.6;margin:0;'>"
        f"Pickup: {pickup_str}<br>Address: {delivery_address}</p>"
        "</div>"
        "<p style='color:#8aadad;font-size:12px;line-height:1.6;margin:0;'>"
        "Track this order anytime from the Track Order page. "
        "Questions? Reply to this email or call/WhatsApp us anytime.</p>"
    )

    text = (
        f"{greeting}\n\n"
        f"Order #{order_id} update: {copy['title']}\n\n"
        f"Service: {service_name}\nPickup: {pickup_str}\nAddress: {delivery_address}\n\n"
        "-- Door2Door Laundry Team"
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{copy['emoji']} Order #{order_id} — {copy['title']}"
    msg["From"]    = formataddr(("Door2Door Laundry", config.GMAIL_USER))
    msg["To"]      = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(
        _base_html(f"{copy['title']} {copy['emoji']}", f"Order #{order_id} · {service_name}", body),
        "html", "utf-8"
    ))

    ok = _send(msg)
    if not ok:
        print(f"[Email] Failed to send status update ({new_status}) to {to_email}")
    return ok


# ════════════════════════════════════════════════════════════
#  ADMIN NEW-ORDER NOTIFICATION EMAIL
# ════════════════════════════════════════════════════════════

def send_admin_order_notification_email(
    order_id: int,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
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
    Notify the admin inbox (config.ADMIN_NOTIFICATION_EMAIL) whenever a
    customer places a new order. Returns True on success, False on failure.
    """
    to_email = config.ADMIN_NOTIFICATION_EMAIL
    if not to_email:
        print("[Email] ADMIN_NOTIFICATION_EMAIL is not configured — skipping admin notification.")
        return False

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

    rows  = row("Order #",        f"<strong>#{order_id}</strong>")
    rows += row("Customer",       customer_name)
    rows += row("Email",          customer_email)
    rows += row("Phone",          customer_phone or "—")
    rows += row("Service",        service_name)
    rows += row("Item / Garment", display_item)
    rows += row("Quantity",       str(quantity))
    rows += row("Pickup",         pickup_str)
    rows += row("Address",        delivery_address)
    rows += row("Payment",        pay_label)
    if special_instructions:
        rows += row("Instructions", special_instructions)

    body = (
        "<p style='color:#1a2e2e;font-size:16px;margin:0 0 6px;'>New order received!</p>"
        "<p style='color:#4a6a6a;font-size:15px;line-height:1.6;margin:0 0 24px;'>"
        f"<strong>{customer_name}</strong> just placed a new order. Details below:</p>"

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
        "Log in to the admin dashboard to confirm pickup and update the order status.</p>"
    )

    text = (
        f"New order #{order_id} placed by {customer_name}\n\n"
        f"Customer email: {customer_email}\n"
        f"Customer phone: {customer_phone or '—'}\n"
        f"Service: {service_name}\n"
        f"Item: {display_item}\n"
        f"Quantity: {quantity}\n"
        f"Pickup: {pickup_str}\n"
        f"Address: {delivery_address}\n"
        f"Payment: {pay_label}\n"
        f"Total: {total_str}\n\n"
        "Log in to the admin dashboard to manage this order."
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🧺 New Order #{order_id} — {customer_name}"
    msg["From"]    = formataddr(("Door2Door Laundry", config.GMAIL_USER))
    msg["To"]      = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(
        _base_html("New Order! 🧺", f"Order #{order_id} · {pickup_str}", body),
        "html", "utf-8"
    ))

    ok = _send(msg)
    if not ok:
        print(f"[Email] Failed to send admin notification for order {order_id}")
    return ok