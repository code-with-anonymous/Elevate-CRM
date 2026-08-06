// ─────────────────────────────────────────────────────────────────────────────
// seeders/demoSeeder.js
// Realistic demo data for validating the UI end to end.
//
//   node seeders/demoSeeder.js --email=you@x.com  # append demo data (safe)
//   node seeders/demoSeeder.js --clean            # undo the last seed run only
//   node seeders/demoSeeder.js --reset            # wipe ALL org CRM data first
//
// Pass --email or it targets the OLDEST organization in the database, which on
// a multi-tenant dev DB is very unlikely to be yours. (The older
// dashboardSeeder.js has exactly this bug — it dumped 41 leads into the wrong
// org.)
//
// Design intent: this is not filler. Every record exists to put a specific
// piece of UI into a specific state —
//   · every Lead status and source, so each StatusBadge tone renders
//   · deal values from $4.5k to $1.2M, so the Leads value-weight ramp has
//     something to ramp across
//   · long names/companies, to prove truncation instead of blowing out rows
//   · contacts with 0, 1, 2 and 5 tags, to hit the TagList "+N" overflow
//   · tasks that are overdue / today / tomorrow / +3d / future / done, to
//     exercise every branch of formatRelativeDate()
//   · 11 deals in one pipeline column, to trip the WIP warning at 10
//   · four currencies, to prove the per-currency formatter cache
//   · some records unassigned or untagged, to hit the empty fallbacks
//
// Dates are computed from "now" at run time, never a fixed anchor — a
// hardcoded anchor makes relative dates ("Tomorrow") wrong the next week.
//
// NEVER touches Users, Organizations, or any auth collection.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

const User = require('../models/User');
const Organization = require('../models/Organization');
const Lead = require('../models/Lead');
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const env = require('../config/env');

// ── CLI args ──────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const CLEAN = args.includes('--clean');
const EMAIL = (args.find((a) => a.startsWith('--email=')) || '').split('=')[1] || null;

// Every id this seeder inserts is recorded here, so --clean can remove exactly
// what it created and nothing a human typed in. --reset is the blunt fallback.
const MANIFEST = path.join(__dirname, '.last-seed.json');

function writeManifest(orgId, ids) {
  fs.writeFileSync(
    MANIFEST,
    JSON.stringify({ orgId: String(orgId), seededAt: new Date().toISOString(), ids }, null, 2)
  );
}

async function cleanFromManifest(models) {
  if (!fs.existsSync(MANIFEST)) {
    console.error('✖ No .last-seed.json manifest found — nothing to clean.');
    console.error('  (Use --reset to wipe the org\'s CRM data instead, which also removes real records.)');
    process.exit(1);
  }
  const { ids, seededAt } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  console.log(`Removing the seed run from ${seededAt}…`);
  for (const [name, Model] of Object.entries(models)) {
    const list = ids[name] || [];
    if (!list.length) continue;
    const { deletedCount } = await Model.deleteMany({ _id: { $in: list } });
    console.log(`  ✔ removed ${deletedCount} ${name}`);
  }
  fs.unlinkSync(MANIFEST);
  console.log('✔ Clean complete. Records you created by hand were not touched.');
}

// ── Date helpers (all relative to run time) ───────────────────────────────────

const NOW = new Date();
const DAY = 86400000;

const daysFromNow = (n, hour = 10) => {
  const d = new Date(NOW.getTime() + n * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Start of the current ISO week (Monday 00:00) — matches the dashboard's
 *  weekly-revenue aggregation window. */
function startOfWeek(ref = NOW) {
  const d = new Date(ref);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Nth day of a month in the current year. */
const monthDate = (monthIdx, day) =>
  new Date(NOW.getFullYear(), monthIdx, day, 11, 0, 0);

const THIS_WEEK = startOfWeek();
const LAST_WEEK = new Date(THIS_WEEK.getTime() - 7 * DAY);

// ── Source material ───────────────────────────────────────────────────────────
// Deliberately mixed name lengths and initials so the hashed avatar palette
// spreads across all eight slots instead of clustering.

const PEOPLE = [
  ['Amara', 'Okonkwo', 'Northwind Logistics'],
  ['Bjorn', 'Kristiansen', 'Meridian Health Group'],
  ['Chidi', 'Balogun', 'Lumen'],
  ['Priya', 'Raghunathan', 'Sundara Textiles International'],
  ['Tomás', 'Herrera', 'Castellan Foods'],
  ['Wen', 'Li', 'Orbit'],
  ['Fatima', 'Al-Rashid', 'Gulf Maritime Holdings'],
  ['Sasha', 'Petrov', 'Volta Energy Systems'],
  ['Marcus', 'Delacroix-Whitfield', 'Ashworth & Pyne Advisory'],
  ['Yuki', 'Tanaka', 'Kaisei Robotics'],
  ['Nadia', 'Haddad', 'Cedar Point Media'],
  ['Oliver', 'Ashby', 'Brightwater Utilities'],
  ['Ines', 'Moreau', 'Atelier Nord'],
  ['Rajesh', 'Venkataraman', 'Trivandrum Analytics Corporation'],
  ['Grace', 'Mwangi', 'Savannah Fintech'],
  ['Lukas', 'Novak', 'Prague Systems'],
  ['Zainab', 'Bello', 'Harmattan Logistics'],
  ['Elena', 'Vasquez', 'Puerto Verde Shipping'],
  ['Kwame', 'Asante', 'Accra Digital'],
  ['Hannah', 'Lindqvist', 'Nordkap Marine'],
  ['Diego', 'Fernández', 'Andes Mining Cooperative'],
  ['Mei', 'Chen', 'Silk Road Freight'],
  ['Aleksandr', 'Volkov', 'Ural Steel Partners'],
  ['Sofia', 'Papadopoulos', 'Aegean Renewables'],
];

const SOURCES = ['Cold Outreach', 'Event', 'Social', 'Website', 'Referral', 'Other'];
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];
const DEAL_STAGES = ['Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'];

/**
 * Spread `count` leads over Jan..currentMonth with one unambiguous peak.
 *
 * This has to be computed, not hardcoded: the dashboard picks the peak with a
 * first-past-the-post max, so any tie silently highlights the earlier month.
 * It also has to adapt to the month the seeder happens to run in.
 *
 * Returns an array of length (currentMonth + 1), summing exactly to `count`.
 */
function buildMonthPlan(count, currentMonth) {
  const months = currentMonth + 1;
  const peak = Math.max(1, Math.floor(months / 2));
  const base = Math.floor(count / months);
  const plan = new Array(months).fill(base);

  let remaining = count - base * months;

  // The peak needs clear daylight over its neighbours, or the highlighted bar
  // and the "+N%" growth figure look arbitrary.
  const boost = Math.max(2, Math.ceil(base * 0.8));
  plan[peak] += boost;
  remaining -= boost;

  for (let i = 0; remaining > 0; i++) {
    const t = i % months;
    if (t !== peak) {
      plan[t]++;
      remaining--;
    }
  }
  for (let i = 0; remaining < 0; i++) {
    const t = i % months;
    if (t !== peak && plan[t] > 1) {
      plan[t]--;
      remaining++;
    }
  }
  return plan;
}

// ── Seeder ────────────────────────────────────────────────────────────────────

async function run() {
  const uri = env.MONGODB_URI;
  if (!uri) {
    console.error('✖ MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`✔ Connected to MongoDB (${mongoose.connection.name})`);

  if (CLEAN) {
    await cleanFromManifest({ leads: Lead, contacts: Contact, deals: Deal, tasks: Task });
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── Resolve target organization ────────────────────────────────────────────
  let org;
  if (EMAIL) {
    const user = await User.findOne({ email: EMAIL.toLowerCase() });
    if (!user) {
      console.error(`✖ No user found with email ${EMAIL}`);
      process.exit(1);
    }
    org = await Organization.findById(user.organizationId);
  } else {
    org = await Organization.findOne().sort({ createdAt: 1 });
  }

  if (!org) {
    console.error('✖ No organization found. Register a user in the app first, then re-run.');
    process.exit(1);
  }

  const orgId = org._id;
  const users = await User.find({ organizationId: orgId }).select('_id firstName lastName');

  if (users.length === 0) {
    console.error('✖ No users in this organization. Register one first.');
    process.exit(1);
  }

  console.log(`✔ Organization: ${org.name}  (${users.length} user${users.length === 1 ? '' : 's'})`);

  // Round-robin owners; index -1 means "leave unassigned" so the UI's
  // Unassigned fallback gets exercised too.
  const owner = (i) => (i % 7 === 6 ? null : users[i % users.length]._id);

  // ── Reset (opt-in only) ────────────────────────────────────────────────────
  if (RESET) {
    const counts = {
      leads: await Lead.countDocuments({ organizationId: orgId }),
      contacts: await Contact.countDocuments({ organizationId: orgId }),
      deals: await Deal.countDocuments({ organizationId: orgId }),
      tasks: await Task.countDocuments({ organizationId: orgId }),
    };
    console.log(
      `⚠ --reset: deleting ${counts.leads} leads, ${counts.contacts} contacts, ` +
        `${counts.deals} deals, ${counts.tasks} tasks for this org.`
    );
    await Promise.all([
      Lead.deleteMany({ organizationId: orgId }),
      Contact.deleteMany({ organizationId: orgId }),
      Deal.deleteMany({ organizationId: orgId }),
      Task.deleteMany({ organizationId: orgId }),
    ]);
    console.log('✔ Cleared. Users and organizations untouched.');
  }

  // ── Leads ──────────────────────────────────────────────────────────────────
  // Value ladder from 4.5k to 1.2M — the Leads table weights each row against
  // the largest value on its page, so a wide spread is what makes that visible.
  const VALUES = [
    4500, 8200, 12000, 18500, 24000, 31000, 42500, 55000, 68000, 74500, 88000,
    96000, 110000, 135000, 162000, 190000, 225000, 268000, 310000, 385000,
    440000, 610000, 875000, 1200000,
  ];

  // Flatten the month plan into one month index per lead
  const monthPlan = buildMonthPlan(PEOPLE.length, NOW.getMonth());
  const monthSlots = monthPlan.flatMap((n, monthIdx) => Array(n).fill(monthIdx));

  const leadDocs = [];

  for (let i = 0; i < PEOPLE.length; i++) {
    const [firstName, lastName, company] = PEOPLE[i];
    const createdAt = monthDate(monthSlots[i], 2 + ((i * 3) % 26));
    const status = LEAD_STATUSES[i % LEAD_STATUSES.length];

    leadDocs.push({
      organizationId: orgId,
      assignedTo: owner(i),
      firstName,
      lastName,
      email: `${firstName}.${lastName}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z.]/g, '') + '@' +
        company.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) + '.com',
      phone: `+1 (${200 + (i % 700)}) ${100 + (i % 900)}-${1000 + ((i * 37) % 9000)}`,
      company,
      source: SOURCES[i % SOURCES.length],
      status,
      value: VALUES[i % VALUES.length],
      notes: i % 4 === 0 ? 'Introduced at the Q2 partner summit. Wants a security review before signing.' : null,
      tags: i % 3 === 0 ? ['enterprise'] : [],
      createdAt,
      updatedAt: createdAt,
      statusChangedAt: createdAt,
      lastContactedAt: status === 'New' ? null : daysFromNow(-(i % 20) - 1),
    });
  }

  const leads = await Lead.insertMany(leadDocs);
  console.log(`✔ ${leads.length} leads`);

  // ── Deals ──────────────────────────────────────────────────────────────────
  const dealDocs = [];

  // 11 in "Lead" — one over the WIP_THRESHOLD of 10, so the amber warning shows
  for (let i = 0; i < 11; i++) {
    dealDocs.push({
      organizationId: orgId,
      leadId: leads[i % leads.length]._id,
      assignedTo: owner(i),
      title: `${leads[i % leads.length].company} — platform rollout`,
      value: 15000 + i * 7500,
      stage: 'Lead',
      currency: 'USD',
      expectedCloseDate: daysFromNow(20 + i * 3),
    });
  }

  // Remaining open stages, with mixed currencies
  const OPEN_SPREAD = [
    ['Qualified', 5, 'USD'],
    ['Proposal Sent', 4, 'EUR'],
    ['Negotiation', 3, 'GBP'],
  ];
  let d = 11;
  for (const [stage, count, currency] of OPEN_SPREAD) {
    for (let i = 0; i < count; i++, d++) {
      const lead = leads[d % leads.length];
      dealDocs.push({
        organizationId: orgId,
        leadId: lead._id,
        assignedTo: owner(d),
        title: `${lead.company} — ${stage === 'Negotiation' ? 'renewal' : 'annual licence'}`,
        value: 40000 + i * 22000,
        stage,
        currency,
        expectedCloseDate: daysFromNow(10 + i * 5),
      });
    }
  }

  // Won this week and last week — these two windows are exactly what the
  // dashboard's weekly-revenue delta compares, so the card shows a real number.
  const wonThisWeek = [62000, 48500, 31000];
  wonThisWeek.forEach((value, i) => {
    dealDocs.push({
      organizationId: orgId,
      assignedTo: owner(i),
      title: `${leads[i].company} — signed`,
      value,
      stage: 'Won',
      currency: 'USD',
      closedAt: new Date(THIS_WEEK.getTime() + (i + 1) * DAY),
      expectedCloseDate: new Date(THIS_WEEK.getTime() + (i + 1) * DAY),
    });
  });

  const wonLastWeek = [55000, 41000];
  wonLastWeek.forEach((value, i) => {
    dealDocs.push({
      organizationId: orgId,
      assignedTo: owner(i + 3),
      title: `${leads[i + 3].company} — signed`,
      value,
      stage: 'Won',
      currency: 'USD',
      closedAt: new Date(LAST_WEEK.getTime() + (i + 2) * DAY),
      expectedCloseDate: new Date(LAST_WEEK.getTime() + (i + 2) * DAY),
    });
  });

  // Historical wins across the year — drives the Revenue Goal area trend.
  // Stops BEFORE the current month on purpose: the weekly-revenue aggregation
  // filters on `closedAt >= startOfWeek` with no upper bound, so a win dated
  // later this month would silently land in "this week" and inflate the card.
  const currentMonth = NOW.getMonth();
  for (let m = 0; m < currentMonth; m++) {
    dealDocs.push({
      organizationId: orgId,
      assignedTo: owner(m),
      title: `${leads[(m * 2) % leads.length].company} — expansion`,
      value: 45000 + m * 12000,
      stage: 'Won',
      currency: 'USD',
      closedAt: monthDate(m, 14),
      expectedCloseDate: monthDate(m, 14),
    });
  }

  // A couple of losses so the Lost column isn't empty
  for (let i = 0; i < 2; i++) {
    dealDocs.push({
      organizationId: orgId,
      assignedTo: owner(i),
      title: `${leads[leads.length - 1 - i].company} — pilot`,
      value: 28000 + i * 9000,
      stage: 'Lost',
      currency: 'CAD',
      closedAt: daysFromNow(-(12 + i * 6)),
    });
  }

  // insertMany skips pre-save hooks, and closedAt is set explicitly above, so
  // the Won/Lost stamps are already correct.
  const deals = await Deal.insertMany(dealDocs);
  console.log(`✔ ${deals.length} deals`);

  // ── Contacts ───────────────────────────────────────────────────────────────
  const TAG_SETS = [
    [],
    ['VIP'],
    ['Key Account', 'Renewal'],
    ['Partner', 'Technical', 'Champion', 'Exec Sponsor', 'Procurement'], // trips +N
    ['Champion'],
    ['Reseller', 'EMEA'],
  ];
  const JOB_TITLES = [
    'Chief Technology Officer',
    'Head of Procurement',
    'VP Engineering',
    'Operations Director',
    'Founder',
    'Director of Revenue Operations',
    'Finance Lead',
  ];
  const CONTACT_STATUS = ['active', 'active', 'active', 'inactive', 'churned'];

  const wonDeals = deals.filter((x) => x.stage === 'Won');

  const contactDocs = PEOPLE.slice(0, 16).map(([firstName, lastName, company], i) => {
    // Roughly half are linked back to a lead/deal so the "Converted" badge
    // appears on some rows and not others.
    const converted = i % 2 === 0;
    return {
      organizationId: orgId,
      leadId: converted ? leads[i % leads.length]._id : null,
      dealId: converted && wonDeals[i % wonDeals.length] ? wonDeals[i % wonDeals.length]._id : null,
      assignedTo: owner(i),
      firstName,
      lastName,
      email: `${firstName}.${lastName}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z.]/g, '') + '@' +
        company.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) + '.com',
      phone: i % 5 === 4 ? null : `+44 20 ${7000 + i} ${1000 + i * 7}`,
      company,
      jobTitle: i % 6 === 5 ? null : JOB_TITLES[i % JOB_TITLES.length],
      status: CONTACT_STATUS[i % CONTACT_STATUS.length],
      tags: TAG_SETS[i % TAG_SETS.length],
      notes: i % 3 === 0 ? 'Prefers email over calls. Timezone CET.' : '',
      createdAt: daysFromNow(-(i * 4 + 3)),
    };
  });

  const contacts = await Contact.insertMany(contactDocs);
  console.log(`✔ ${contacts.length} contacts`);

  // ── Tasks ──────────────────────────────────────────────────────────────────
  // Offsets chosen to hit every branch of formatRelativeDate():
  // overdue, yesterday, today, tomorrow, "In N days", and absolute fallback.
  const TASKS = [
    ['Chase signed MSA before quarter close', 'High', 'Open', -9],
    ['Security questionnaire is late', 'High', 'Open', -3],
    ['Send revised pricing sheet', 'Medium', 'Open', -1],
    ['Kickoff call with procurement', 'High', 'In Progress', 0],
    ['Prepare mutual action plan', 'Medium', 'Open', 0],
    ['Demo: reporting module', 'High', 'Open', 1],
    ['Follow up on legal redlines', 'Medium', 'In Progress', 2],
    ['Share implementation timeline', 'Low', 'Open', 3],
    ['Quarterly business review', 'Medium', 'Open', 5],
    ['Renewal forecast check-in', 'Low', 'Open', 12],
    ['Draft expansion proposal', 'Medium', 'Open', 26],
    ['Onboarding handover to CS', 'Low', 'Open', 41],
    ['Archive closed-lost notes', 'Low', 'Done', -14],
    ['Send welcome pack', 'Medium', 'Done', -6],
    ['Confirm invoice details', 'High', 'Done', -2],
  ];

  const taskDocs = TASKS.map(([title, priority, status, offset], i) => {
    const related = leads[i % leads.length];
    return {
      organizationId: orgId,
      title,
      description:
        i % 3 === 0
          ? `Linked to ${related.company}. Blocking the next stage until resolved.`
          : null,
      assignedTo: owner(i),
      relatedTo: related._id,
      relatedModel: 'Lead',
      priority,
      status,
      dueDate: daysFromNow(offset, 14),
      completedAt: status === 'Done' ? daysFromNow(offset, 16) : null,
      createdAt: daysFromNow(offset - 7, 9),
    };
  });

  const tasks = await Task.insertMany(taskDocs);
  console.log(`✔ ${tasks.length} tasks`);

  writeManifest(orgId, {
    leads: leads.map((x) => String(x._id)),
    contacts: contacts.map((x) => String(x._id)),
    deals: deals.map((x) => String(x._id)),
    tasks: tasks.map((x) => String(x._id)),
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  // Read the numbers back through the real dashboard aggregations rather than
  // recomputing them here. A summary derived from the seeder's own arithmetic
  // will happily report a figure the app never shows.
  const dashboard = require('../services/dashboard.service');
  const range = { from: '', to: '' };
  const [stats, chart] = await Promise.all([
    dashboard.getStats(orgId, range),
    dashboard.getPipelineChart(orgId, 'monthly', range),
  ]);

  const money = (n) => '$' + Number(n || 0).toLocaleString();
  const weekDelta = stats.weeklyRevenue.delta;

  console.log('\n─── What the dashboard will actually show ───');
  console.log(`Pipeline value      ${money(stats.pipelineValue)}`);
  console.log(
    `Weekly revenue      ${money(stats.weeklyRevenue.amount)}  ` +
      `(${weekDelta >= 0 ? '+' : ''}${weekDelta}% vs last week)`
  );
  console.log(`Conversion          ${stats.conversion.rate}%  ·  ${stats.conversion.totalLeads} leads  ·  ${stats.conversion.openTasks} open tasks`);
  console.log(`Pipeline chart      peak ${chart.peakMonth} (+${chart.peakGrowth}%)`);
  console.log(`Pipeline board      "Lead" column holds 11 deals → WIP warning`);
  console.log(`Tasks               3 overdue · 2 due today · 1 tomorrow · 3 done`);
  console.log(`Contacts            8 of 16 converted; one has 5 tags → "+2" overflow`);
  console.log('\n✔ Done.  Undo with:  node seeders/demoSeeder.js --clean\n');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('✖ Seeding failed:', err.message);
  if (err.errors) {
    Object.entries(err.errors).forEach(([k, v]) => console.error(`   ${k}: ${v.message}`));
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
