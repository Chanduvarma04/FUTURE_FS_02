"""
LeadFlow — Client Lead Management System
Flask + SQLite Backend
"""

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import sqlite3
import os

# ── App setup ─────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

DB_PATH = os.path.join(os.path.dirname(__file__), "leads.db")


# ── Database helpers ──────────────────────────────────────────
def get_db():
    """Open a database connection with row_factory for dict-like rows."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the leads table if it doesn't exist."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS leads (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                name     TEXT    NOT NULL,
                email    TEXT    NOT NULL UNIQUE,
                source   TEXT    NOT NULL,
                status   TEXT    NOT NULL DEFAULT 'New',
                note     TEXT             DEFAULT '',
                created  TEXT             DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


# ── Routes ─────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the frontend."""
    return render_template("index.html")


# ── GET /api/leads  — list all leads ──────────────────────────
@app.route("/api/leads", methods=["GET"])
def get_leads():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, email, source, status, note, created FROM leads ORDER BY created DESC"
        ).fetchall()
    return jsonify([dict(row) for row in rows]), 200


# ── POST /api/leads  — add a lead ─────────────────────────────
@app.route("/api/leads", methods=["POST"])
def add_lead():
    data = request.get_json(silent=True) or {}

    name   = (data.get("name")   or "").strip()
    email  = (data.get("email")  or "").strip().lower()
    source = (data.get("source") or "").strip()

    # Validation
    if not name or not email or not source:
        return jsonify({"error": "name, email and source are required."}), 400

    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Invalid email address."}), 400

    try:
        with get_db() as conn:
            cursor = conn.execute(
                "INSERT INTO leads (name, email, source) VALUES (?, ?, ?)",
                (name, email, source)
            )
            conn.commit()
            new_id = cursor.lastrowid

        with get_db() as conn:
            row = conn.execute(
                "SELECT id, name, email, source, status, note, created FROM leads WHERE id = ?",
                (new_id,)
            ).fetchone()

        return jsonify(dict(row)), 201

    except sqlite3.IntegrityError:
        return jsonify({"error": "A lead with this email already exists."}), 409


# ── PATCH /api/leads/<id>  — update status or note ────────────
@app.route("/api/leads/<int:lead_id>", methods=["PATCH"])
def update_lead(lead_id):
    data = request.get_json(silent=True) or {}

    allowed_statuses = {"New", "Contacted", "Converted"}
    fields = {}

    if "status" in data:
        if data["status"] not in allowed_statuses:
            return jsonify({"error": f"status must be one of {allowed_statuses}"}), 400
        fields["status"] = data["status"]

    if "note" in data:
        fields["note"] = (data["note"] or "").strip()

    if not fields:
        return jsonify({"error": "Nothing to update. Send 'status' or 'note'."}), 400

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values     = list(fields.values()) + [lead_id]

    with get_db() as conn:
        affected = conn.execute(
            f"UPDATE leads SET {set_clause} WHERE id = ?", values
        ).rowcount
        conn.commit()

    if affected == 0:
        return jsonify({"error": "Lead not found."}), 404

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, email, source, status, note, created FROM leads WHERE id = ?",
            (lead_id,)
        ).fetchone()

    return jsonify(dict(row)), 200


# ── DELETE /api/leads/<id>  — remove a lead ───────────────────
@app.route("/api/leads/<int:lead_id>", methods=["DELETE"])
def delete_lead(lead_id):
    with get_db() as conn:
        affected = conn.execute(
            "DELETE FROM leads WHERE id = ?", (lead_id,)
        ).rowcount
        conn.commit()

    if affected == 0:
        return jsonify({"error": "Lead not found."}), 404

    return jsonify({"message": "Lead deleted successfully."}), 200


# ── GET /api/stats  — dashboard summary ───────────────────────
@app.route("/api/stats", methods=["GET"])
def get_stats():
    with get_db() as conn:
        row = conn.execute("""
            SELECT
                COUNT(*)                                        AS total,
                SUM(status = 'New')                            AS new,
                SUM(status = 'Contacted')                      AS contacted,
                SUM(status = 'Converted')                      AS converted
            FROM leads
        """).fetchone()
    return jsonify(dict(row)), 200


# ── Entry point ───────────────────────────────────────────────
init_db()
if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)