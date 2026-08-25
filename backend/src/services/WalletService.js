'use strict';
const { getDb } = require('../database/connection');

/**
 * WalletService — menangani semua operasi dompet/akun bank:
 * buat, daftar, rename, hapus, dan hitung saldo.
 */
class WalletService {
  /**
   * Mendapatkan semua dompet milik user beserta saldo terhitung.
   * @param {number} userId
   */
  getAll(userId) {
    const db = getDb();
    const wallets = db
      .prepare('SELECT * FROM wallets WHERE user_id = ? ORDER BY id ASC')
      .all(userId);

    return wallets.map(w => ({
      ...w,
      balance: this._calculateBalance(w.id),
    }));
  }

  /**
   * Membuat dompet baru.
   * @param {number} userId
   * @param {{ name, icon, color }} data
   */
  create(userId, { name, icon = '💼', color = '#2a78d6' }) {
    if (!name || !name.trim()) {
      throw Object.assign(new Error('Nama dompet wajib diisi.'), { status: 400 });
    }

    const db = getDb();

    // Batasi maksimal 10 dompet per user
    const count = db
      .prepare('SELECT COUNT(*) as c FROM wallets WHERE user_id = ?')
      .get(userId).c;
    if (count >= 10) {
      throw Object.assign(new Error('Maksimal 10 dompet per akun.'), { status: 400 });
    }

    const result = db
      .prepare('INSERT INTO wallets (user_id, name, icon, color) VALUES (?, ?, ?, ?)')
      .run(userId, name.trim(), icon, color);

    return this.getById(userId, result.lastInsertRowid);
  }

  /**
   * Mendapatkan satu dompet berdasarkan ID (validasi kepemilikan).
   * @param {number} userId
   * @param {number} walletId
   */
  getById(userId, walletId) {
    const wallet = getDb()
      .prepare('SELECT * FROM wallets WHERE id = ? AND user_id = ?')
      .get(walletId, userId);

    if (!wallet) {
      throw Object.assign(new Error('Dompet tidak ditemukan.'), { status: 404 });
    }

    return { ...wallet, balance: this._calculateBalance(walletId) };
  }

  /**
   * Mengubah nama / ikon / warna dompet.
   * @param {number} userId
   * @param {number} walletId
   * @param {{ name, icon, color }} data
   */
  update(userId, walletId, { name, icon, color }) {
    const wallet = this.getById(userId, walletId); // throws 404 jika tidak ada
    const db = getDb();

    db.prepare(
      'UPDATE wallets SET name = ?, icon = ?, color = ? WHERE id = ?'
    ).run(
      name?.trim() || wallet.name,
      icon || wallet.icon,
      color || wallet.color,
      walletId
    );

    return this.getById(userId, walletId);
  }

  /**
   * Menghapus dompet. Jika ini satu-satunya dompet, tolak.
   * @param {number} userId
   * @param {number} walletId
   */
  delete(userId, walletId) {
    const db = getDb();
    this.getById(userId, walletId); // validasi kepemilikan

    const count = db
      .prepare('SELECT COUNT(*) as c FROM wallets WHERE user_id = ?')
      .get(userId).c;
    if (count <= 1) {
      throw Object.assign(
        new Error('Tidak dapat menghapus satu-satunya dompet.'),
        { status: 400 }
      );
    }

    db.prepare('DELETE FROM wallets WHERE id = ? AND user_id = ?').run(walletId, userId);
    return { message: 'Dompet berhasil dihapus.' };
  }

  /**
   * Menghitung saldo bersih sebuah dompet dari tabel transaksi.
   * Saldo = Σ income − Σ expense + Σ transfer_masuk − Σ transfer_keluar
   */
  _calculateBalance(walletId) {
    const db = getDb();

    const income = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE wallet_id = ? AND type = 'income'"
      )
      .get(walletId).total;

    const expense = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE wallet_id = ? AND type = 'expense'"
      )
      .get(walletId).total;

    // Transfer keluar (dari dompet ini)
    const transferOut = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE wallet_id = ? AND type = 'transfer'"
      )
      .get(walletId).total;

    // Transfer masuk (ke dompet ini)
    const transferIn = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE to_wallet_id = ? AND type = 'transfer'"
      )
      .get(walletId).total;

    return income - expense - transferOut + transferIn;
  }
}

module.exports = new WalletService();
