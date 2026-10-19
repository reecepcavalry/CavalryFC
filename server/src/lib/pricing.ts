// Shared tiered pricing logic.
// A team can have up to four price tiers that step up over time:
//   1. Priority           (priorityPriceCents until priorityEnds — returning families)
//   2. Super early bird   (superEarlyBirdPriceCents until superEarlyBirdEnds)
//   3. Early bird         (earlyBirdPriceCents until earlyBirdEnds)
//   4. Regular            (priceCents — always the final, full price)
// Any tier whose price/date is null is simply skipped.

type PricingFields = {
    priceCents: number;
    priorityPriceCents?: number | null;
    priorityEnds?: Date | string | null;
    superEarlyBirdPriceCents?: number | null;
    superEarlyBirdEnds?: Date | string | null;
    earlyBirdPriceCents?: number | null;
    earlyBirdEnds?: Date | string | null;
};

export type PriceTier = 'priority' | 'super' | 'early' | 'regular';

export type PricingInfo = {
    currentPriceCents: number;
    tier: PriceTier;
    // The next (higher) price and when it kicks in, or null if already at regular price.
    nextPriceCents: number | null;
    nextPriceStarts: Date | null;
};

function toDate(d: Date | string | null | undefined): Date | null {
    if (d == null) return null;
    return d instanceof Date ? d : new Date(d);
}

export function pricingInfo(team: PricingFields, now: Date = new Date()): PricingInfo {
    // Configured discount tiers, cheapest/earliest first.
    const tiers = ([
        ['priority', team.priorityPriceCents, toDate(team.priorityEnds)],
        ['super', team.superEarlyBirdPriceCents, toDate(team.superEarlyBirdEnds)],
        ['early', team.earlyBirdPriceCents, toDate(team.earlyBirdEnds)],
    ] as const)
        .filter(([, cents, ends]) => cents != null && ends != null)
        .map(([tier, cents, ends]) => ({ tier, cents: cents as number, ends: ends as Date }));

    const i = tiers.findIndex(t => now < t.ends);
    if (i === -1) {
        return {
            currentPriceCents: team.priceCents,
            tier: 'regular',
            nextPriceCents: null,
            nextPriceStarts: null,
        };
    }

    const current = tiers[i];
    const next = tiers[i + 1];
    return {
        currentPriceCents: current.cents,
        tier: current.tier,
        nextPriceCents: next ? next.cents : team.priceCents,
        nextPriceStarts: current.ends,
    };
}

// The price a registration should actually be charged right now.
export function effectivePriceCents(team: PricingFields, now: Date = new Date()): number {
    return pricingInfo(team, now).currentPriceCents;
}
