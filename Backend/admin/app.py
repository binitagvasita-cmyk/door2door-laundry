from flask import Flask, render_template, jsonify

app = Flask(__name__)

dashboard_data = {
    "users": 1250,
    "orders": 560,
    "revenue": 25400,
    "visitors": 8970
}

recent_orders = [
    {
        "id": 1001,
        "customer": "John",
        "product": "Laptop",
        "status": "Completed"
    },
    {
        "id": 1002,
        "customer": "Emma",
        "product": "Keyboard",
        "status": "Pending"
    },
    {
        "id": 1003,
        "customer": "David",
        "product": "Mouse",
        "status": "Completed"
    },
    {
        "id": 1004,
        "customer": "Sophia",
        "product": "Monitor",
        "status": "Processing"
    }
]

@app.route("/")
def dashboard():
    return render_template(
        "dashboard.html",
        data=dashboard_data,
        orders=recent_orders
    )

@app.route("/api/dashboard")
def api():
    return jsonify({
        "stats": dashboard_data,
        "orders": recent_orders
    })

if __name__ == "__main__":
    app.run(debug=True)