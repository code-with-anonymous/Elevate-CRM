// ─────────────────────────────────────────────────────────────────────────────
// config/db.js — Mongoose connection with retry logic
//
// Includes a workaround for SRV-blocking DNS resolvers. See resolveSrvFailure()
// below for the full explanation of why that is needed.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const dns      = require('node:dns');
const mongoose = require('mongoose');
const env      = require('./env');

const MONGOOSE_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4, // Force IPv4 (fixes connection timeouts on Node 17+ with Atlas)
};

// Cloudflare then Google. Both answer SRV correctly; two providers so a single
// one being unreachable isn't a hard failure.
const PUBLIC_DNS = ['1.1.1.1', '1.0.0.1', '8.8.8.8'];

/**
 * True when the connection failed because the SRV/TXT lookup for a
 * `mongodb+srv://` URI could not be answered — as opposed to bad credentials,
 * an IP not on the Atlas allowlist, or the cluster being down.
 *
 * The distinction matters because the remedy is completely different: this class
 * of failure is a local *name resolution* problem, and swapping resolvers fixes
 * it. Everything else must surface unchanged.
 *
 * Typical message: "querySrv ENODATA _mongodb._tcp.cluster0.xxxxx.mongodb.net"
 */
function resolveSrvFailure(err) {
  const syscall = String(err && err.syscall);
  const code    = String(err && err.code);
  const message = String((err && err.message) || '');

  const isSrvLookup =
    syscall === 'querySrv' ||
    syscall === 'queryTxt' ||
    /querySrv|queryTxt/.test(message);

  const isDnsFailure =
    ['ENODATA', 'ENOTFOUND', 'ESERVFAIL', 'EREFUSED', 'ETIMEOUT', 'ECONNREFUSED'].includes(code) ||
    /ENODATA|ENOTFOUND|ESERVFAIL|EREFUSED|ETIMEOUT/.test(message);

  return isSrvLookup && isDnsFailure;
}

// Mongoose emits 'disconnected' when a connection *attempt* tears down, not only
// when an established connection drops. Without this flag a failed first attempt
// prints "⚠️ MongoDB disconnected" before anything ever connected, which reads
// like a dropped link and buries the real cause below it.
let hasConnected = false;

async function attempt() {
  const conn = await mongoose.connect(env.MONGODB_URI, MONGOOSE_OPTIONS);
  hasConnected = true;
  console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  return conn;
}

async function connectDB() {
  // An explicit override wins, and skips the doomed first attempt entirely.
  if (env.DNS_SERVERS.length) {
    dns.setServers(env.DNS_SERVERS);
    console.log(`🔧 DNS resolver pinned via DNS_SERVERS: ${env.DNS_SERVERS.join(', ')}`);
  }

  try {
    return await attempt();
  } catch (err) {
    const canRetry =
      resolveSrvFailure(err) && env.DNS_SRV_FALLBACK && !env.DNS_SERVERS.length;

    if (!canRetry) {
      console.error('❌ MongoDB connection error:', err.message);
      if (resolveSrvFailure(err)) {
        console.error(
          '   The SRV lookup for your cluster was refused by the DNS resolver at ' +
            `${dns.getServers().join(', ')}.\n` +
            '   Many ISP routers answer A/TXT queries but return NODATA for SRV.\n' +
            '   Set DNS_SERVERS=1.1.1.1,8.8.8.8 in your .env to use a resolver that does.'
        );
      }
      process.exit(1);
    }

    // Only the SRV lookup is rerouted. The subsequent TCP connect still uses the
    // OS resolver (dns.lookup, which setServers does not touch) — and A records
    // for the shard hosts resolve fine on the very networks that block SRV, so
    // this stays a minimal, surgical change rather than a full DNS takeover.
    console.warn(`⚠️  SRV lookup failed on ${dns.getServers().join(', ')} — ${err.message}`);
    console.warn(`🔧 Retrying via public DNS: ${PUBLIC_DNS.join(', ')}`);
    dns.setServers(PUBLIC_DNS);

    try {
      const conn = await attempt();
      console.log('   (Your network blocks SRV records. Set DNS_SERVERS in .env to skip this retry.)');
      return conn;
    } catch (retryErr) {
      console.error('❌ MongoDB connection error after DNS fallback:', retryErr.message);
      process.exit(1);
    }
  }
}

mongoose.connection.on('disconnected', () => {
  if (hasConnected) {
    console.warn('⚠️  MongoDB disconnected');
  }
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected');
});

module.exports = connectDB;
