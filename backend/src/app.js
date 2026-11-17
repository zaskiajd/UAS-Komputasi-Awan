/* ==========================================================================
   app.js — Perakitan aplikasi Express (tanpa listen, agar mudah diuji)
   ========================================================================== */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('./config/db'); // memastikan .env termuat & DATABASE_URL tervalidasi
const { CORS_ORIGINS, isProduction, NODE_ENV, UPLOAD_DIR } = require('./config/env');
const { ensureUploadDir } = require('./utils/uploads');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  ensureUploadDir();

  // Di balik reverse proxy PaaS (Render/Railway/dll) IP klien ada di X-Forwarded-For.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // Tanpa header Origin = curl/Postman/server-to-server → izinkan.
        if (!origin) return callback(null, true);
        if (CORS_ORIGINS.includes(origin)) return callback(null, true);
        // Development tanpa CORS_ORIGIN: izinkan semua agar mudah diuji lokal.
        if (!isProduction && CORS_ORIGINS.length === 0) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    })
  );

  // Foto pengaduan disajikan publik (nama UUID tidak dapat ditebak).
  // CORP cross-origin agar frontend dev di :8000 dapat memuat gambar dari :3000.
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      dotfiles: 'deny',
      index: false,
      redirect: false,
      fallthrough: true,
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    })
  );

  app.use(express.json({ limit: '100kb' }));

  if (NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
      });
      next();
    });
  }

  app.get('/', (_req, res) => {
    res.json({ success: true, data: { name: 'CampusCare API', docs: '/api/health' }, message: 'OK' });
  });

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
