import type { EpisodePlayback } from '@prisma/client';

/**
 * Per-episode watch-once state belongs to the ticket it was opened under. A row
 * whose window started before the current entitlement was created is left over
 * from an earlier ticket and must not lock a re-bought series.
 */
export const belongsToTicket = (row: Pick<EpisodePlayback, 'startedAt'>, ticketCreatedAt: Date) =>
  row.startedAt !== null && row.startedAt.getTime() >= ticketCreatedAt.getTime();

/** Watched to completion, or its single viewing window ran out. */
export const episodeClosed = (
  row: Pick<EpisodePlayback, 'consumedAt' | 'expiresAt'>,
  now = Date.now(),
) => row.consumedAt !== null || (row.expiresAt !== null && row.expiresAt.getTime() <= now);
