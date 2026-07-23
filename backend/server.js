// ─────────────────────────────────────────────────────────────────────────────
// server.js — Entry point: connect DB then start HTTP server
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config();
const env       = require('./config/env');
const connectDB = require('./config/db');
const app       = require('./app');

// Uncaught exception safety net
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION — shutting down:', err.message);
  process.exit(1);
});

async function startServer() {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log(`\n🚀 ElevateCRM API running on http://localhost:${env.PORT}`);
    console.log(`   Environment : ${env.NODE_ENV}`);
    console.log(`   Client URL  : ${env.CLIENT_URL}`);
    console.log(`   Health      : http://localhost:${env.PORT}/health\n`);
  });

  // Unhandled promise rejection
  process.on('unhandledRejection', (err) => {
    console.error('💥 UNHANDLED REJECTION — shutting down:', err.message);
    server.close(() => process.exit(1));
  });

  // Graceful shutdown on SIGTERM (Docker / Heroku)
  process.on('SIGTERM', () => {
    console.log('📴 SIGTERM received — closing server gracefully...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}

startServer();
