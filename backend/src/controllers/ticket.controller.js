/* ==========================================================================
   controllers/ticket.controller.js — Endpoint pengaduan
   ========================================================================== */

const ticketService = require('../services/ticket.service');
const { ok, created } = require('../utils/response');
const { asyncHandler, notFound } = require('../utils/errors');
const {
  STATUSES,
  PRIORITIES,
  assertValid,
  validateTicketInput,
  validateStatusUpdate,
  parseTicketRef,
} = require('../utils/validate');

/** Ambil :id → ref terstruktur; id tak valid diperlakukan sama dengan "tidak ada". */
function refFrom(req) {
  const ref = parseTicketRef(req.params.id);
  if (!ref) throw notFound('Pengaduan tidak ditemukan.');
  return ref;
}

const list = asyncHandler(async (req, res) => {
  const errors = {};
  const { status, category, priority, q } = req.query;
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);

  if (status !== undefined && !STATUSES.includes(status)) {
    errors.status = `Status harus salah satu dari: ${STATUSES.join(', ')}.`;
  }
  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    errors.priority = `Prioritas harus salah satu dari: ${PRIORITIES.join(', ')}.`;
  }
  if (category !== undefined && !/^[a-z0-9_-]{1,40}$/.test(String(category))) {
    errors.category = 'Kode kategori tidak valid.';
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.limit = 'limit harus bilangan bulat 1–100.';
  }
  if (!Number.isInteger(offset) || offset < 0) {
    errors.offset = 'offset harus bilangan bulat ≥ 0.';
  }
  assertValid(errors);

  const search = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  const { items, total } = await ticketService.listTickets(req.user, {
    status,
    category,
    priority,
    q: search || undefined,
    limit,
    offset,
  });
  return ok(res, items, 'Daftar pengaduan.', 200, { total, limit, offset });
});

const detail = asyncHandler(async (req, res) => {
  const ticket = await ticketService.getTicketDetail(refFrom(req), req.user);
  return ok(res, ticket, 'Detail pengaduan.');
});

const create = asyncHandler(async (req, res) => {
  const { value, errors } = validateTicketInput(req.body);
  assertValid(errors);
  const ticket = await ticketService.createTicket(req.user, value);
  return created(res, ticket, `Pengaduan ${ticket.id} berhasil dikirim.`);
});

const update = asyncHandler(async (req, res) => {
  const ref = refFrom(req);
  const { value, errors } = validateTicketInput(req.body, { partial: true });
  assertValid(errors);
  const ticket = await ticketService.updateOwnTicket(ref, req.user, value);
  return ok(res, ticket, 'Pengaduan berhasil diperbarui.');
});

const updateStatus = asyncHandler(async (req, res) => {
  const ref = refFrom(req);
  const { value, errors } = validateStatusUpdate(req.body);
  assertValid(errors);
  const ticket = await ticketService.updateTicketStatus(ref, req.user, value);
  return ok(res, ticket, `Status pengaduan diubah menjadi '${ticket.status}'.`);
});

const remove = asyncHandler(async (req, res) => {
  const result = await ticketService.deleteOwnTicket(refFrom(req), req.user);
  const message =
    result.mode === 'cancelled'
      ? `Pengaduan ${result.ticketCode} dibatalkan dan dihapus.`
      : `Pengaduan ${result.ticketCode} dihapus dari riwayat Anda.`;
  return ok(res, result, message);
});

module.exports = { list, detail, create, update, updateStatus, remove };
