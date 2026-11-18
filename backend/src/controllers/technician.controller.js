/* ==========================================================================
   controllers/technician.controller.js — Endpoint manajemen teknisi (admin)
   ========================================================================== */

const technicianService = require('../services/technician.service');
const { ok, created } = require('../utils/response');
const { asyncHandler, notFound } = require('../utils/errors');

const str = (v) => (typeof v === 'string' ? v.trim() : undefined);

/** Validasi input teknisi; `partial: true` untuk PATCH (field opsional). */
function validateTechnicianInput(body = {}, { partial = false } = {}) {
  const errors = {};
  const value = {};

  const name = str(body.name);
  if (name === undefined && !partial) errors.name = 'Nama teknisi wajib diisi.';
  else if (name !== undefined) {
    if (!name) errors.name = 'Nama teknisi wajib diisi.';
    else if (name.length > 80) errors.name = 'Nama teknisi maksimal 80 karakter.';
    else value.name = name;
  }

  const title = str(body.title);
  if (title !== undefined) {
    if (title.length > 60) errors.title = 'Gelar/panggilan maksimal 60 karakter.';
    else value.title = title;
  }

  const role = str(body.role);
  if (role === undefined && !partial) errors.role = 'Role wajib dipilih.';
  else if (role !== undefined) {
    if (!technicianService.TECHNICIAN_ROLES.includes(role)) {
      errors.role = `role harus salah satu dari: ${technicianService.TECHNICIAN_ROLES.join(', ')}.`;
    } else value.role = role;
  }

  const teamId = str(body.teamId);
  if (teamId === undefined && !partial) errors.teamId = 'Tim wajib dipilih.';
  else if (teamId !== undefined) {
    if (!teamId) errors.teamId = 'Tim wajib dipilih.';
    else if (teamId.length > 40) errors.teamId = 'ID tim tidak valid.';
    else value.teamId = teamId;
  }

  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') errors.active = 'active harus boolean.';
    else value.active = body.active;
  }

  const phone = str(body.phone);
  if (phone !== undefined) {
    if (phone.length > 30) errors.phone = 'Nomor telepon maksimal 30 karakter.';
    else value.phone = phone;
  }

  if (body.skills !== undefined) {
    if (!Array.isArray(body.skills) || body.skills.some((s) => typeof s !== 'string')) {
      errors.skills = 'skills harus berupa array teks.';
    } else {
      const cleaned = body.skills.map((s) => s.trim()).filter(Boolean).slice(0, 15);
      value.skills = cleaned;
    }
  }

  return { value, errors };
}

/** Ambil :id teknisi; bentuk tak valid diperlakukan sama dengan "tidak ada". */
function idFrom(req) {
  const id = String(req.params.id || '').trim();
  if (!id || id.length > 80) throw notFound('Teknisi tidak ditemukan.');
  return id;
}

const list = asyncHandler(async (_req, res) => {
  const technicians = await technicianService.listTechnicians();
  return ok(res, technicians, 'Daftar teknisi.', 200, { total: technicians.length });
});

const detail = asyncHandler(async (req, res) => {
  const technician = await technicianService.getTechnicianDetail(idFrom(req));
  return ok(res, technician, 'Detail teknisi.');
});

const create = asyncHandler(async (req, res) => {
  const { value, errors } = validateTechnicianInput(req.body);
  if (Object.keys(errors).length > 0) {
    const { ApiError } = require('../utils/errors');
    throw new ApiError(422, 'Data yang dikirim tidak valid.', errors);
  }
  const technician = await technicianService.createTechnician(req.user, value);
  return created(res, technician, `Teknisi ${technician.name} berhasil ditambahkan.`);
});

const update = asyncHandler(async (req, res) => {
  const id = idFrom(req);
  const { value, errors } = validateTechnicianInput(req.body, { partial: true });
  if (Object.keys(errors).length > 0) {
    const { ApiError } = require('../utils/errors');
    throw new ApiError(422, 'Data yang dikirim tidak valid.', errors);
  }
  const technician = await technicianService.updateTechnician(id, req.user, value);
  return ok(res, technician, 'Data teknisi berhasil diperbarui.');
});

const duty = asyncHandler(async (req, res) => {
  const technician = await technicianService.setDuty(idFrom(req), req.body.active === true, req.user);
  return ok(res, technician, technician.active ? 'Teknisi kembali bertugas.' : 'Teknisi dipensiunkan dari tugas.');
});

const archive = asyncHandler(async (req, res) => {
  const technician = await technicianService.archiveTechnician(idFrom(req), req.user);
  return ok(res, technician, 'Teknisi berhasil diarsipkan.');
});

const restore = asyncHandler(async (req, res) => {
  const technician = await technicianService.restoreTechnician(idFrom(req), req.user);
  return ok(res, technician, 'Teknisi berhasil dipulihkan.');
});

const remove = asyncHandler(async (req, res) => {
  const result = await technicianService.deleteTechnicianPermanently(idFrom(req));
  return ok(res, result, `Teknisi ${result.id} berhasil dihapus permanen.`);
});

module.exports = { list, detail, create, update, duty, archive, restore, remove };
