/* ==========================================================================
   routes/auth.routes.js — /api/auth
   ========================================================================== */

const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Batasi percobaan login/registrasi per IP (anti brute-force).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 50),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
  },
});

router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
