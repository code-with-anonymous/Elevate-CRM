// ─────────────────────────────────────────────────────────────────────────────
// utils/escapeRegex.js
//
// Every search endpoint interpolates a query string into a regex. Unescaped,
// that's two real problems:
//
//   · `.*` or `` (empty) matches every record in the org — a filter that
//     silently does the opposite of filtering.
//   · `(((` is an invalid pattern. `new RegExp()` throws a SyntaxError that no
//     asyncHandler expects, and `{ $regex: '(((' }` makes Mongo reject the
//     whole query.
//   · A crafted nested quantifier (`(a+)+$`) is a catastrophic-backtracking
//     ReDoS — one request pinning a CPU core.
//
// One helper, used by every search path, so a new endpoint can't reintroduce it.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

/** Escape all regex metacharacters in a user-supplied search string. */
function escapeRegex(input) {
  return String(input ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Convenience: a Mongo `$regex` clause with the input already escaped. */
function safeRegexClause(input, options = 'i') {
  return { $regex: escapeRegex(input), $options: options };
}

module.exports = { escapeRegex, safeRegexClause };
