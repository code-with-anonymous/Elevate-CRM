// ─────────────────────────────────────────────────────────────────────────────
// src/lib/dealInsight.ts
// Derives the hover "Pipeline insight" panel from a Deal. Pure and synchronous —
// no network, no AI, no state — so a kanban column can call it for every card on
// every paint without the board feeling heavy.
//
// Ground rule, same as the server's ai.service.js: never invent a number. Every
// field below is arithmetic over data the deal already carries. The one judgement
// call is STAGE_PROBABILITY, and it is a labelled, editable constant rather than
// a guess dressed up as a measurement — the panel prints the percentage it used
// so a rep can see exactly where the weighted figure came from.
//
// One honest limitation worth knowing: the API exposes `updatedAt`, not a
// per-stage history, so "idle" means *nothing on this deal has changed* — not
// "sat in this stage". The panel labels it "Last activity" for that reason.
// ─────────────────────────────────────────────────────────────────────────────
import dayjs from 'dayjs';
import type { Deal, DealStage } from '@services/api/dealService';

// ── Tunables ──────────────────────────────────────────────────────────────────

/**
 * Win probability per stage, used only for the weighted forecast. These are the
 * conventional defaults a new CRM ships with; swap them for your own close rates
 * once you have enough closed deals to measure them.
 */
export const STAGE_PROBABILITY: Record<DealStage, number> = {
  Lead: 0.1,
  Qualified: 0.25,
  'Proposal Sent': 0.5,
  Negotiation: 0.75,
  Won: 1,
  Lost: 0,
};

/** The open funnel, in order. Won/Lost are terminal and sit outside it. */
export const OPEN_STAGES: DealStage[] = ['Lead', 'Qualified', 'Proposal Sent', 'Negotiation'];

/** No activity for this long and an open deal is worth chasing. */
export const STALE_AFTER_DAYS = 14;

/** Closing inside this window is "imminent" — the panel says so. */
export const CLOSING_SOON_DAYS = 7;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalTone = 'positive' | 'warn' | 'negative' | 'neutral';

export interface DealSignal {
  key: string;
  label: string;
  tone: SignalTone;
}

export interface DealInsight {
  /** Position in OPEN_STAGES, or -1 for a closed deal. */
  stageIndex: number;
  stageCount: number;
  isClosed: boolean;
  isWon: boolean;

  /** 0–1, straight from STAGE_PROBABILITY. */
  probability: number;
  /** value × probability. The number a forecast actually rolls up. */
  weightedValue: number;

  /** Whole days since createdAt / updatedAt. */
  ageDays: number;
  idleDays: number;

  /** Days until expectedCloseDate; negative means overdue, null means unset. */
  daysToClose: number | null;

  signals: DealSignal[];
}

// ── Derivation ────────────────────────────────────────────────────────────────

/** Whole calendar days from `raw` until today. Negative = in the past. */
function daysFromNow(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const target = dayjs(raw);
  if (!target.isValid()) return null;
  return target.startOf('day').diff(dayjs().startOf('day'), 'day');
}

/** Whole calendar days elapsed since `raw`. Never negative. */
function daysSince(raw: string | null | undefined): number {
  const delta = daysFromNow(raw);
  return delta === null ? 0 : Math.max(0, -delta);
}

export function getDealInsight(deal: Deal): DealInsight {
  const isWon = deal.stage === 'Won';
  const isClosed = isWon || deal.stage === 'Lost';

  const probability = STAGE_PROBABILITY[deal.stage] ?? 0;
  const ageDays = daysSince(deal.createdAt);
  const idleDays = daysSince(deal.updatedAt);
  const daysToClose = daysFromNow(deal.expectedCloseDate);

  const signals: DealSignal[] = [];

  if (isClosed) {
    signals.push(
      isWon
        ? { key: 'won', label: 'Closed won', tone: 'positive' }
        : { key: 'lost', label: 'Closed lost', tone: 'negative' }
    );
  } else {
    // Ordered by how much they should worry a rep, because the panel renders
    // them in sequence and the first chip is the one that gets read.
    if (daysToClose !== null && daysToClose < 0) {
      signals.push({
        key: 'overdue',
        label: `Close date passed ${Math.abs(daysToClose)}d ago`,
        tone: 'negative',
      });
    } else if (daysToClose !== null && daysToClose <= CLOSING_SOON_DAYS) {
      signals.push({
        key: 'closing',
        label: daysToClose === 0 ? 'Closes today' : `Closes in ${daysToClose}d`,
        tone: 'warn',
      });
    }

    if (idleDays >= STALE_AFTER_DAYS) {
      signals.push({ key: 'stale', label: `No activity for ${idleDays}d`, tone: 'warn' });
    }

    if (!deal.expectedCloseDate) {
      signals.push({ key: 'no-date', label: 'No close date set', tone: 'neutral' });
    }

    if (!deal.assignedTo) {
      signals.push({ key: 'unowned', label: 'Unassigned', tone: 'warn' });
    }

    // Only worth saying when nothing else is wrong — otherwise it reads as a
    // contradiction sitting next to two warnings.
    if (signals.length === 0) {
      signals.push({ key: 'healthy', label: 'On track', tone: 'positive' });
    }
  }

  return {
    stageIndex: OPEN_STAGES.indexOf(deal.stage),
    stageCount: OPEN_STAGES.length,
    isClosed,
    isWon,
    probability,
    weightedValue: Math.round(deal.value * probability),
    ageDays,
    idleDays,
    daysToClose,
    signals,
  };
}
