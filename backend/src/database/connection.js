'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = path.resolve(process.env.DB_PATH || './data/smoney.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Pastikan folder data/ ada
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/** @type {Database.Database} */
let _db = null;

/**
 * Mendapatkan instance database SQLite.
 * Koneksi dibuat sekali saja (singleton pattern).
 */
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH, {
      verbose: process.env.NODE_ENV === 'development' ? null : null,
    });
    // Aktifkan foreign keys & WAL mode untuk performa
    _db.pragma('foreign_keys = ON');
    _db.pragma('journal_mode = WAL');

    // Jalankan schema jika tabel belum ada
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    _db.exec(schema);
    console.log(`✅ Database siap: ${DB_PATH}`);
  }
  return _db;
}

/**
 * Menutup koneksi database (untuk graceful shutdown).
 */
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
    console.log('🔒 Database ditutup.');
  }
}

module.exports = { getDb, closeDb };
