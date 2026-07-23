// ─────────────────────────────────────────────────────────────────────────────
// seeders/dashboardSeeder.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const env = require('../config/env');

const now = new Date('2026-07-21T12:00:00Z'); // Fixed anchor for dates to match prompt constraints

// Helper for random choice
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Fixed dates for leads
const getMonthDate = (monthIndex, day = rand(1, 28)) => {
  return new Date(2026, monthIndex, day, 10, 0, 0);
};

const runSeeder = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    // Get any org
    const org = await Organization.findOne();
    if (!org) {
      console.log('❌ No organization found. Please register a user first.');
      process.exit(1);
    }
    const orgId = org._id;
    const users = await User.find({ organizationId: orgId });
    const assignedUserId = users.length > 0 ? users[0]._id : null;

    console.log(`🧹 Clearing existing Dashboard data for org ${org.name}...`);
    await Lead.deleteMany({ organizationId: orgId });
    await Deal.deleteMany({ organizationId: orgId });
    await Task.deleteMany({ organizationId: orgId });

    console.log('🌱 Seeding Leads...');
    // Status: 20 New, 8 Contacted, 5 Qualified, 4 Proposal, 3 Won, 0 Lost = 40
    const statuses = [
      ...Array(20).fill('New'),
      ...Array(8).fill('Contacted'),
      ...Array(5).fill('Qualified'),
      ...Array(4).fill('Proposal'),
      ...Array(3).fill('Won'),
    ];
    // Source: Cold Outreach 8, Event 9, Social 7, Website 7, Referral 5, Other 4 = 40
    const sources = [
      ...Array(8).fill('Cold Outreach'),
      ...Array(9).fill('Event'),
      ...Array(7).fill('Social'),
      ...Array(7).fill('Website'),
      ...Array(5).fill('Referral'),
      ...Array(4).fill('Other'),
    ];

    // Dates: spread Jan - Jun 2026. Peak month Apr: 12 leads
    // Jan: 5, Feb: 6, Mar: 7, Apr: 12, May: 5, Jun: 5 = 40 leads
    const monthsDist = [
      ...Array(5).fill(0), // Jan
      ...Array(6).fill(1), // Feb
      ...Array(7).fill(2), // Mar
      ...Array(12).fill(3),// Apr
      ...Array(5).fill(4), // May
      ...Array(5).fill(5), // Jun
    ];

    const leads = [];
    let pipelineTotal = 0;

    for (let i = 0; i < 40; i++) {
      const status = statuses[i];
      const source = sources[i];
      const monthIdx = monthsDist[i];
      const createdAt = getMonthDate(monthIdx);
      
      let val = 0;
      if (status !== 'Won' && status !== 'Lost') {
        val = rand(10, 100) * 1000;
        pipelineTotal += val;
      } else if (status === 'Won') {
        val = rand(10, 50) * 1000;
      }

      leads.push({
        organizationId: orgId,
        assignedTo: assignedUserId,
        firstName: 'Lead',
        lastName: `Test ${i + 1}`,
        email: `lead${i+1}@example.com`,
        company: `Company ${i + 1}`,
        source,
        status,
        value: val,
        createdAt,
        statusChangedAt: status === 'Qualified' && i % 2 === 0 ? new Date(now.getTime() - 15 * 86400000) : createdAt,
      });
    }

    // Force pipeline total to match 4,102,000 if needed? Let's just adjust the last open lead
    const openLeads = leads.filter(l => l.status !== 'Won' && l.status !== 'Lost');
    if (openLeads.length > 0) {
       const diff = 4102000 - pipelineTotal;
       openLeads[openLeads.length - 1].value += diff;
    }

    const insertedLeads = await Lead.insertMany(leads);

    console.log('🌱 Seeding Deals...');
    // Won deals: closedAt spread across 6 months, sum ~$710,000, Weekly ~$90,000
    const thisWeekStart = new Date(now);
    const day = thisWeekStart.getUTCDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() + diffToMonday);
    thisWeekStart.setUTCHours(0,0,0,0);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

    const deals = [];
    
    // Add two won deals for this week to equal $90k
    deals.push({
      organizationId: orgId, title: 'Weekly Deal 1', stage: 'Won', value: 50000,
      closedAt: new Date(thisWeekStart.getTime() + 86400000), assignedTo: assignedUserId
    });
    deals.push({
      organizationId: orgId, title: 'Weekly Deal 2', stage: 'Won', value: 40000,
      closedAt: new Date(thisWeekStart.getTime() + 2 * 86400000), assignedTo: assignedUserId
    });
    
    // Add deals for last week to make delta +12.8%
    // (90k - lastWeek) / lastWeek = 0.128 => 90k = 1.128 * lastWeek => lastWeek = 79,787
    deals.push({
      organizationId: orgId, title: 'Last Week Deal', stage: 'Won', value: 79787,
      closedAt: new Date(lastWeekStart.getTime() + 86400000), assignedTo: assignedUserId
    });

    // Make up the rest of the $710,000 across last 6 months
    let remainingWon = 710000 - 90000 - 79787; // 540,213
    for(let i=0; i<6; i++) {
        deals.push({
          organizationId: orgId, title: `Historical Won ${i}`, stage: 'Won', value: Math.floor(remainingWon/6),
          closedAt: getMonthDate(i), assignedTo: assignedUserId
        });
    }

    // Add some pipeline deals
    for(let i=0; i<6; i++) {
      deals.push({
        organizationId: orgId, title: `Pipeline Deal ${i}`, stage: pick(['Lead', 'Qualified', 'Proposal Sent']), value: 20000,
        assignedTo: assignedUserId
      });
    }

    await Deal.insertMany(deals);

    console.log('🌱 Seeding Tasks...');
    // 10 tasks, 5 with due date in next 7 days, link to leads
    const tasks = [];
    for(let i=0; i<10; i++) {
      const isDueSoon = i < 5;
      const dueDate = isDueSoon 
        ? new Date(now.getTime() + rand(1, 6) * 86400000)
        : new Date(now.getTime() + rand(10, 30) * 86400000);

      let title = 'Follow up task';
      if (i % 3 === 0) title = 'Call with client';
      else if (i % 3 === 1) title = 'Send proposal document';
      
      tasks.push({
        organizationId: orgId,
        title: `${title} ${i+1}`,
        assignedTo: assignedUserId,
        relatedTo: insertedLeads[i]?._id,
        relatedModel: 'Lead',
        priority: pick(['High', 'Medium', 'Low']),
        status: 'Open',
        dueDate
      });
    }

    await Task.insertMany(tasks);

    console.log('✅ Seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
};

runSeeder();
