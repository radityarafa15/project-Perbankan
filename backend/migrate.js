'use strict';
/**
 * Script migrasi data dari bank.db (Flask/SQLite lama)
 * ke smoney.db (Node.js/SQLite baru).
 *
 * Cara pakai:
 *   node migrate.js
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const OLD_DB_PATH = path.resolve(process.env.OLD_DB_PATH || '../bank.db');
const NEW_DB_PATH = path.resolve(process.env.DB_PATH || './data/smoney.db');
const SCHEMA_PATH = path.join(__dirname, 'src/database/schema.sql');

console.log('🔄 Memulai migrasi data...');
console.log(`   Sumber : ${OLD_DB_PATH}`);
console.log(`   Tujuan : ${NEW_DB_PATH}`);

if (!fs.existsSync(OLD_DB_PATH)) {
  console.error('❌ File database lama tidak ditemukan:', OLD_DB_PATH);
  process.exit(1);
}

// Pastikan folder data/ ada
const dataDir = path.dirname(NEW_DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Buka kedua database
const oldDb = new Database(OLD_DB_PATH, { readonly: true });
const newDb = new Database(NEW_DB_PATH);

newDb.pragma('foreign_keys = ON');
newDb.pragma('journal_mode = WAL');

// Buat schema baru
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
newDb.exec(schema);

// ── Migrasi Users ──────────────────────────────────────────────
const oldUsers = oldDb.prepare('SELECT * FROM users').all();
console.log(`\n👥 Ditemukan ${oldUsers.length} user untuk dimigrasikan.`);

const insertUser = newDb.prepare(
  'INSERT OR IGNORE INTO users (id, name, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertWallet = newDb.prepare(
  "INSERT OR IGNORE INTO wallets (user_id, name, icon, color, created_at) VALUES (?, ?, '💼', '#2a78d6', ?)"
);

let migratedUsers = 0;
let migratedTx = 0;
let skippedTx = 0;

const doMigration = newDb.transaction(() => {
  for (const user of oldUsers) {
    insertUser.run(
      user.id,
      user.name,
      user.username,
      user.email,
      user.password_hash,
      user.created_at || new Date().toISOString()
    );
    migratedUsers++;

    // Buat dompet default untuk setiap user
    const existing = newDb
      .prepare('SELECT id FROM wallets WHERE user_id = ?')
      .get(user.id);

    let walletId;
    if (!existing) {
      const w = insertWallet.run(user.id, 'Dompet Utama', user.created_at || new Date().toISOString());
      walletId = w.lastInsertRowid;
    } else {
      walletId = existing.id;
    }

    // ── Migrasi Transactions untuk user ini ──────────────────
    const oldTx = oldDb
      .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date ASC, id ASC')
      .all(user.id);

    const insertTx = newDb.prepare(
      `INSERT OR IGNORE INTO transactions
        (wallet_id, user_id, type, category, amount, description, transaction_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const tx of oldTx) {
      // Pastikan type valid (lama hanya income/expense)
      if (!['income', 'expense'].includes(tx.type)) { skippedTx++; continue; }

      insertTx.run(
        walletId,
        tx.user_id,
        tx.type,
        tx.category,
        tx.amount,
        tx.description,
        tx.transaction_date,
        tx.created_at || new Date().toISOString()
      );
      migratedTx++;
    }
  }
});

try {
  doMigration();
  console.log(`\n✅ Migrasi selesai!`);
  console.log(`   Users       : ${migratedUsers}`);
  console.log(`   Transaksi   : ${migratedTx}`);
  if (skippedTx > 0) console.log(`   Dilewati    : ${skippedTx} (tipe tidak dikenal)`);
  console.log(`\n📝 Catatan: Semua transaksi lama ditempatkan di "Dompet Utama".`);
  console.log(`   PIN belum diatur — user perlu set PIN baru setelah login.`);
} catch (err) {
  console.error('❌ Migrasi gagal:', err.message);
  process.exit(1);
} finally {
  oldDb.close();
  newDb.close();
}
