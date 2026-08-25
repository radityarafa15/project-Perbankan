'use strict';
const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password) {
      return res.status(400).json({ error: 'Semua field wajib diisi.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password minimal 8 karakter.' });
    }
    const result = AuthService.register({ name, username, email, password });
    res.status(201).json({ message: 'Akun berhasil dibuat.', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username/email dan password wajib diisi.' });
    }
    const result = AuthService.login({ usernameOrEmail, password });
    res.json({ message: 'Login berhasil.', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/auth/me — mendapatkan profil user yang sedang login
router.get('/me', authenticate, (req, res) => {
  try {
    const user = AuthService.getProfile(req.user.id);
    res.json({ user });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/auth/pin — set atau ganti PIN
router.post('/pin', authenticate, (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN wajib diisi.' });
    const result = AuthService.setPin(req.user.id, String(pin));
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
