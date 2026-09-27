/**
 * Producer dashboard contracts. A producer opens their private link
 * (/producer#key=…); the key is sent as the `x-producer-key` header.
 * Money is in kobo (minor units) unless a field says naira.
 */

export type ProducerWithdrawalStatus = 'REQUESTED' | 'PAID' | 'REJECTED';

export interface ProducerFilm {
  titleId: string;
  title: string;
  type: string;
  year: number | null;
  posterUrl: string | null;
  /** Share of net ticket revenue in basis points (9000 = 90%). */
  revenueShareBps: number;
  views: number;
  completedViews: number;
  ticketsSold: number;
  grossMinor: number;
  earningsMinor: number;
}

export interface ProducerWithdrawal {
  id: string;
  amountMinor: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: ProducerWithdrawalStatus;
  requestedAt: string | null;
  reviewedAt: string | null;
  transferRef: string | null;
  note: string | null;
  createdAt: string;
}

export interface ProducerDashboard {
  producer: { name: string | null; email: string };
  totals: {
    views: number;
    completedViews: number;
    ticketsSold: number;
    grossMinor: number;
    earningsMinor: number;
  };
  balance: {
    earnedMinor: number;
    requestedMinor: number;
    paidMinor: number;
    availableMinor: number;
    minWithdrawalMinor: number;
  };
  /** Last 30 days, oldest first, Lagos dates (YYYY-MM-DD). */
  dailyViews: { date: string; views: number }[];
  films: ProducerFilm[];
  lastBank: { bankName: string; accountNumber: string; accountName: string } | null;
  withdrawals: ProducerWithdrawal[];
  currency: 'NGN';
}

export interface TitleProducer {
  email: string;
  name: string | null;
  revenueShareBps: number;
  linkSentAt: string;
  lastSeenAt: string | null;
}

export interface AdminProducerWithdrawal extends ProducerWithdrawal {
  producerEmail: string;
  producerName: string | null;
}
