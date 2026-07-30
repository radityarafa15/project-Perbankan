import getpass
import hashlib
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import sys
from datetime import datetime, timedelta
from email.message import EmailMessage
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
DB_PATH = BASE_DIR / "bank.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"
SECRET_KEY_PATH = BASE_DIR / "instance" / "secret.key"

JENIS_REKENING_PREFIX = {"tabungan": "10", "giro": "20"}
DEPOSITO_PREFIX = "90"

# Bunga tetap per tahun (%) berdasarkan tenor deposito, bunga sederhana
# (bukan bunga majemuk): bunga = pokok * persen/100 * tenor_bulan/12.
TENOR_DEPOSITO = {
    1: 3.0,
    3: 3.5,
    6: 4.0,
    12: 4.5,
}

BATAS_GAGAL_LOGIN = 5
DURASI_KUNCI_MENIT = 15
BATAS_GAGAL_LOGIN_PER_IP = 20
MASA_BERLAKU_VERIFIKASI_MENIT = 24 * 60
MASA_BERLAKU_RESET_PASSWORD_MENIT = 30


def load_secret_key():
    env_key = os.environ.get("BANK_SECRET_KEY")
    if env_key:
        return env_key
    SECRET_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SECRET_KEY_PATH.exists():
        return SECRET_KEY_PATH.read_text(encoding="utf-8").strip()
    key = secrets.token_hex(32)
    SECRET_KEY_PATH.write_text(key, encoding="utf-8")
    return key


app = Flask(__name__)
app.config["SECRET_KEY"] = load_secret_key()
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# Kalau nanti di-deploy di belakang reverse proxy (nginx dll), aktifkan ini supaya
# request.remote_addr (dipakai rate-limiting & audit log) ambil IP asli klien, bukan
# IP proxy. Jangan aktifkan tanpa proxy tepercaya di depan — header X-Forwarded-For
# gampang dipalsukan oleh klien langsung.
# from werkzeug.middleware.proxy_fix import ProxyFix
# app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)


# ========================================================
# DATABASE
# ========================================================
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    db.commit()
    db.close()


# ========================================================
# HELPERS
# ========================================================
def format_rupiah(nominal):
    try:
        angka = int(nominal)
    except (TypeError, ValueError):
        return "Rp 0"
    return "Rp " + f"{angka:,}".replace(",", ".")


app.jinja_env.filters["rupiah"] = format_rupiah


def parse_nominal(raw):
    if raw is None:
        return None
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


LABEL_JENIS_TRANSAKSI = {
    "setor": "Setor Tunai",
    "tarik": "Tarik Tunai",
    "transfer_keluar": "Transfer Keluar",
    "transfer_masuk": "Transfer Masuk",
    "buka_deposito": "Buka Deposito",
    "pencairan_deposito": "Pencairan Deposito",
}

# Jenis transaksi yang menambah saldo (ditampilkan "+" & warna hijau di riwayat);
# selain ini dianggap mengurangi saldo ("-" & warna merah).
JENIS_TRANSAKSI_MASUK = ("setor", "transfer_masuk", "pencairan_deposito")


def saldo_tersedia(db, rekening_id, saldo_rekening):
    # Saldo yang boleh ditarik/ditransfer/dijadikan deposito: saldo total rekening
    # dikurangi total yang sudah "disisihkan" ke kantong aktif. Uangnya tetap milik
    # rekening yang sama, cuma tidak boleh dipakai transaksi keluar selagi di kantong.
    total_kantong = db.execute(
        "SELECT COALESCE(SUM(saldo), 0) AS total FROM pocket "
        "WHERE rekening_id = ? AND status = 'aktif'",
        (rekening_id,),
    ).fetchone()["total"]
    return saldo_rekening - total_kantong

LABEL_PERIODE = {
    "minggu": "Mingguan (minggu ini)",
    "bulan": "Bulanan (bulan ini)",
    "tahun": "Tahunan (tahun ini)",
}


def batas_awal_periode(periode):
    # Semua timestamp di database disimpan UTC (lewat datetime('now') SQLite),
    # jadi batas periode juga dihitung di UTC supaya konsisten dengan data yang difilter.
    sekarang = datetime.utcnow()
    if periode == "minggu":
        mulai = (sekarang - timedelta(days=sekarang.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    elif periode == "tahun":
        mulai = sekarang.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # "bulan" jadi default
        mulai = sekarang.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return mulai.strftime("%Y-%m-%d %H:%M:%S")


# ========================================================
# EMAIL (SMTP kalau dikonfigurasi, jatuh ke log server kalau tidak)
# ========================================================
def kirim_email(tujuan, subjek, isi_teks):
    host = os.environ.get("MAIL_SERVER")
    if not host:
        # Mode pengembangan: belum ada SMTP dikonfigurasi. Link/kode dicatat ke log
        # server saja (bukan dibalas ke browser peminta) supaya alur reset password/
        # verifikasi tetap bisa diuji tanpa membocorkan token ke siapa pun yang
        # sekadar tahu username/email orang lain.
        app.logger.info(
            "[DEV EMAIL FALLBACK] Ke: %s | Subjek: %s\n%s", tujuan, subjek, isi_teks
        )
        return False

    port = int(os.environ.get("MAIL_PORT", "587"))
    username = os.environ.get("MAIL_USERNAME")
    password = os.environ.get("MAIL_PASSWORD")
    pengirim = os.environ.get("MAIL_FROM", username or "no-reply@siperbankan.local")
    pakai_tls = os.environ.get("MAIL_USE_TLS", "1") != "0"

    msg = EmailMessage()
    msg["Subject"] = subjek
    msg["From"] = pengirim
    msg["To"] = tujuan
    msg.set_content(isi_teks)

    try:
        if pakai_tls:
            with smtplib.SMTP(host, port, timeout=10) as server:
                server.starttls(context=ssl.create_default_context())
                if username and password:
                    server.login(username, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP_SSL(
                host, port, timeout=10, context=ssl.create_default_context()
            ) as server:
                if username and password:
                    server.login(username, password)
                server.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as err:
        app.logger.error("Gagal mengirim email ke %s: %s", tujuan, err)
        return False


# ========================================================
# TOKEN AKSI (verifikasi email & reset password)
# ========================================================
def buat_token_aksi(user_id, jenis, masa_berlaku_menit):
    token_mentah = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token_mentah.encode("utf-8")).hexdigest()
    kedaluwarsa = (datetime.utcnow() + timedelta(minutes=masa_berlaku_menit)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    db = get_db()
    db.execute(
        "INSERT INTO token_aksi (user_id, jenis, token_hash, kedaluwarsa) VALUES (?, ?, ?, ?)",
        (user_id, jenis, token_hash, kedaluwarsa),
    )
    db.commit()
    return token_mentah


def ambil_token_valid(token_mentah, jenis):
    token_hash = hashlib.sha256(token_mentah.encode("utf-8")).hexdigest()
    db = get_db()
    return db.execute(
        "SELECT * FROM token_aksi WHERE token_hash = ? AND jenis = ? "
        "AND dipakai_pada IS NULL AND kedaluwarsa > datetime('now')",
        (token_hash, jenis),
    ).fetchone()


def tandai_token_dipakai(token_id):
    get_db().execute(
        "UPDATE token_aksi SET dipakai_pada = datetime('now') WHERE id = ?", (token_id,)
    )


def kirim_verifikasi_email(user):
    token = buat_token_aksi(user["id"], "verifikasi_email", MASA_BERLAKU_VERIFIKASI_MENIT)
    link = url_for("verifikasi_email", token=token, _external=True)
    kirim_email(
        user["email"],
        "Verifikasi email SIPerbankan",
        f"Halo {user['nama_lengkap']},\n\n"
        f"Klik link berikut untuk memverifikasi email kamu (berlaku 24 jam):\n{link}\n\n"
        "Kalau kamu tidak merasa mendaftar, abaikan email ini.",
    )


# ========================================================
# AUDIT LOG
# ========================================================
def catat_audit(aksi, detail="", user_id=None, username_percobaan=None, berhasil=True):
    get_db().execute(
        "INSERT INTO audit_log (user_id, username_percobaan, aksi, detail, alamat_ip, berhasil) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, username_percobaan, aksi, detail, request.remote_addr, 1 if berhasil else 0),
    )
    get_db().commit()


def current_user():
    if "user_id" not in session:
        return None
    db = get_db()
    return db.execute(
        "SELECT * FROM users WHERE id = ?", (session["user_id"],)
    ).fetchone()


def get_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
    return session["csrf_token"]


@app.context_processor
def inject_globals():
    return {"current_user": current_user(), "csrf_token": get_csrf_token()}


@app.before_request
def csrf_protect():
    if request.method == "POST":
        token = session.get("csrf_token")
        form_token = request.form.get("csrf_token")
        if not token or not form_token or not secrets.compare_digest(token, form_token):
            abort(400, description="Sesi tidak valid atau kadaluarsa. Silakan muat ulang halaman dan coba lagi.")


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        # Cek ke database (bukan cuma percaya session) — kalau user_id di sesi
        # sudah tidak ada di database (mis. akun dihapus atau DB di-reset while
        # cookie lama masih tersimpan di browser), anggap sesi ini basi: bersihkan
        # dan minta login ulang, daripada membiarkan halaman tampil tanpa
        # current_user (yang membuat sidebar & tombol Keluar hilang).
        if not current_user():
            session.clear()
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user:
            session.clear()
            return redirect(url_for("login", next=request.path))
        if user["role"] != "admin":
            abort(403)
        return view(*args, **kwargs)

    return wrapped


def get_rekening_or_403(nomor_rekening):
    db = get_db()
    rekening = db.execute(
        "SELECT * FROM rekening WHERE nomor_rekening = ?", (nomor_rekening,)
    ).fetchone()
    if rekening is None:
        abort(404)
    if session.get("role") != "admin" and rekening["user_id"] != session.get("user_id"):
        abort(403)
    return rekening


# ========================================================
# ROUTES: BERANDA
# ========================================================
@app.route("/")
def index():
    if "user_id" not in session:
        return redirect(url_for("login"))
    if session.get("role") == "admin":
        return redirect(url_for("admin_dashboard"))
    return redirect(url_for("dashboard"))


# ========================================================
# ROUTES: AUTENTIKASI
# ========================================================
@app.route("/register", methods=["GET", "POST"])
def register():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    form_data = {"nama_lengkap": "", "username": "", "email": ""}

    if request.method == "POST":
        nama_lengkap = request.form.get("nama_lengkap", "").strip()
        username = request.form.get("username", "").strip().lower()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        konfirmasi = request.form.get("konfirmasi_password", "")
        form_data = {"nama_lengkap": nama_lengkap, "username": username, "email": email}

        errors = []
        if not nama_lengkap:
            errors.append("Nama lengkap wajib diisi.")
        if not re.fullmatch(r"[a-z0-9_]{4,20}", username):
            errors.append("Username 4-20 karakter: huruf kecil, angka, atau underscore.")
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            errors.append("Format email tidak valid.")
        if len(password) < 8:
            errors.append("Password minimal 8 karakter.")
        if password != konfirmasi:
            errors.append("Konfirmasi password tidak cocok dengan password.")

        db = get_db()
        if not errors:
            existing = db.execute(
                "SELECT id FROM users WHERE username = ? OR email = ?", (username, email)
            ).fetchone()
            if existing:
                errors.append("Username atau email sudah terdaftar.")

        if errors:
            for pesan in errors:
                flash(pesan, "error")
            return render_template("register.html", form=form_data)

        cur = db.execute(
            "INSERT INTO users (nama_lengkap, username, email, password_hash, role) "
            "VALUES (?, ?, ?, ?, 'nasabah')",
            (nama_lengkap, username, email, generate_password_hash(password)),
        )
        db.commit()
        user_id = cur.lastrowid
        catat_audit("registrasi", user_id=user_id, username_percobaan=username)

        user_baru = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        kirim_verifikasi_email(user_baru)

        flash(
            "Registrasi berhasil! Silakan masuk, lalu verifikasi email kamu untuk bisa membuka rekening.",
            "sukses",
        )
        return redirect(url_for("login"))

    return render_template("register.html", form=form_data)


@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    username = ""
    if request.method == "POST":
        username = request.form.get("username", "").strip().lower()
        password = request.form.get("password", "")
        db = get_db()

        # Throttle per-IP: batasi total percobaan gagal dari satu alamat dalam 5 menit
        # terakhir, supaya penyerang tidak bisa menyemprot banyak username berbeda
        # untuk menghindari lockout per-akun di bawah.
        gagal_dari_ip = db.execute(
            "SELECT COUNT(*) AS n FROM audit_log WHERE aksi = 'login_gagal' "
            "AND alamat_ip = ? AND waktu > datetime('now', '-5 minutes')",
            (request.remote_addr,),
        ).fetchone()["n"]
        if gagal_dari_ip >= BATAS_GAGAL_LOGIN_PER_IP:
            catat_audit("login_diblokir_ip", username_percobaan=username, berhasil=False)
            flash("Terlalu banyak percobaan login dari alamat ini. Coba lagi beberapa menit lagi.", "error")
            return render_template("login.html", username=username)

        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        if user is not None and user["terkunci_hingga"] and user["terkunci_hingga"] > now_str:
            catat_audit(
                "login_gagal_terkunci", user_id=user["id"], username_percobaan=username, berhasil=False
            )
            flash(
                "Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.",
                "error",
            )
            return render_template("login.html", username=username)

        if user is None or not check_password_hash(user["password_hash"], password):
            if user is not None:
                db.execute(
                    "UPDATE users SET gagal_login_count = gagal_login_count + 1, "
                    "terkunci_hingga = CASE WHEN gagal_login_count + 1 >= ? "
                    "THEN datetime('now', ?) ELSE terkunci_hingga END "
                    "WHERE id = ?",
                    (BATAS_GAGAL_LOGIN, f"+{DURASI_KUNCI_MENIT} minutes", user["id"]),
                )
                db.commit()
            catat_audit(
                "login_gagal",
                user_id=user["id"] if user else None,
                username_percobaan=username,
                berhasil=False,
            )
            flash("Username atau password salah.", "error")
            return render_template("login.html", username=username)

        db.execute(
            "UPDATE users SET gagal_login_count = 0, terkunci_hingga = NULL WHERE id = ?",
            (user["id"],),
        )
        db.commit()
        catat_audit("login_berhasil", user_id=user["id"], username_percobaan=username)

        session.clear()
        session["user_id"] = user["id"]
        session["role"] = user["role"]

        next_url = request.args.get("next")
        if user["role"] == "admin":
            return redirect(next_url or url_for("admin_dashboard"))
        return redirect(next_url or url_for("dashboard"))

    return render_template("login.html", username=username)


@app.route("/logout", methods=["POST"])
def logout():
    catat_audit("logout", user_id=session.get("user_id"))
    session.clear()
    flash("Berhasil keluar.", "sukses")
    return redirect(url_for("login"))


@app.route("/kirim-ulang-verifikasi", methods=["POST"])
@login_required
def kirim_ulang_verifikasi():
    user = current_user()
    if user["email_verified"]:
        flash("Email kamu sudah terverifikasi.", "sukses")
        return redirect(url_for("dashboard"))

    db = get_db()
    terakhir = db.execute(
        "SELECT dibuat_pada FROM token_aksi WHERE user_id = ? AND jenis = 'verifikasi_email' "
        "ORDER BY id DESC LIMIT 1",
        (user["id"],),
    ).fetchone()
    if terakhir:
        dibuat = datetime.strptime(terakhir["dibuat_pada"], "%Y-%m-%d %H:%M:%S")
        if datetime.utcnow() - dibuat < timedelta(seconds=60):
            flash("Tunggu sebentar sebelum meminta kirim ulang email verifikasi.", "error")
            return redirect(url_for("dashboard"))

    kirim_verifikasi_email(user)
    catat_audit("kirim_ulang_verifikasi", user_id=user["id"])
    flash("Email verifikasi telah dikirim ulang.", "sukses")
    return redirect(url_for("dashboard"))


@app.route("/verifikasi-email/<token>")
def verifikasi_email(token):
    token_row = ambil_token_valid(token, "verifikasi_email")
    if token_row is None:
        flash("Link verifikasi tidak valid atau sudah kedaluwarsa.", "error")
        return redirect(url_for("login"))

    db = get_db()
    db.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (token_row["user_id"],))
    tandai_token_dipakai(token_row["id"])
    db.commit()
    catat_audit("verifikasi_email_berhasil", user_id=token_row["user_id"])

    flash("Email berhasil diverifikasi. Sekarang kamu bisa membuka rekening.", "sukses")
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/lupa-password", methods=["GET", "POST"])
def lupa_password():
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user is not None:
            token = buat_token_aksi(
                user["id"], "reset_password", MASA_BERLAKU_RESET_PASSWORD_MENIT
            )
            link = url_for("reset_password", token=token, _external=True)
            kirim_email(
                user["email"],
                "Reset password SIPerbankan",
                f"Halo {user['nama_lengkap']},\n\n"
                f"Klik link berikut untuk mengatur ulang password kamu (berlaku 30 menit):\n{link}\n\n"
                "Kalau kamu tidak meminta ini, abaikan email ini — password kamu tetap aman.",
            )
            catat_audit(
                "minta_reset_password", user_id=user["id"], username_percobaan=user["username"]
            )
        # Pesan selalu sama persis, entah emailnya terdaftar atau tidak, supaya form ini
        # tidak bisa dipakai untuk menebak email mana saja yang punya akun (enumerasi akun).
        flash("Jika email tersebut terdaftar, link reset password telah dikirim.", "sukses")
        return redirect(url_for("login"))

    return render_template("lupa_password.html")


@app.route("/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token):
    if "user_id" in session:
        return redirect(url_for("dashboard"))

    token_row = ambil_token_valid(token, "reset_password")
    if token_row is None:
        flash("Link reset password tidak valid atau sudah kedaluwarsa.", "error")
        return redirect(url_for("lupa_password"))

    if request.method == "POST":
        password = request.form.get("password", "")
        konfirmasi = request.form.get("konfirmasi_password", "")

        if len(password) < 8:
            flash("Password minimal 8 karakter.", "error")
            return render_template("reset_password.html", token=token)
        if password != konfirmasi:
            flash("Konfirmasi password tidak cocok dengan password.", "error")
            return render_template("reset_password.html", token=token)

        db = get_db()
        db.execute(
            "UPDATE users SET password_hash = ?, gagal_login_count = 0, terkunci_hingga = NULL "
            "WHERE id = ?",
            (generate_password_hash(password), token_row["user_id"]),
        )
        tandai_token_dipakai(token_row["id"])
        db.commit()
        catat_audit("reset_password_berhasil", user_id=token_row["user_id"])

        flash("Password berhasil diubah. Silakan masuk dengan password barumu.", "sukses")
        return redirect(url_for("login"))

    return render_template("reset_password.html", token=token)


# ========================================================
# ROUTES: NASABAH
# ========================================================
@app.route("/dashboard")
@login_required
def dashboard():
    if session.get("role") == "admin":
        return redirect(url_for("admin_dashboard"))

    db = get_db()
    rekening_list = db.execute(
        "SELECT * FROM rekening WHERE user_id = ? ORDER BY dibuat_pada", (session["user_id"],)
    ).fetchall()
    total_saldo = sum(r["saldo"] for r in rekening_list if r["status"] == "aktif")
    return render_template("dashboard.html", rekening_list=rekening_list, total_saldo=total_saldo)


@app.route("/rekening/buka", methods=["POST"])
@login_required
def buka_rekening():
    jenis = request.form.get("jenis")
    if jenis not in JENIS_REKENING_PREFIX:
        flash("Jenis rekening tidak valid.", "error")
        return redirect(url_for("dashboard"))

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO rekening (nomor_rekening, user_id, jenis, saldo, status) "
            "VALUES (?, ?, ?, 0, 'aktif')",
            (f"SEMENTARA-{secrets.token_hex(4)}", session["user_id"], jenis),
        )
        rekening_id = cur.lastrowid
        nomor_rekening = f"{JENIS_REKENING_PREFIX[jenis]}{rekening_id:08d}"
        db.execute(
            "UPDATE rekening SET nomor_rekening = ? WHERE id = ?", (nomor_rekening, rekening_id)
        )
        db.commit()
        catat_audit(
            "buka_rekening",
            user_id=session["user_id"],
            detail=f"{jenis} - {nomor_rekening}",
        )
        flash(
            f"Rekening {jenis} berhasil dibuka. Nomor rekening: {nomor_rekening}", "sukses"
        )
    except sqlite3.Error:
        db.rollback()
        flash("Gagal membuka rekening, silakan coba lagi.", "error")

    return redirect(url_for("dashboard"))


@app.route("/rekening/<nomor_rekening>")
@login_required
def rekening_detail(nomor_rekening):
    db = get_db()
    rekening = get_rekening_or_403(nomor_rekening)
    mutasi = db.execute(
        "SELECT t.*, r.nomor_rekening AS nomor_lawan FROM transaksi t "
        "LEFT JOIN rekening r ON r.id = t.rekening_lawan_id "
        "WHERE t.rekening_id = ? ORDER BY t.id DESC LIMIT 100",
        (rekening["id"],),
    ).fetchall()
    pemilik = db.execute("SELECT * FROM users WHERE id = ?", (rekening["user_id"],)).fetchone()

    # Ringkasan nominal per jenis mutasi (Setor/Tarik/Transfer Keluar/Transfer Masuk),
    # dipakai grafik pie di halaman ini. Dihitung dari mutasi yang sama dengan yang
    # ditampilkan di tabel (100 terakhir), bukan seluruh riwayat.
    total_per_jenis = {}
    for m in mutasi:
        total_per_jenis[m["jenis"]] = total_per_jenis.get(m["jenis"], 0) + m["nominal"]
    chart_labels = [LABEL_JENIS_TRANSAKSI[jenis] for jenis in total_per_jenis]
    chart_data = list(total_per_jenis.values())

    pocket_list = db.execute(
        "SELECT * FROM pocket WHERE rekening_id = ? ORDER BY dibuat_pada", (rekening["id"],)
    ).fetchall()
    tersedia = saldo_tersedia(db, rekening["id"], rekening["saldo"])

    return render_template(
        "rekening.html",
        rekening=rekening,
        mutasi=mutasi,
        pemilik=pemilik,
        chart_labels=chart_labels,
        chart_data=chart_data,
        pocket_list=pocket_list,
        saldo_tersedia=tersedia,
    )


@app.route("/rekening/<nomor_rekening>/ekspor")
@login_required
def ekspor_mutasi(nomor_rekening):
    rekening = get_rekening_or_403(nomor_rekening)
    periode = request.args.get("periode", "bulan")
    if periode not in LABEL_PERIODE:
        periode = "bulan"

    db = get_db()
    mutasi = db.execute(
        "SELECT t.*, r.nomor_rekening AS nomor_lawan FROM transaksi t "
        "LEFT JOIN rekening r ON r.id = t.rekening_lawan_id "
        "WHERE t.rekening_id = ? AND t.dibuat_pada >= ? "
        "ORDER BY t.dibuat_pada ASC",
        (rekening["id"], batas_awal_periode(periode)),
    ).fetchall()

    baris = [
        "=" * 64,
        "LAPORAN RIWAYAT TRANSAKSI - SIPerbankan",
        "=" * 64,
        f"Nomor Rekening : {rekening['nomor_rekening']}",
        f"Jenis Rekening : {rekening['jenis'].capitalize()}",
        f"Periode        : {LABEL_PERIODE[periode]}",
        f"Dicetak pada   : {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC",
        "-" * 64,
    ]

    if not mutasi:
        baris.append("Tidak ada transaksi pada periode ini.")
    else:
        total_masuk = 0
        total_keluar = 0
        for m in mutasi:
            tanda_masuk = m["jenis"] in JENIS_TRANSAKSI_MASUK
            tanda = "+" if tanda_masuk else "-"
            total_masuk += m["nominal"] if tanda_masuk else 0
            total_keluar += 0 if tanda_masuk else m["nominal"]
            lawan = f" | lawan: {m['nomor_lawan']}" if m["nomor_lawan"] else ""
            baris.append(
                f"{m['dibuat_pada']}  {LABEL_JENIS_TRANSAKSI[m['jenis']]:<16} "
                f"{tanda}{format_rupiah(m['nominal']):>17}  "
                f"Saldo: {format_rupiah(m['saldo_setelah']):>17}  "
                f"{m['keterangan']}{lawan}"
            )
        baris += [
            "-" * 64,
            f"Total Masuk  : {format_rupiah(total_masuk)}",
            f"Total Keluar : {format_rupiah(total_keluar)}",
            f"Saldo Akhir  : {format_rupiah(rekening['saldo'])}",
        ]

    baris.append("=" * 64)

    catat_audit(
        "ekspor_mutasi", user_id=session.get("user_id"), detail=f"{nomor_rekening} - {periode}"
    )

    nama_file = (
        f"riwayat-{rekening['nomor_rekening']}-{periode}-"
        f"{datetime.utcnow().strftime('%Y%m%d')}.txt"
    )
    response = app.response_class("\n".join(baris) + "\n", mimetype="text/plain; charset=utf-8")
    response.headers["Content-Disposition"] = f'attachment; filename="{nama_file}"'
    return response


@app.route("/rekening/<nomor_rekening>/setor", methods=["POST"])
@login_required
def setor(nomor_rekening):
    rekening = get_rekening_or_403(nomor_rekening)
    nominal = parse_nominal(request.form.get("nominal"))
    keterangan = request.form.get("keterangan", "").strip() or "Setor tunai"

    if nominal is None or nominal <= 0:
        flash("Nominal setoran tidak valid.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    db = get_db()
    try:
        cur = db.execute(
            "UPDATE rekening SET saldo = saldo + ? WHERE id = ? AND status = 'aktif'",
            (nominal, rekening["id"]),
        )
        if cur.rowcount == 0:
            db.rollback()
            catat_audit(
                "setor_gagal",
                user_id=session["user_id"],
                detail=f"{nomor_rekening} +{nominal}",
                berhasil=False,
            )
            flash("Rekening tidak aktif, setoran dibatalkan.", "error")
            return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

        saldo_baru = db.execute(
            "SELECT saldo FROM rekening WHERE id = ?", (rekening["id"],)
        ).fetchone()["saldo"]
        db.execute(
            "INSERT INTO transaksi (rekening_id, jenis, nominal, saldo_setelah, keterangan) "
            "VALUES (?, 'setor', ?, ?, ?)",
            (rekening["id"], nominal, saldo_baru, keterangan),
        )
        db.commit()
        catat_audit(
            "setor", user_id=session["user_id"], detail=f"{nomor_rekening} +{nominal}"
        )
        flash(f"Setor tunai {format_rupiah(nominal)} berhasil.", "sukses")
    except sqlite3.Error:
        db.rollback()
        flash("Gagal memproses setoran, silakan coba lagi.", "error")

    return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))


@app.route("/rekening/<nomor_rekening>/tarik", methods=["POST"])
@login_required
def tarik(nomor_rekening):
    rekening = get_rekening_or_403(nomor_rekening)
    nominal = parse_nominal(request.form.get("nominal"))
    keterangan = request.form.get("keterangan", "").strip() or "Tarik tunai"

    if nominal is None or nominal <= 0:
        flash("Nominal penarikan tidak valid.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    db = get_db()
    try:
        # Saldo yang boleh ditarik dibatasi saldo_tersedia (saldo dikurangi kantong aktif),
        # dihitung lewat subquery yang sama supaya tetap atomik & bebas race condition.
        cur = db.execute(
            "UPDATE rekening SET saldo = saldo - ? "
            "WHERE id = ? AND status = 'aktif' "
            "AND (saldo - COALESCE("
            "  (SELECT SUM(saldo) FROM pocket WHERE rekening_id = rekening.id AND status = 'aktif'), 0"
            ")) >= ?",
            (nominal, rekening["id"], nominal),
        )
        if cur.rowcount == 0:
            db.rollback()
            catat_audit(
                "tarik_gagal",
                user_id=session["user_id"],
                detail=f"{nomor_rekening} -{nominal}",
                berhasil=False,
            )
            flash(
                "Saldo tersedia tidak mencukupi (mungkin sebagian sedang di kantong) "
                "atau rekening tidak aktif.",
                "error",
            )
            return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

        saldo_baru = db.execute(
            "SELECT saldo FROM rekening WHERE id = ?", (rekening["id"],)
        ).fetchone()["saldo"]
        db.execute(
            "INSERT INTO transaksi (rekening_id, jenis, nominal, saldo_setelah, keterangan) "
            "VALUES (?, 'tarik', ?, ?, ?)",
            (rekening["id"], nominal, saldo_baru, keterangan),
        )
        db.commit()
        catat_audit(
            "tarik", user_id=session["user_id"], detail=f"{nomor_rekening} -{nominal}"
        )
        flash(f"Tarik tunai {format_rupiah(nominal)} berhasil.", "sukses")
    except sqlite3.Error:
        db.rollback()
        flash("Gagal memproses penarikan, silakan coba lagi.", "error")

    return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))


@app.route("/rekening/<nomor_rekening>/transfer", methods=["POST"])
@login_required
def transfer(nomor_rekening):
    rekening_asal = get_rekening_or_403(nomor_rekening)
    nomor_tujuan = request.form.get("nomor_tujuan", "").strip()
    nominal = parse_nominal(request.form.get("nominal"))
    keterangan = request.form.get("keterangan", "").strip() or "Transfer"

    if nominal is None or nominal <= 0:
        flash("Nominal transfer tidak valid.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))
    if nomor_tujuan == rekening_asal["nomor_rekening"]:
        flash("Tidak bisa transfer ke rekening sendiri.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    db = get_db()
    rekening_tujuan = db.execute(
        "SELECT * FROM rekening WHERE nomor_rekening = ?", (nomor_tujuan,)
    ).fetchone()
    if rekening_tujuan is None or rekening_tujuan["status"] != "aktif":
        flash("Rekening tujuan tidak ditemukan atau tidak aktif.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    try:
        cur = db.execute(
            "UPDATE rekening SET saldo = saldo - ? "
            "WHERE id = ? AND status = 'aktif' "
            "AND (saldo - COALESCE("
            "  (SELECT SUM(saldo) FROM pocket WHERE rekening_id = rekening.id AND status = 'aktif'), 0"
            ")) >= ?",
            (nominal, rekening_asal["id"], nominal),
        )
        if cur.rowcount == 0:
            db.rollback()
            catat_audit(
                "transfer_gagal",
                user_id=session["user_id"],
                detail=f"{nomor_rekening} -> {nomor_tujuan} : {nominal}",
                berhasil=False,
            )
            flash("Saldo tersedia tidak mencukupi (mungkin sebagian sedang di kantong).", "error")
            return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

        db.execute(
            "UPDATE rekening SET saldo = saldo + ? WHERE id = ?", (nominal, rekening_tujuan["id"])
        )

        saldo_asal_baru = db.execute(
            "SELECT saldo FROM rekening WHERE id = ?", (rekening_asal["id"],)
        ).fetchone()["saldo"]
        saldo_tujuan_baru = db.execute(
            "SELECT saldo FROM rekening WHERE id = ?", (rekening_tujuan["id"],)
        ).fetchone()["saldo"]

        db.execute(
            "INSERT INTO transaksi "
            "(rekening_id, jenis, nominal, saldo_setelah, keterangan, rekening_lawan_id) "
            "VALUES (?, 'transfer_keluar', ?, ?, ?, ?)",
            (rekening_asal["id"], nominal, saldo_asal_baru, keterangan, rekening_tujuan["id"]),
        )
        db.execute(
            "INSERT INTO transaksi "
            "(rekening_id, jenis, nominal, saldo_setelah, keterangan, rekening_lawan_id) "
            "VALUES (?, 'transfer_masuk', ?, ?, ?, ?)",
            (rekening_tujuan["id"], nominal, saldo_tujuan_baru, keterangan, rekening_asal["id"]),
        )
        db.commit()
        catat_audit(
            "transfer",
            user_id=session["user_id"],
            detail=f"{nomor_rekening} -> {nomor_tujuan} : {nominal}",
        )
        flash(
            f"Transfer {format_rupiah(nominal)} ke rekening {nomor_tujuan} berhasil.", "sukses"
        )
    except sqlite3.Error:
        db.rollback()
        flash("Gagal memproses transfer, silakan coba lagi.", "error")

    return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))


# ========================================================
# ROUTES: PORTOFOLIO > SIMPANAN > KANTONG (POCKET)
# Uang di kantong tetap bagian dari saldo rekening yang sama — alokasi/tarik
# kantong TIDAK mengubah rekening.saldo, cuma memindah antara "tersedia" &
# kantong. Karena itu dicatat di mutasi_pocket, bukan tabel transaksi.
# ========================================================
def get_pocket_or_404(pocket_id, rekening_id):
    db = get_db()
    pocket = db.execute(
        "SELECT * FROM pocket WHERE id = ? AND rekening_id = ?", (pocket_id, rekening_id)
    ).fetchone()
    if pocket is None:
        abort(404)
    return pocket


@app.route("/rekening/<nomor_rekening>/kantong/buat", methods=["POST"])
@login_required
def buat_kantong(nomor_rekening):
    rekening = get_rekening_or_403(nomor_rekening)
    nama = request.form.get("nama", "").strip()
    if not nama:
        flash("Nama kantong wajib diisi.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    db = get_db()
    db.execute(
        "INSERT INTO pocket (rekening_id, nama, saldo, status) VALUES (?, ?, 0, 'aktif')",
        (rekening["id"], nama),
    )
    db.commit()
    catat_audit("buat_kantong", user_id=session["user_id"], detail=f"{nomor_rekening} - {nama}")
    flash(f'Kantong "{nama}" berhasil dibuat.', "sukses")
    return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))


@app.route("/rekening/<nomor_rekening>/kantong/<int:pocket_id>/alokasi", methods=["POST"])
@login_required
def alokasi_kantong(nomor_rekening, pocket_id):
    rekening = get_rekening_or_403(nomor_rekening)
    pocket = get_pocket_or_404(pocket_id, rekening["id"])
    nominal = parse_nominal(request.form.get("nominal"))

    if nominal is None or nominal <= 0:
        flash("Nominal tidak valid.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))
    if pocket["status"] != "aktif":
        flash("Kantong ini sudah ditutup.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    db = get_db()
    # Cek atomik: saldo_tersedia rekening (sebelum alokasi ini) harus >= nominal.
    cur = db.execute(
        "UPDATE pocket SET saldo = saldo + ? "
        "WHERE id = ? AND status = 'aktif' AND ("
        "  (SELECT saldo FROM rekening WHERE id = ?) - COALESCE("
        "    (SELECT SUM(saldo) FROM pocket WHERE rekening_id = ? AND status = 'aktif'), 0"
        "  )"
        ") >= ?",
        (nominal, pocket_id, rekening["id"], rekening["id"], nominal),
    )
    if cur.rowcount == 0:
        db.rollback()
        flash("Saldo tersedia tidak mencukupi untuk dialokasikan ke kantong ini.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    saldo_pocket_baru = db.execute(
        "SELECT saldo FROM pocket WHERE id = ?", (pocket_id,)
    ).fetchone()["saldo"]
    db.execute(
        "INSERT INTO mutasi_pocket (pocket_id, jenis, nominal, saldo_setelah) "
        "VALUES (?, 'alokasi', ?, ?)",
        (pocket_id, nominal, saldo_pocket_baru),
    )
    db.commit()
    catat_audit(
        "alokasi_kantong",
        user_id=session["user_id"],
        detail=f"{nomor_rekening} - kantong#{pocket_id} +{nominal}",
    )
    flash(f"{format_rupiah(nominal)} berhasil dialokasikan ke kantong.", "sukses")
    return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))


@app.route("/rekening/<nomor_rekening>/kantong/<int:pocket_id>/tarik", methods=["POST"])
@login_required
def tarik_kantong(nomor_rekening, pocket_id):
    rekening = get_rekening_or_403(nomor_rekening)
    get_pocket_or_404(pocket_id, rekening["id"])
    nominal = parse_nominal(request.form.get("nominal"))

    if nominal is None or nominal <= 0:
        flash("Nominal tidak valid.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    db = get_db()
    cur = db.execute(
        "UPDATE pocket SET saldo = saldo - ? WHERE id = ? AND status = 'aktif' AND saldo >= ?",
        (nominal, pocket_id, nominal),
    )
    if cur.rowcount == 0:
        db.rollback()
        flash("Saldo kantong tidak mencukupi.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    saldo_pocket_baru = db.execute(
        "SELECT saldo FROM pocket WHERE id = ?", (pocket_id,)
    ).fetchone()["saldo"]
    db.execute(
        "INSERT INTO mutasi_pocket (pocket_id, jenis, nominal, saldo_setelah) "
        "VALUES (?, 'tarik', ?, ?)",
        (pocket_id, nominal, saldo_pocket_baru),
    )
    db.commit()
    catat_audit(
        "tarik_kantong",
        user_id=session["user_id"],
        detail=f"{nomor_rekening} - kantong#{pocket_id} -{nominal}",
    )
    flash(f"{format_rupiah(nominal)} berhasil ditarik dari kantong ke saldo tersedia.", "sukses")
    return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))


@app.route("/rekening/<nomor_rekening>/kantong/<int:pocket_id>/tutup", methods=["POST"])
@login_required
def tutup_kantong(nomor_rekening, pocket_id):
    rekening = get_rekening_or_403(nomor_rekening)
    pocket = get_pocket_or_404(pocket_id, rekening["id"])

    if pocket["saldo"] > 0:
        flash("Kosongkan (tarik) saldo kantong dulu sebelum menutupnya.", "error")
        return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))

    db = get_db()
    db.execute("UPDATE pocket SET status = 'ditutup' WHERE id = ?", (pocket_id,))
    db.commit()
    catat_audit(
        "tutup_kantong", user_id=session["user_id"], detail=f"{nomor_rekening} - kantong#{pocket_id}"
    )
    flash("Kantong berhasil ditutup.", "sukses")
    return redirect(url_for("rekening_detail", nomor_rekening=nomor_rekening))


# ========================================================
# ROUTES: PORTOFOLIO > SIMPANAN > DEPOSITO
# ========================================================
@app.route("/portofolio")
@login_required
def portofolio():
    if session.get("role") == "admin":
        return redirect(url_for("admin_dashboard"))

    db = get_db()
    rekening_list = db.execute(
        "SELECT * FROM rekening WHERE user_id = ? AND status = 'aktif' ORDER BY dibuat_pada",
        (session["user_id"],),
    ).fetchall()
    deposito_list = db.execute(
        "SELECT d.*, r.nomor_rekening AS nomor_rekening_asal FROM deposito d "
        "JOIN rekening r ON r.id = d.rekening_asal_id "
        "WHERE d.user_id = ? ORDER BY d.tanggal_buka DESC",
        (session["user_id"],),
    ).fetchall()

    waktu_sekarang = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    return render_template(
        "portofolio.html",
        rekening_list=rekening_list,
        deposito_list=deposito_list,
        tenor_pilihan=sorted(TENOR_DEPOSITO.items()),
        waktu_sekarang=waktu_sekarang,
    )


@app.route("/deposito/buka", methods=["POST"])
@login_required
def buka_deposito():
    nomor_rekening_asal = request.form.get("nomor_rekening_asal", "").strip()
    tenor_bulan = parse_nominal(request.form.get("tenor_bulan"))
    nominal = parse_nominal(request.form.get("nominal"))

    if tenor_bulan not in TENOR_DEPOSITO:
        flash("Tenor deposito tidak valid.", "error")
        return redirect(url_for("portofolio"))
    if nominal is None or nominal <= 0:
        flash("Nominal deposito tidak valid.", "error")
        return redirect(url_for("portofolio"))

    rekening = get_rekening_or_403(nomor_rekening_asal)
    if rekening["status"] != "aktif":
        flash("Rekening sumber tidak aktif.", "error")
        return redirect(url_for("portofolio"))

    bunga = TENOR_DEPOSITO[tenor_bulan]
    db = get_db()

    try:
        cur = db.execute(
            "UPDATE rekening SET saldo = saldo - ? "
            "WHERE id = ? AND status = 'aktif' "
            "AND (saldo - COALESCE("
            "  (SELECT SUM(saldo) FROM pocket WHERE rekening_id = rekening.id AND status = 'aktif'), 0"
            ")) >= ?",
            (nominal, rekening["id"], nominal),
        )
        if cur.rowcount == 0:
            db.rollback()
            flash("Saldo tersedia tidak mencukupi untuk membuka deposito ini.", "error")
            return redirect(url_for("portofolio"))

        saldo_baru = db.execute(
            "SELECT saldo FROM rekening WHERE id = ?", (rekening["id"],)
        ).fetchone()["saldo"]
        db.execute(
            "INSERT INTO transaksi (rekening_id, jenis, nominal, saldo_setelah, keterangan) "
            "VALUES (?, 'buka_deposito', ?, ?, ?)",
            (rekening["id"], nominal, saldo_baru, f"Buka deposito {tenor_bulan} bulan"),
        )

        jatuh_tempo = (datetime.utcnow() + timedelta(days=30 * tenor_bulan)).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        cur_dep = db.execute(
            "INSERT INTO deposito "
            "(user_id, rekening_asal_id, nomor_deposito, nominal_pokok, tenor_bulan, "
            "bunga_persen_tahun, status, tanggal_jatuh_tempo) "
            "VALUES (?, ?, ?, ?, ?, ?, 'aktif', ?)",
            (
                session["user_id"],
                rekening["id"],
                f"SEMENTARA-{secrets.token_hex(4)}",
                nominal,
                tenor_bulan,
                bunga,
                jatuh_tempo,
            ),
        )
        deposito_id = cur_dep.lastrowid
        nomor_deposito = f"{DEPOSITO_PREFIX}{deposito_id:08d}"
        db.execute(
            "UPDATE deposito SET nomor_deposito = ? WHERE id = ?", (nomor_deposito, deposito_id)
        )
        db.commit()
        catat_audit(
            "buka_deposito",
            user_id=session["user_id"],
            detail=f"{nomor_deposito} - {format_rupiah(nominal)} - {tenor_bulan} bulan @ {bunga}%/th",
        )
        flash(
            f"Deposito {nomor_deposito} berhasil dibuka: {format_rupiah(nominal)} "
            f"selama {tenor_bulan} bulan @ {bunga}%/tahun.",
            "sukses",
        )
    except sqlite3.Error:
        db.rollback()
        flash("Gagal membuka deposito, silakan coba lagi.", "error")

    return redirect(url_for("portofolio"))


@app.route("/deposito/<nomor_deposito>/cairkan", methods=["POST"])
@login_required
def cairkan_deposito(nomor_deposito):
    db = get_db()
    deposito = db.execute(
        "SELECT * FROM deposito WHERE nomor_deposito = ?", (nomor_deposito,)
    ).fetchone()
    if deposito is None:
        abort(404)
    if session.get("role") != "admin" and deposito["user_id"] != session.get("user_id"):
        abort(403)
    if deposito["status"] != "aktif":
        flash("Deposito ini sudah dicairkan sebelumnya.", "error")
        return redirect(url_for("portofolio"))

    sekarang = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    if sekarang < deposito["tanggal_jatuh_tempo"]:
        flash(
            f"Deposito baru bisa dicairkan setelah jatuh tempo ({deposito['tanggal_jatuh_tempo']} UTC).",
            "error",
        )
        return redirect(url_for("portofolio"))

    bunga_didapat = round(
        deposito["nominal_pokok"] * deposito["bunga_persen_tahun"] / 100 * deposito["tenor_bulan"] / 12
    )
    total_cair = deposito["nominal_pokok"] + bunga_didapat

    try:
        db.execute(
            "UPDATE deposito SET status = 'cair', tanggal_cair = datetime('now') WHERE id = ?",
            (deposito["id"],),
        )
        db.execute(
            "UPDATE rekening SET saldo = saldo + ? WHERE id = ?",
            (total_cair, deposito["rekening_asal_id"]),
        )
        saldo_baru = db.execute(
            "SELECT saldo FROM rekening WHERE id = ?", (deposito["rekening_asal_id"],)
        ).fetchone()["saldo"]
        db.execute(
            "INSERT INTO transaksi (rekening_id, jenis, nominal, saldo_setelah, keterangan) "
            "VALUES (?, 'pencairan_deposito', ?, ?, ?)",
            (
                deposito["rekening_asal_id"],
                total_cair,
                saldo_baru,
                f"Pencairan deposito {nomor_deposito} (pokok {format_rupiah(deposito['nominal_pokok'])} "
                f"+ bunga {format_rupiah(bunga_didapat)})",
            ),
        )
        db.commit()
        catat_audit(
            "cairkan_deposito",
            user_id=deposito["user_id"],
            detail=f"{nomor_deposito} - {format_rupiah(total_cair)}",
        )
        flash(
            f"Deposito {nomor_deposito} berhasil dicairkan: {format_rupiah(total_cair)} "
            f"(pokok {format_rupiah(deposito['nominal_pokok'])} + bunga {format_rupiah(bunga_didapat)}).",
            "sukses",
        )
    except sqlite3.Error:
        db.rollback()
        flash("Gagal mencairkan deposito, silakan coba lagi.", "error")

    return redirect(url_for("portofolio"))


# ========================================================
# ROUTES: ADMIN / TELLER
# ========================================================
@app.route("/admin")
@admin_required
def admin_dashboard():
    db = get_db()
    nasabah_list = db.execute(
        "SELECT u.*, "
        "COUNT(CASE WHEN r.status = 'aktif' THEN 1 END) AS jumlah_rekening, "
        "COALESCE(SUM(CASE WHEN r.status = 'aktif' THEN r.saldo END), 0) AS total_saldo "
        "FROM users u LEFT JOIN rekening r ON r.user_id = u.id "
        "WHERE u.role = 'nasabah' "
        "GROUP BY u.id ORDER BY u.nama_lengkap"
    ).fetchall()
    ringkasan = db.execute(
        "SELECT COUNT(*) AS jumlah_rekening, COALESCE(SUM(saldo), 0) AS total_saldo "
        "FROM rekening WHERE status = 'aktif'"
    ).fetchone()
    jumlah_nasabah = db.execute(
        "SELECT COUNT(*) AS n FROM users WHERE role = 'nasabah'"
    ).fetchone()["n"]
    return render_template(
        "admin_dashboard.html",
        nasabah_list=nasabah_list,
        ringkasan=ringkasan,
        jumlah_nasabah=jumlah_nasabah,
    )


@app.route("/admin/nasabah/<int:user_id>")
@admin_required
def admin_nasabah_detail(user_id):
    db = get_db()
    nasabah = db.execute(
        "SELECT * FROM users WHERE id = ? AND role = 'nasabah'", (user_id,)
    ).fetchone()
    if nasabah is None:
        abort(404)
    rekening_list = db.execute(
        "SELECT * FROM rekening WHERE user_id = ? ORDER BY dibuat_pada", (user_id,)
    ).fetchall()
    return render_template(
        "admin_nasabah.html", nasabah=nasabah, rekening_list=rekening_list
    )


@app.route("/admin/audit")
@admin_required
def admin_audit():
    db = get_db()
    entries = db.execute(
        "SELECT a.*, u.username AS username_user FROM audit_log a "
        "LEFT JOIN users u ON u.id = a.user_id "
        "ORDER BY a.id DESC LIMIT 200"
    ).fetchall()
    return render_template("admin_audit.html", entries=entries)


# ========================================================
# CLI: BUAT AKUN ADMIN PERTAMA
# python app.py createadmin
# ========================================================
def cli_create_admin():
    init_db()
    print("=== Buat akun Admin/Teller ===")
    username = input("Username admin: ").strip().lower()
    email = input("Email admin: ").strip().lower()
    nama_lengkap = input("Nama lengkap: ").strip()
    password = getpass.getpass("Password (min 8 karakter): ")

    if not re.fullmatch(r"[a-z0-9_]{4,20}", username):
        print("Gagal: username 4-20 karakter, huruf kecil/angka/underscore saja.")
        sys.exit(1)
    if len(password) < 8:
        print("Gagal: password minimal 8 karakter.")
        sys.exit(1)

    db = sqlite3.connect(DB_PATH)
    try:
        db.execute(
            "INSERT INTO users (nama_lengkap, username, email, password_hash, role) "
            "VALUES (?, ?, ?, ?, 'admin')",
            (nama_lengkap, username, email, generate_password_hash(password)),
        )
        db.commit()
        print(f"Admin '{username}' berhasil dibuat. Silakan login lewat halaman /login.")
    except sqlite3.IntegrityError:
        print("Gagal: username atau email sudah dipakai.")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "createadmin":
        cli_create_admin()
    else:
        init_db()
        app.run(debug=True)
