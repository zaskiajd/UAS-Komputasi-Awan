/* ==========================================================================
   routes/asset.routes.js — /api/assets (khusus admin)
   ========================================================================== */

const express = require('express');
const controller = require('../controllers/asset.controller');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', controller.list);
router.post('/', controller.create);

router.post('/:id/service', controller.service);
router.post('/:id/archive', controller.archive);
router.post('/:id/restore', controller.restore);

router.get('/:id', controller.detail);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
