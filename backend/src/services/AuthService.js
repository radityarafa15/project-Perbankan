'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 12;

/**
 * AuthService — menangani semua logika autentikasi:
 * register, login, verifikasi PIN, update PIN.
 */
class AuthService {
  /**
   * Mendaftarkan user baru.
   * @param {{ name, username, email, password }} data
   * @returns {{ user, token }}
   */
  register({ name, username, email, password }) {
    const db = getDb();

    // Validasi duplikat
    const existing = db
      .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
      .get(username.toLowerCase(), email.toLowerCase());

    if (existing) {
      throw Object.assign(new Error('Username atau email sudah digunakan.'), { status: 409 });
    }

    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);

    const result = db
      .prepare(
        'INSERT INTO users (name, username, email, password_hash) VALUES (?, ?, ?, ?)'
      )
      .run(name.trim(), username.trim().toLowerCase(), email.trim().toLowerCase(), passwordHash);

    const userId = result.lastInsertRowid;

    // Buat dompet default
    db.prepare(
      "INSERT INTO wallets (user_id, name, icon, color) VALUES (?, ?, ?, ?)"
    ).run(userId, 'Dompet Utama', '💼', '#2a78d6');

    const user = this._getUserById(userId);
    const token = this._signToken(user);

    return { user, token };
  }

  /**
   * Login dengan username/email + password.
   * @param {{ usernameOrEmail, password }} data
   * @returns {{ user, token }}
   */
  login({ usernameOrEmail, password }) {
    const db = getDb();
    const identifier = usernameOrEmail.trim().toLowerCase();

    const user = db
      .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
      .get(identifier, identifier);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      throw Object.assign(new Error('Username/email atau password salah.'), { status: 401 });
    }

    const safeUser = this._safeUser(user);
    const token = this._signToken(safeUser);
    return { user: safeUser, token };
  }

  /**
   * Mengambil profil user berdasarkan ID (dari JWT).
   */
  getProfile(userId) {
    const user = this._getUserById(userId);
    if (!user) throw Object.assign(new Error('User tidak ditemukan.'), { status: 404 });
    return user;
  }

  /**
   * Menetapkan atau mengubah PIN user.
   * @param {number} userId
   * @param {string} newPin — 4–8 digit
   */
  setPin(userId, newPin) {
    if (!/^\d{4,8}$/.test(newPin)) {
      throw Object.assign(new Error('PIN harus 4–8 digit angka.'), { status: 400 });
    }
    const pinHash = bcrypt.hashSync(newPin, SALT_ROUNDS);
    getDb()
      .prepare('UPDATE users SET pin_hash = ? WHERE id = ?')
      .run(pinHash, userId);
    return { message: 'PIN berhasil disimpan.' };
  }

  /**
   * Verifikasi PIN — digunakan sebelum transfer.
   * @param {number} userId
   * @param {string} pin
   * @returns {boolean}
   */
  verifyPin(userId, pin) {
    const user = getDb()
      .prepare('SELECT pin_hash FROM users WHERE id = ?')
      .get(userId);

    if (!user || !user.pin_hash) {
      throw Object.assign(new Error('PIN belum diatur. Silakan set PIN terlebih dahulu.'), { status: 400 });
    }

    if (!bcrypt.compareSync(pin, user.pin_hash)) {
      throw Object.assign(new Error('PIN salah.'), { status: 401 });
    }
    return true;
  }

  // ── Private helpers ────────────────────────────────────────

  _getUserById(id) {
    const user = getDb()
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id);
    return user ? this._safeUser(user) : null;
  }

  /** Hapus kolom sensitif sebelum dikembalikan ke klien */
  _safeUser(user) {
    const { password_hash, pin_hash, ...safe } = user;
    return safe;
  }

  _signToken(user) {
    return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
  }
}

module.exports = new AuthService();
