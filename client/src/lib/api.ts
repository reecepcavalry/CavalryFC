const API_URL = import.meta.env.VITE_API_URL || '/api';

export interface Team {
    id: number;
    name: string;
    priceCents: number; // Regular (post-early-bird) price
    capacity: number;
    description: string | null;
    open: boolean;
    registrationCount?: number;
    // Tiered pricing (provided by the server)
    priorityPriceCents?: number | null;
    priorityEnds?: string | null;
    superEarlyBirdPriceCents?: number | null;
    superEarlyBirdEnds?: string | null;
    earlyBirdPriceCents?: number | null;
    earlyBirdEnds?: string | null;
    currentPriceCents?: number; // Effective price right now
    priceTier?: 'priority' | 'super' | 'early' | 'regular';
    nextPriceCents?: number | null; // Next (higher) price, or null at regular
    nextPriceStarts?: string | null; // When the next price kicks in
    archived?: boolean;
    season?: string | null;
}

export async function fetchTeams(): Promise<Team[]> {
    const res = await fetch(`${API_URL}/teams`);
    if (!res.ok) throw new Error('Failed to fetch teams');
    return res.json();
}
