// ─────────────────────────────────────────────────────────────────────────────
// services/email.service.js — Nodemailer + Brevo SMTP transporter
// Falls back to console logging in development when SMTP vars are not set
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const nodemailer = require('nodemailer');
const env        = require('../config/env');

// ── Transporter setup ─────────────────────────────────────────────────────────

/**
 * Returns true only when all four SMTP credentials are present.
 */
const hasSmtpConfig = () =>
  Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);

let transporter;

if (hasSmtpConfig()) {
  // Production: Brevo SMTP via Nodemailer
  transporter = nodemailer.createTransport({
    host:   env.SMTP_HOST,
    port:   Number(env.SMTP_PORT),
    secure: false, // STARTTLS on port 587
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  // Verify SMTP connection at startup (non-blocking — errors are logged, not thrown)
  transporter.verify((err) => {
    if (err) {
      console.error('❌ SMTP connection failed:', err.message);
    } else {
      console.log('✅ Brevo SMTP connected successfully');
    }
  });
} else {
  // Development fallback: log emails to the console instead of sending them
  transporter = {
    sendMail: async (options) => {
      console.log('\n📧 ── DEV EMAIL ─────────────────────────────');
      console.log(`   To:      ${options.to}`);
      console.log(`   Subject: ${options.subject}`);
      if (options.text) console.log(`   Text:\n${options.text}`);
      console.log('────────────────────────────────────────────\n');
      return { messageId: `dev-${Date.now()}` };
    },
  };
  console.log('📧 Email: Development mode — emails logged to console (SMTP vars not set)');
}

// ── Shared HTML wrapper ───────────────────────────────────────────────────────

function emailWrapper(content, title) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Inter,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">⚡ ElevateCRM</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              © ${new Date().getFullYear()} ElevateCRM. All rights reserved.<br/>
              <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(text, url) {
  return `<a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;margin:24px 0;">${text}</a>`;
}

// ── Email templates ───────────────────────────────────────────────────────────

async function sendVerificationEmail(email, token) {
  console.log("Mail Sent: ", email)
  const verifyUrl = `${env.CLIENT_URL}/verify-email?token=${token}`;
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">Verify your email</h2>
    <p style="color:#6b7280;margin:0 0 24px;">Thanks for signing up for ElevateCRM! Click the button below to verify your email address. This link expires in <strong>24 hours</strong>.</p>
    <div style="text-align:center;">${button('Verify Email', verifyUrl)}</div>
    <p style="color:#9ca3af;font-size:13px;margin:24px 0 0;">Or copy this URL:<br/><a href="${verifyUrl}" style="color:#4f46e5;word-break:break-all;">${verifyUrl}</a></p>
  `, 'Verify your email – ElevateCRM');

  const mail_info = await transporter.sendMail({
    from:    `"ElevateCRM" <${env.EMAIL_FROM}>`,
    to:      email,
    subject: 'Verify your email address – ElevateCRM',
    html,
    text:    `Verify your email: ${verifyUrl}`,
  });
  console.log('✅ Email sent:', mail_info);
}

async function sendPasswordResetEmail(email, token) {
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">Reset your password</h2>
    <p style="color:#6b7280;margin:0 0 24px;">We received a request to reset the password for your ElevateCRM account. Click the button below — this link expires in <strong>1 hour</strong>.</p>
    <div style="text-align:center;">${button('Reset Password', resetUrl)}</div>
    <p style="color:#9ca3af;font-size:13px;margin:24px 0 0;">If you didn't request a password reset, you can ignore this email.</p>
  `, 'Reset your password – ElevateCRM');

  await transporter.sendMail({
    from:    `"ElevateCRM" <${env.EMAIL_FROM}>`,
    to:      email,
    subject: 'Reset your password – ElevateCRM',
    html,
    text:    `Reset your password: ${resetUrl}`,
  });
}

async function sendInvitationEmail(email, inviterName, orgName, token) {
  const inviteUrl = `${env.CLIENT_URL}/invite/${token}`;
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">You're invited to join ${orgName}</h2>
    <p style="color:#6b7280;margin:0 0 24px;"><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on ElevateCRM. Click below to accept the invitation. This link expires in <strong>24 hours</strong>.</p>
    <div style="text-align:center;">${button('Accept Invitation', inviteUrl)}</div>
  `, `Invitation to join ${orgName} – ElevateCRM`);

  await transporter.sendMail({
    from:    `"ElevateCRM" <${env.EMAIL_FROM}>`,
    to:      email,
    subject: `${inviterName} invited you to join ${orgName} – ElevateCRM`,
    html,
    text:    `Accept your invitation: ${inviteUrl}`,
  });
}

async function sendWelcomeEmail(email, firstName) {
  console.log('📧 About to send welcome email to:', email);
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;">Welcome to ElevateCRM, ${firstName}! 🎉</h2>
    <p style="color:#6b7280;margin:0 0 24px;">Your account is ready. We're excited to have you on board. Start by setting up your CRM workspace.</p>
    <div style="text-align:center;">${button('Go to Dashboard', `${env.CLIENT_URL}/dashboard`)}</div>
  `, 'Welcome to ElevateCRM');

  const info = await transporter.sendMail({
    from: `"ElevateCRM" <${env.EMAIL_FROM}>`,
    to: email,
    subject: `Welcome to ElevateCRM, ${firstName}!`,
    html,
    text: `Welcome to ElevateCRM, ${firstName}! Go to your dashboard: ${env.CLIENT_URL}/dashboard`,
  });

  console.log('✅ Email sent:', info);
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendWelcomeEmail,
};
