import { Router } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { registrations, teams } from '../db/schema';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { effectivePriceCents } from '../lib/pricing';
import dotenv from 'dotenv';
dotenv.config();

import { Parser } from 'json2csv';
import { desc } from 'drizzle-orm';

export const registrationRoutes = Router();

// Middleware-like function for admin check
const checkAdmin = (req: any, res: any, next: any) => {
    const password = req.headers['x-admin-password'];
    if (password === process.env.ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// POST /api/registrations/seed (Dev/Admin)
registrationRoutes.post('/seed', async (req, res) => {
    try {
        const allTeams = await db.query.teams.findMany();
        if (allTeams.length < 4) return res.status(400).json({ error: 'Need at least 4 teams seeded to run this' });

        // Pick 4 teams
        const targetTeams = allTeams.slice(0, 4);
        const dummyData: any[] = [];

        for (const team of targetTeams) {
            for (let i = 1; i <= 5; i++) {
                dummyData.push({
                    teamId: team.id,
                    playerFirstName: `Player${i}`,
                    playerLastName: `${team.name.split(' ')[0]}_${i}`, // e.g. 2017_1
                    dateOfBirth: '2015-01-01',
                    guardian1FirstName: `ParentFirst${i}`,
                    guardian1LastName: `ParentLast${i}`,
                    guardian1Email: `parent${i}@example.com`,
                    guardian1Phone: '555-0000',
                    street1: '123 Seed St',
                    city: 'Seed City',
                    state: 'VA',
                    zip: '20120',
                    amountCents: team.priceCents,
                    paymentStatus: 'paid' as const,
                    stripeCheckoutSessionId: `sess_seed_${team.id}_${i}`,
                    stripePaymentIntentId: `pi_seed_${team.id}_${i}`,
                    paidAt: new Date(),
                    waiverAccepted: true,
                    photoReleaseAccepted: true,
                    codeOfConductAccepted: true,
                    ageVerificationAccepted: true,
                });
            }
        }

        const inserted = await db.insert(registrations).values(dummyData).returning();
        res.json({ message: 'Seeded 20 dummy registrations', count: inserted.length });

    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ error: 'Failed to seed registrations' });
    }
});

// POST /api/registrations/auth
registrationRoutes.post('/auth', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        res.json({ status: 'ok' });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// GET /api/registrations (Admin)
registrationRoutes.get('/', checkAdmin, async (req, res) => {
    try {
        const all = await db.query.registrations.findMany({
            orderBy: [desc(registrations.createdAt)],
            with: {
                // Return relational data if configured
            }
        });

        // Fetch teams to map IDs to names manually if relationship isn't auto-pulling
        const allTeams = await db.query.teams.findMany();
        const teamMap = new Map(allTeams.map(t => [t.id, t.name]));

        const enriched = all.map(r => ({
            ...r,
            teamName: r.teamId ? teamMap.get(r.teamId) : 'Unknown',
            // Helper for UI compatibility if needed, though UI should update to use First/Last
            guardian1Name: `${r.guardian1FirstName} ${r.guardian1LastName}`,
        }));

        res.json(enriched);
    } catch (error) {
        console.error('List error:', error);
        res.status(500).json({ error: 'Failed to fetch list' });
    }
});

// POST /api/registrations/:id/remove (Admin)
// Soft delete: pulls the player off the roster but keeps the row so the payment
// trail survives for refunds. Use DELETE only to purge a record for good.
registrationRoutes.post('/:id/remove', checkAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        const updated = await db.update(registrations)
            .set({ removedAt: new Date(), removedReason: reason || null })
            .where(eq(registrations.id, id))
            .returning();
        if (updated.length === 0) return res.status(404).json({ error: 'Registration not found' });
        res.json({ message: `Removed registration ${id} from roster`, registration: updated[0] });
    } catch (error) {
        console.error('Remove error:', error);
        res.status(500).json({ error: 'Failed to remove registration' });
    }
});

// POST /api/registrations/:id/restore (Admin) — undo a removal
registrationRoutes.post('/:id/restore', checkAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updated = await db.update(registrations)
            .set({ removedAt: null, removedReason: null })
            .where(eq(registrations.id, id))
            .returning();
        if (updated.length === 0) return res.status(404).json({ error: 'Registration not found' });
        res.json({ message: `Restored registration ${id}`, registration: updated[0] });
    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: 'Failed to restore registration' });
    }
});

// DELETE /api/registrations/:id (Admin) — permanent purge, payment trail included
registrationRoutes.delete('/:id', checkAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const deleted = await db.delete(registrations).where(eq(registrations.id, id)).returning();
        if (deleted.length === 0) return res.status(404).json({ error: 'Registration not found' });
        res.json({ message: `Deleted registration ${id}`, registration: deleted[0] });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete registration' });
    }
});

// POST /api/registrations/waitlist
// Adds user to waitlist without payment
registrationRoutes.post('/waitlist', async (req, res) => {
    const data = req.body;
    try {
        const team = await db.query.teams.findFirst({
            where: eq(teams.id, data.teamId),
        });
        if (!team) return res.status(404).json({ error: 'Team not found' });

        const newReg = await db.insert(registrations).values({
            ...data,
            amountCents: effectivePriceCents(team), // Keeping price info but unpaid
            paymentStatus: 'unpaid',
            isWaitlist: true,
        }).returning();

        res.json({ status: 'waitlisted', registration: newReg[0] });
    } catch (error) {
        console.error('Waitlist error:', error);
        res.status(500).json({ error: 'Failed to join waitlist' });
    }
});

// GET /api/registrations/export (Admin)
registrationRoutes.get('/export', async (req, res) => {
    try {
        const allRegistrations = await db.query.registrations.findMany({
            orderBy: [desc(registrations.createdAt)],
        });

        const allTeams = await db.query.teams.findMany();
        const teamMap = new Map(allTeams.map(t => [t.id, t.name]));

        // Transform for CSV
        const csvData = allRegistrations.map(reg => ({
            'Player Name': `${reg.playerLastName}, ${reg.playerFirstName}`,
            'Team': reg.teamId ? teamMap.get(reg.teamId) : 'Unknown',
            'Status': reg.removedAt ? 'REMOVED' : reg.isWaitlist ? 'WAITLIST' : reg.paymentStatus,
            'Removed On': reg.removedAt ? new Date(reg.removedAt).toLocaleDateString() : '',
            'Removal Reason': reg.removedReason || '',
            'DOB': reg.dateOfBirth,
            'Guardian 1 First': reg.guardian1FirstName,
            'Guardian 1 Last': reg.guardian1LastName,
            'Guardian 1 Email': reg.guardian1Email,
            'Guardian 1 Phone': reg.guardian1Phone,
            'Guardian 2 First': reg.guardian2FirstName || '',
            'Guardian 2 Last': reg.guardian2LastName || '',
            'Guardian 2 Email': reg.guardian2Email || '',
            'Guardian 2 Phone': reg.guardian2Phone || '',
            'Address': `${reg.street1} ${reg.street2 || ''}, ${reg.city}, ${reg.state} ${reg.zip}`,
            'Amount': (reg.amountCents ? (reg.amountCents / 100).toFixed(2) : '0.00'),
            'Date': reg.createdAt ? new Date(reg.createdAt).toLocaleDateString() : '',
            'Jersey Size': reg.jerseySize,
            'Short Size': reg.shortSize,
            'Medical Notes': reg.medicalNotes,
            'Age Verified': reg.ageVerificationAccepted ? 'Yes' : 'No',
        }));

        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(csvData);

        res.header('Content-Type', 'text/csv');
        res.attachment(`registrations-${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export registrations' });
    }
});

// POST /api/registrations/cleanup-duplicates (Admin)
// 1. If a player has both paid and unpaid registrations for the same team, delete the unpaid ones
// 2. If a player has multiple unpaid registrations for the same team, keep the newest
registrationRoutes.post('/cleanup-duplicates', checkAdmin, async (req, res) => {
    try {
        // Removed rows are deliberate history — never fold them into dedupe.
        const all = (await db.query.registrations.findMany({
            orderBy: [desc(registrations.createdAt)],
        })).filter(r => !r.removedAt);

        const deleteIds: number[] = [];

        // Build a set of player+team keys that have a paid registration
        const paidKeys = new Set<string>();
        for (const r of all) {
            if (r.paymentStatus === 'paid') {
                const key = `${r.playerFirstName?.toLowerCase()}_${r.playerLastName?.toLowerCase()}_${r.teamId}`;
                paidKeys.add(key);
            }
        }

        // Delete any unpaid registration where a paid one exists for the same player+team
        const unpaid = all.filter(r => r.paymentStatus === 'unpaid');
        const seenUnpaid = new Map<string, number>();

        for (const r of unpaid) {
            const key = `${r.playerFirstName?.toLowerCase()}_${r.playerLastName?.toLowerCase()}_${r.teamId}`;
            if (paidKeys.has(key)) {
                // Paid version exists — this unpaid record is stale
                deleteIds.push(r.id);
            } else if (seenUnpaid.has(key)) {
                // Duplicate unpaid — keep the newest (first seen since sorted desc)
                deleteIds.push(r.id);
            } else {
                seenUnpaid.set(key, r.id);
            }
        }

        if (deleteIds.length === 0) {
            return res.json({ message: 'No duplicates found', deleted: 0 });
        }

        await db.delete(registrations).where(inArray(registrations.id, deleteIds));

        res.json({
            message: `Deleted ${deleteIds.length} duplicate/stale unpaid registration(s)`,
            deleted: deleteIds.length,
            deletedIds: deleteIds,
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: 'Failed to clean up duplicates' });
    }
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2024-12-18.acacia' as any,
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
if (process.env.NODE_ENV === 'production' && FRONTEND_URL.includes('localhost')) {
    console.error('CRITICAL WARNING: FRONTEND_URL is set to localhost in production! Stripe redirects will fail.');
}

// Season label shown on the Stripe receipt (e.g. "2018-2019 Girls — Fall 2026 Registration").
// Update this each season, same as the "Fall 2026 Season" text on the homepage.
const SEASON_LABEL = 'Fall 2026';

// POST /api/registrations/checkout
// Creates a pending registration and a Stripe Checkout Session
registrationRoutes.post('/checkout', async (req, res) => {
    const data = req.body; // Expects full form data including teamId

    try {
        // 1. Get Team Info for pricing
        const team = await db.query.teams.findFirst({
            where: eq(teams.id, data.teamId),
        });

        if (!team) return res.status(404).json({ error: 'Team not found' });

        // 2. Check if this player is already paid for this team.
        // A removed (refunded/withdrawn) registration doesn't block re-registering.
        const alreadyPaid = await db.query.registrations.findFirst({
            where: and(
                eq(registrations.playerFirstName, data.playerFirstName),
                eq(registrations.playerLastName, data.playerLastName),
                eq(registrations.teamId, data.teamId),
                eq(registrations.paymentStatus, 'paid'),
                isNull(registrations.removedAt),
            ),
        });

        if (alreadyPaid) {
            return res.status(400).json({ error: 'This player is already registered and paid for this team' });
        }

        // 3. Check for existing unpaid registration for the same player + team
        const existing = await db.query.registrations.findFirst({
            where: and(
                eq(registrations.playerFirstName, data.playerFirstName),
                eq(registrations.playerLastName, data.playerLastName),
                eq(registrations.teamId, data.teamId),
                eq(registrations.paymentStatus, 'unpaid'),
                isNull(registrations.removedAt),
            ),
        });

        // Price to charge right now (early-bird price if before the deadline, else regular)
        const priceCents = effectivePriceCents(team);

        let regId: number;

        if (existing) {
            // Reuse existing unpaid registration instead of creating a duplicate.
            // Refresh the stored amount in case early-bird pricing flipped since it was created.
            regId = existing.id;
            await db.update(registrations)
                .set({ amountCents: priceCents })
                .where(eq(registrations.id, existing.id));
        } else {
            // Create new registration record
            const newReg = await db.insert(registrations).values({
                ...data,
                amountCents: priceCents,
                paymentStatus: 'unpaid',
            }).returning();
            regId = newReg[0].id;
        }

        // 3. Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: data.guardian1Email, // Triggers Stripe Receipt
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${team.name} — ${SEASON_LABEL} Registration`,
                            description: `Player: ${data.playerFirstName} ${data.playerLastName}`,
                        },
                        unit_amount: priceCents,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/?canceled=true`,
            metadata: {
                registrationId: regId.toString(),
            },
        });

        // 4. Update Registration with Session ID
        await db.update(registrations)
            .set({ stripeCheckoutSessionId: session.id })
            .where(eq(registrations.id, regId));

        // 5. Return URL to frontend
        res.json({ url: session.url });

    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ error: 'Failed to initiate checkout' });
    }
});

// POST /api/registrations/verify
// Called by frontend on /success page to confirm payment
registrationRoutes.post('/verify', async (req, res) => {
    const { sessionId } = req.body;

    try {
        // 1. Retrieve Session from Stripe to be safe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
            // 2. Mark as paid in DB
            const regId = session.metadata?.registrationId;
            if (regId) {
                const updatedReg = await db.update(registrations)
                    .set({
                        paymentStatus: 'paid',
                        stripePaymentIntentId: session.payment_intent as string,
                        paidAt: new Date(),
                    })
                    .where(eq(registrations.id, parseInt(regId)))
                    .returning();

                // Fetch team name for the receipt display
                const team = await db.query.teams.findFirst({
                    where: eq(teams.id, updatedReg[0].teamId as number)
                });

                return res.json({
                    status: 'paid',
                    registration: {
                        ...updatedReg[0],
                        teamName: team?.name || 'Unknown Team'
                    }
                });
            }
        }

        res.json({ status: session.payment_status });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});
