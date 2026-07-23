// ─────────────────────────────────────────────────────────────────────────────
// config/db.js — Mongoose connection with retry logic
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');
const env      = require('./env');

const MONGOOSE_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4, // Force IPv4 (fixes connection timeouts on Node 17+ with Atlas)
};
async function connectDB() {
  try {
    const conn = await mongoose.connect(env.MONGODB_URI, MONGOOSE_OPTIONS);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected');
});

module.exports = connectDB;
