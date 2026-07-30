import os
import re
import secrets
import sqlite3
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    abort,
    flash,
    g,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "bank.db"
SCHEMA = BASE_DIR / "schema.sql"

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-change-this"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DATABASE)
    db.executescript(SCHEMA.read_text(encoding="utf-8"))
    db.commit()
    db.close()


def rupiah(value):
    try:
        value = int(value)
    except (TypeError, ValueError):
        value = 0
    return "Rp " + f"{value:,}".replace(",", ".")


app.jinja_env.filters["rupiah"] = rupiah


def parse_amount(raw):
    digits = re.sub(r"\D", "", raw or "")
    return int(digits) if digits else None


def csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
    return session["csrf_token"]


@app.context_processor
def inject_globals():
    return {"csrf_token": csrf_token()}


@app.before_request
def protect_csrf():
    if request.method == "POST":
        token = session.get("csrf_token")
        form_token = request.form.get("csrf_token")
        if not token or not form_token or not secrets.compare_digest(token, form_token):
            abort(400, "Permintaan tidak valid. Muat ulang halaman lalu coba lagi.")


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


@app.route("/")
def index():
    return redirect(url_for("dashboard" if "user_id" in session else "login"))


@app.route("/register", methods=["GET", "POST"])
def register():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    form = {"name": "", "username": "", "email": ""}
    if request.method == "POST":
        form = {
            "name": request.form.get("name", "").strip(),
            "username": request.form.get("username", "").strip().lower(),
            "email": request.form.get("email", "").strip().lower(),
        }
        password = request.form.get("password", "")
        confirmation = request.form.get("confirmation", "")
        errors = []

        if not form["name"]:
            errors.append("Nama wajib diisi.")
        if not re.fullmatch(r"[a-z0-9_]{4,20}", form["username"]):
            errors.append("Username harus 4–20 karakter: huruf kecil, angka, atau underscore.")
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", form["email"]):
            errors.append("Format email tidak valid.")
        if len(password) < 8:
            errors.append("Password minimal 8 karakter.")
        if password != confirmation:
            errors.append("Konfirmasi password tidak cocok.")

        db = get_db()
        if not errors:
            existing = db.execute(
                "SELECT id FROM users WHERE username = ? OR email = ?",
                (form["username"], form["email"]),
            ).fetchone()
            if existing:
                errors.append("Username atau email sudah digunakan.")

        if errors:
            for error in errors:
                flash(error, "error")
            return render_template("register.html", form=form)

        db.execute(
            "INSERT INTO users (name, username, email, password_hash) VALUES (?, ?, ?, ?)",
            (
                form["name"],
                form["username"],
                form["email"],
                generate_password_hash(password),
            ),
        )
        db.commit()
        flash("Akun berhasil dibuat. Silakan masuk.", "success")
        return redirect(url_for("login"))

    return render_template("register.html", form=form)


@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    username = ""
    if request.method == "POST":
        username = request.form.get("username", "").strip().lower()
        password = request.form.get("password", "")
        user = get_db().execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()

        if user is None or not check_password_hash(user["password_hash"], password):
            flash("Username atau password salah.", "error")
            return render_template("login.html", username=username)

        session.clear()
        session["user_id"] = user["id"]
        session["user_name"] = user["name"]
        session["csrf_token"] = secrets.token_hex(16)
        return redirect(url_for("dashboard"))

    return render_template("login.html", username=username)


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    session.clear()
    flash("Kamu berhasil keluar.", "success")
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    db = get_db()
    user_id = session["user_id"]

    transactions = db.execute(
        "SELECT * FROM transactions WHERE user_id = ? "
        "ORDER BY transaction_date DESC, id DESC",
        (user_id,),
    ).fetchall()

    totals = db.execute(
        "SELECT "
        "COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income, "
        "COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) AS expense "
        "FROM transactions WHERE user_id = ?",
        (user_id,),
    ).fetchone()

    monthly_rows = db.execute(
        "SELECT substr(transaction_date, 1, 7) AS month, "
        "SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income, "
        "SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS expense "
        "FROM transactions WHERE user_id = ? "
        "GROUP BY substr(transaction_date, 1, 7) ORDER BY month ASC LIMIT 12",
        (user_id,),
    ).fetchall()

    category_rows = db.execute(
        "SELECT category, SUM(amount) AS total FROM transactions "
        "WHERE user_id = ? AND type = 'expense' GROUP BY category ORDER BY total DESC",
        (user_id,),
    ).fetchall()

    chart_data = {
        "months": [row["month"] for row in monthly_rows],
        "income": [row["income"] for row in monthly_rows],
        "expense": [row["expense"] for row in monthly_rows],
        "categories": [row["category"] for row in category_rows],
        "categoryTotals": [row["total"] for row in category_rows],
    }

    return render_template(
        "dashboard.html",
        transactions=transactions,
        income=totals["income"],
        expense=totals["expense"],
        balance=totals["income"] - totals["expense"],
        chart_data=chart_data,
    )


@app.route("/transaction/add", methods=["POST"])
@login_required
def add_transaction():
    transaction_type = request.form.get("type")
    category = request.form.get("category", "").strip()
    amount = parse_amount(request.form.get("amount"))
    description = request.form.get("description", "").strip()
    transaction_date = request.form.get("transaction_date", "")

    if transaction_type not in {"income", "expense"}:
        flash("Jenis transaksi tidak valid.", "error")
    elif not category:
        flash("Kategori wajib diisi.", "error")
    elif amount is None or amount <= 0:
        flash("Nominal harus lebih dari nol.", "error")
    elif not description:
        flash("Keterangan wajib diisi.", "error")
    elif not re.fullmatch(r"\d{4}-\d{2}-\d{2}", transaction_date):
        flash("Tanggal tidak valid.", "error")
    else:
        db = get_db()
        db.execute(
            "INSERT INTO transactions "
            "(user_id, type, category, amount, description, transaction_date) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                session["user_id"],
                transaction_type,
                category,
                amount,
                description,
                transaction_date,
            ),
        )
        db.commit()
        flash("Transaksi berhasil ditambahkan.", "success")

    return redirect(url_for("dashboard"))


@app.route("/transaction/<int:transaction_id>/delete", methods=["POST"])
@login_required
def delete_transaction(transaction_id):
    db = get_db()
    result = db.execute(
        "DELETE FROM transactions WHERE id = ? AND user_id = ?",
        (transaction_id, session["user_id"]),
    )
    db.commit()
    flash(
        "Transaksi berhasil dihapus." if result.rowcount else "Transaksi tidak ditemukan.",
        "success" if result.rowcount else "error",
    )
    return redirect(url_for("dashboard"))


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
