// ─────────────────────────────────────────────────────────────────────────────
// app.js — Express application setup with all security middleware
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const morgan       = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp           = require('hpp');

const corsOptions    = require('./config/cors');
const env            = require('./config/env');
const { generalLimiter } = require('./middleware/rateLimiter');
const errorHandler   = require('./middleware/errorHandler');
const authRoutes      = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const leadsRoutes     = require('./routes/leads.routes');
const dealsRoutes     = require('./routes/deals.routes');
const contactsRoutes  = require('./routes/contacts.routes');
const tasksRoutes     = require('./routes/tasks.routes');

const app = express();

// ── Security headers ───────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // pre-flight

// ── Logging ────────────────────────────────────────────────────────────────────
if (env.IS_DEV) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ── Body parsers ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ── Security middleware ────────────────────────────────────────────────────────
app.use(mongoSanitize());  // prevent NoSQL injection
app.use(hpp());            // prevent HTTP parameter pollution

// ── Rate limiting ──────────────────────────────────────────────────────────────
app.use('/api', generalLimiter);

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status:    'ok',
    service:   'ElevateCRM API',
    timestamp: new Date().toISOString(),
    env:       env.NODE_ENV,
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads',    leadsRoutes);
app.use('/api/deals',    dealsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/tasks',    tasksRoutes);

// ── 404 handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    code:    'NOT_FOUND',
  });
});

// ── Global error handler ───────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
