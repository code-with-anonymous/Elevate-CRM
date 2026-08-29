// ─────────────────────────────────────────────────────────────────────────────
// tests/helpers/mailbox.js — capture outbound mail and the tokens inside it.
//
// Verification, reset and invitation tokens are stored SHA-256 hashed, so the
// raw value that a user would click can never be read back out of Mongo. The
// only place it exists in plaintext is the argument handed to the email service.
// Spying there is therefore not a convenience — it is the only way to test the
// reset and invite flows end to end.
//
// Call install() from a beforeEach: jest.config.js sets restoreMocks, which
// tears every spy down before each test.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const emailService = require('../../services/email.service');

/**
 * @returns {{outbox: Array, install: Function, last: Function, tokenFor: Function}}
 */
function createMailbox() {
  const outbox = [];

  function install() {
    outbox.length = 0;

    jest
      .spyOn(emailService, 'sendVerificationEmail')
      .mockImplementation(async (to, token) => {
        outbox.push({ type: 'verification', to, token });
        return { messageId: 'test-verification' };
      });

    jest
      .spyOn(emailService, 'sendPasswordResetEmail')
      .mockImplementation(async (to, token) => {
        outbox.push({ type: 'reset', to, token });
        return { messageId: 'test-reset' };
      });

    jest
      .spyOn(emailService, 'sendInvitationEmail')
      .mockImplementation(async (to, inviterName, orgName, token) => {
        outbox.push({ type: 'invitation', to, inviterName, orgName, token });
        return { messageId: 'test-invitation' };
      });

    jest
      .spyOn(emailService, 'sendWelcomeEmail')
      .mockImplementation(async (to, firstName) => {
        outbox.push({ type: 'welcome', to, firstName });
        return { messageId: 'test-welcome' };
      });

    return outbox;
  }

  /** The most recent mail of a given type, or undefined. */
  const last = (type) => [...outbox].reverse().find((m) => m.type === type);

  /**
   * The raw token from the most recent mail of `type`, optionally narrowed to a
   * recipient. Throws rather than returning undefined — a silent undefined here
   * turns into a confusing 400 three assertions later.
   */
  function tokenFor(type, to = null) {
    const match = [...outbox]
      .reverse()
      .find((m) => m.type === type && (!to || m.to.toLowerCase() === to.toLowerCase()));

    if (!match) {
      throw new Error(
        `No "${type}" email was sent${to ? ` to ${to}` : ''}. ` +
          `Outbox held: ${JSON.stringify(outbox.map((m) => [m.type, m.to]))}`
      );
    }
    return match.token;
  }

  return { outbox, install, last, tokenFor };
}

module.exports = { createMailbox };
