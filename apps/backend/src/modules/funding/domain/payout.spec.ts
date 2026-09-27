import { planPayout, ratio } from './payout';

const sum = (xs: { payoutCoins: number }[]) => xs.reduce((s, x) => s + x.payoutCoins, 0);

describe('planPayout', () => {
  it('splits proportionally when the division is exact', () => {
    const plan = planPayout(
      [
        { id: 'a', coins: 10_000 },
        { id: 'b', coins: 30_000 },
      ],
      60_000,
    );
    expect(plan.nairaPerCoin).toBe('1.5000');
    expect(plan.shares).toEqual([
      { id: 'a', coins: 10_000, payoutCoins: 15_000 },
      { id: 'b', coins: 30_000, payoutCoins: 45_000 },
    ]);
  });

  it('always sums to exactly the payout (largest remainder)', () => {
    const plan = planPayout(
      [
        { id: 'a', coins: 1 },
        { id: 'b', coins: 1 },
        { id: 'c', coins: 1 },
      ],
      100,
    );
    expect(sum(plan.shares)).toBe(100);
    expect(plan.shares.map((s) => s.payoutCoins).sort()).toEqual([33, 33, 34]);
    expect(plan.nairaPerCoin).toBe('33.3333');
  });

  it('gives leftover coins to the largest fractional remainder', () => {
    // 7 over 2:5 → 2.0 and 5.0 exact at P=7; at P=10 → 2.857.. and 7.142..
    const plan = planPayout(
      [
        { id: 'small', coins: 2 },
        { id: 'big', coins: 5 },
      ],
      10,
    );
    expect(plan.shares.find((s) => s.id === 'small')!.payoutCoins).toBe(3);
    expect(plan.shares.find((s) => s.id === 'big')!.payoutCoins).toBe(7);
  });

  it('handles a payout below the pool (backers lose value)', () => {
    const plan = planPayout(
      [
        { id: 'a', coins: 50_000 },
        { id: 'b', coins: 150_000 },
      ],
      100_000,
    );
    expect(plan.nairaPerCoin).toBe('0.5000');
    expect(sum(plan.shares)).toBe(100_000);
  });

  it('ignores fully refunded backers and handles an empty pool', () => {
    expect(planPayout([{ id: 'a', coins: 0 }], 500)).toEqual({
      totalCoins: 0,
      payoutCoins: 500,
      nairaPerCoin: '0.0000',
      shares: [],
    });
  });

  it('stays exact beyond 2^53 intermediate products', () => {
    const plan = planPayout(
      [
        { id: 'a', coins: 999_999_937 },
        { id: 'b', coins: 3 },
      ],
      999_999_999,
    );
    expect(sum(plan.shares)).toBe(999_999_999);
  });

  it('is deterministic regardless of input order', () => {
    const stakes = [
      { id: 'x', coins: 1 },
      { id: 'y', coins: 1 },
      { id: 'z', coins: 1 },
    ];
    const a = planPayout(stakes, 2);
    const b = planPayout([...stakes].reverse(), 2);
    const byId = (p: typeof a) => Object.fromEntries(p.shares.map((s) => [s.id, s.payoutCoins]));
    expect(byId(a)).toEqual(byId(b));
  });

  it('rejects negative or fractional payouts', () => {
    expect(() => planPayout([{ id: 'a', coins: 1 }], -1)).toThrow(RangeError);
    expect(() => planPayout([{ id: 'a', coins: 1 }], 1.5)).toThrow(RangeError);
  });
});

describe('ratio', () => {
  it('rounds half up to 4dp', () => {
    expect(ratio(2n, 3n)).toBe('0.6667');
    expect(ratio(1n, 8n)).toBe('0.1250');
    expect(ratio(12_500_000n, 10_000_000n)).toBe('1.2500');
  });
});
