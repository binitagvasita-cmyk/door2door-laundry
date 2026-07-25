# ============================================================
#  Door2Door Laundry — utils/db.py
#  Central database connection utility.
#  Always use get_db() + close it in a finally block.
# ============================================================

import MySQLdb
import config


def get_db():
    """
    Open and return a MySQLdb connection.
    SSL is required for Clever Cloud; falls back gracefully for local dev.
    Returns None if the connection fails (caller must handle).
    """
    ssl_args = {}
    if config.FLASK_ENV == "production":
        ssl_args = {"ssl_mode": "REQUIRED"}

    try:
        conn = MySQLdb.connect(
            host=config.DB_HOST,
            port=config.DB_PORT,
            user=config.DB_USER,
            passwd=config.DB_PASSWORD,
            db=config.DB_NAME,
            charset="utf8mb4",
            **ssl_args,
        )
        return conn
    except MySQLdb.Error as e:
        print(f"[DB] Connection error: {e}")
        return None


def query_one(sql, params=()):
    """Execute a SELECT and return the first row as a dict, or None."""
    conn = get_db()
    if not conn:
        return None
    try:
        cur = conn.cursor(MySQLdb.cursors.DictCursor)
        cur.execute(sql, params)
        return cur.fetchone()
    except MySQLdb.Error as e:
        print(f"[DB] query_one error: {e}")
        return None
    finally:
        conn.close()


def query_all(sql, params=()):
    """Execute a SELECT and return all rows as a list of dicts."""
    conn = get_db()
    if not conn:
        return []
    try:
        cur = conn.cursor(MySQLdb.cursors.DictCursor)
        cur.execute(sql, params)
        return cur.fetchall()
    except MySQLdb.Error as e:
        print(f"[DB] query_all error: {e}")
        return []
    finally:
        conn.close()


def execute(sql, params=()):
    """
    Execute INSERT / UPDATE / DELETE.
    Returns lastrowid on INSERT, rows affected otherwise, or -1 on error.
    """
    conn = get_db()
    if not conn:
        return -1
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
        return cur.lastrowid if cur.lastrowid else cur.rowcount
    except MySQLdb.Error as e:
        conn.rollback()
        print(f"[DB] execute error: {e}")
        return -1
    finally:
        conn.close()