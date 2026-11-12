/* ==========================================================================
   controllers/auth.controller.js — Endpoint autentikasi
   ========================================================================== */

const authService = require('../services/auth.service');
const { ok, created } = require('../utils/response');
const { asyncHandler } = require('../utils/errors');
const {
  assertValid,
  validateRegister,
  validateLogin,
  validateGoogleAuth,
} = require('../utils/validate');

const register = asyncHandler(async (req, res) => {
  const { value, errors } = validateRegister(req.body);
  assertValid(errors);
  const result = await authService.register(value);
  return created(res, result, 'Registrasi berhasil.');
});

const login = asyncHandler(async (req, res) => {
  const { value, errors } = validateLogin(req.body);
  assertValid(errors);
  const result = await authService.login(value);
  return ok(res, result, 'Login berhasil.');
});

const googleLogin = asyncHandler(async (req, res) => {
  const { value, errors } = validateGoogleAuth(req.body);
  assertValid(errors);
  const result = await authService.googleAuth(value.credential);
  return ok(res, result, 'Login Google berhasil.');
});

const me = (req, res) => ok(res, authService.toPublicUser(req.user), 'Profil pengguna.');

module.exports = { register, login, googleLogin, me };
