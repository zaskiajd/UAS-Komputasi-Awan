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
const controller = require('../controllers/ticket.controller');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.post('/', requireRole('student'), controller.create);

router.patch('/:id/status', requireRole('admin'), controller.updateStatus);

router.get('/:id', controller.detail);
router.patch('/:id', requireRole('student'), controller.update);
router.delete('/:id', requireRole('student'), controller.remove);

module.exports = router;
