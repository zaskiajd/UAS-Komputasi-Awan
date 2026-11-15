/* ==========================================================================
   controllers/asset.controller.js — Endpoint inventaris aset (admin)
   ========================================================================== */

const assetService = require('../services/asset.service');
const { ok, created } = require('../utils/response');
const { asyncHandler, notFound } = require('../utils/errors');
const {
  ASSET_CONDITIONS,
  assertValid,
  validateAssetInput,
  parseAssetRef,
} = require('../utils/validate-asset');

const STATUS_FILTERS = ['active', 'archived', 'all'];

/** Ambil :id → ID aset; ID tak valid diperlakukan sama dengan "tidak ada". */
function idFrom(req) {
  const id = parseAssetRef(req.params.id);
  if (!id) throw notFound('Aset tidak ditemukan.');
  return id;
}

const list = asyncHandler(async (req, res) => {
  const errors = {};
  const { status, condition, category, q } = req.query;
  const limit = req.query.limit === undefined ? 200 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);

  if (status !== undefined && !STATUS_FILTERS.includes(status)) {
    errors.status = `status harus salah satu dari: ${STATUS_FILTERS.join(', ')}.`;
  }
  if (condition !== undefined && !ASSET_CONDITIONS.includes(condition)) {
    errors.condition = `condition harus salah satu dari: ${ASSET_CONDITIONS.join(', ')}.`;
  }
  if (category !== undefined && !/^[a-z0-9_-]{1,40}$/.test(String(category))) {
    errors.category = 'Kode kategori tidak valid.';
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    errors.limit = 'limit harus bilangan bulat 1–500.';
  }
  if (!Number.isInteger(offset) || offset < 0) {
    errors.offset = 'offset harus bilangan bulat ≥ 0.';
  }
  assertValid(errors);

  const search = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  const { items, total } = await assetService.listAssets({
    status: status || 'active',
    condition,
    category,
    q: search || undefined,
    limit,
    offset,
  });
  return ok(res, items, 'Daftar aset.', 200, { total, limit, offset });
});

const detail = asyncHandler(async (req, res) => {
  const asset = await assetService.getAssetDetail(idFrom(req));
  return ok(res, asset, 'Detail aset.');
});

const create = asyncHandler(async (req, res) => {
  const { value, errors } = validateAssetInput(req.body);
  assertValid(errors);
  const asset = await assetService.createAsset(req.user, value);
  return created(res, asset, `Aset ${asset.id} berhasil ditambahkan.`);
});

const update = asyncHandler(async (req, res) => {
  const id = idFrom(req);
  const { value, errors } = validateAssetInput(req.body, { partial: true });
  assertValid(errors);
  const asset = await assetService.updateAsset(id, req.user, value);
  return ok(res, asset, 'Data aset berhasil diperbarui.');
});

const service = asyncHandler(async (req, res) => {
  const asset = await assetService.markServiced(idFrom(req), req.user);
  return ok(res, asset, 'Servis aset ditandai selesai.');
});

const archive = asyncHandler(async (req, res) => {
  const asset = await assetService.archiveAsset(idFrom(req), req.user);
  return ok(res, asset, 'Aset berhasil diarsipkan.');
});

const restore = asyncHandler(async (req, res) => {
  const asset = await assetService.restoreAsset(idFrom(req), req.user);
  return ok(res, asset, 'Aset berhasil dipulihkan.');
});

const remove = asyncHandler(async (req, res) => {
  const result = await assetService.deleteAssetPermanently(idFrom(req));
  return ok(res, result, `Aset ${result.id} berhasil dihapus permanen.`);
});

module.exports = { list, detail, create, update, service, archive, restore, remove };
