/* ==========================================================================
   routes/ticket.routes.js — /api/tickets
   --------------------------------------------------------------------------
   Semua endpoint wajib login. Pembatasan role:
     GET    /                  student (miliknya) | admin (semua)
     GET    /:id               student (miliknya) | admin
     POST   /                  student
     PATCH  /:id               student (miliknya, status 'review')
     DELETE /:id               student (miliknya, lihat aturan di service)
     PATCH  /:id/status        admin
   :id = id numerik ATAU kode tiket (mis. %23CC-2026-0916).
   ========================================================================== */

const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/ticket.controller');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadPhotos } = require('../middleware/upload');

const router = express.Router();

// Batasi unggahan foto per IP (anti penyalahgunaan disk/bandwidth).
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.UPLOAD_RATE_LIMIT || 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak unggahan foto. Coba lagi dalam beberapa menit.',
  },
});

router.use(authenticate);

router.get('/', controller.list);
router.post('/', requireRole('student'), controller.create);

router.post(
  '/:id/photos',
  requireRole('student'),
  uploadLimiter,
  uploadPhotos,
  controller.addPhotos
);
router.delete('/:id/photos/:photoId', requireRole('student'), controller.removePhoto);

router.patch('/:id/status', requireRole('admin'), controller.updateStatus);

router.get('/:id', controller.detail);
router.patch('/:id', requireRole('student'), controller.update);
router.delete('/:id', requireRole('student'), controller.remove);

module.exports = router;
