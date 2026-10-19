/**
 * Set up Spring 2027 registration (opened Oct 2026 to raise funds early).
 *
 * Spring is the second half of the 2026-27 school year, so age brackets are
 * unchanged from Fall 2026. It:
 *   1. Archives the active Fall 2026 teams (rosters stay viewable in the admin
 *      season picker; their registrations are never touched).
 *   2. Clones the Fall teams that actually ran into Spring 2027 teams — same
 *      name, description (eligibility window) and capacity — with the pricing:
 *        $95 priority registration through Nov 1 ET  ->  $120 from Nov 2.
 *      Priority is meant for current Cavalry families, on the honor system;
 *      the homepage fee text says so.
 *   3. Updates the homepage fee text (site_content "home_info").
 *
 * DRY RUN by default — prints what it would do and changes nothing.
 *
 * Usage:
 *   npm run db:backup                            # ALWAYS back up first
 *   tsx src/scripts/setup-spring-2027.ts         # preview
 *   tsx src/scripts/setup-spring-2027.ts --apply # commit
 */
import { db } from '../db';
import { teams, siteContent } from '../db/schema';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

const APPLY = process.argv.includes('--apply');

const OLD_SEASON = 'Fall 2026';
const NEW_SEASON = 'Spring 2027';

// Fall teams to carry over. U11/U12 Girls and U13/U14 Girls drew no Fall
// registrations, so they are archived but not recreated.
const CARRY_OVER = ['U9/U10 Boys', 'U9/U10 Girls', 'U11/U12 Boys', 'U13/U14 Boys'];

// The priority price lives in the "super early bird" tier, which the homepage
// labels "Priority Registration". DST ends Nov 1, 2026, so midnight starting
// Nov 2 is EST (-05:00).
const PRIORITY_CENTS = 9500;  // $95 priority (current families)
const REGULAR_CENTS = 12000;  // $120 from Nov 2
const PRIORITY_ENDS = new Date('2026-11-02T00:00:00-05:00'); // $95 through end of Nov 1 ET

const SEASONAL_FEE = 'Priority registration for current Cavalry families: $95 through November 1 → $120 after';

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

async function main() {
    const allTeams = await db.query.teams.findMany();
    const toArchive = allTeams.filter(t => !t.archived && t.season === OLD_SEASON);
    const templates = CARRY_OVER.map(name => {
        const t = allTeams.find(x => x.season === OLD_SEASON && x.name === name);
        if (!t) throw new Error(`No ${OLD_SEASON} team named "${name}"`);
        return t;
    });

    console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — ${NEW_SEASON} season setup`);
    console.log(`Pricing (Eastern): ${money(PRIORITY_CENTS)} priority through Nov 1  →  ${money(REGULAR_CENTS)} from Nov 2\n`);

    // Anything active that isn't Fall 2026 would end up on the homepage next to Spring.
    const strays = allTeams.filter(t => !t.archived && t.season !== OLD_SEASON);
    if (strays.length > 0) {
        console.warn(`WARNING: active teams outside ${OLD_SEASON} will stay on the homepage:`);
        strays.forEach(t => console.warn(`   #${t.id}  "${t.name}" (${t.season})`));
        console.warn('');
    }

    console.log(`Will ARCHIVE ${toArchive.length} ${OLD_SEASON} team(s):`);
    toArchive.forEach(t => console.log(`   #${t.id}  "${t.name}"`));

    console.log(`\nWill CREATE ${templates.length} ${NEW_SEASON} team(s):`);
    templates.forEach(t => console.log(`   "${t.name}"  (cap ${t.capacity})`));

    const collisions = allTeams.filter(t => t.season === NEW_SEASON);
    if (collisions.length > 0) {
        console.warn(`\nWARNING: ${NEW_SEASON} teams already exist — possible double run:`);
        collisions.forEach(c => console.warn(`   #${c.id}  "${c.name}"`));
    }

    console.log(`\nWill set homepage fee text to:\n   "${SEASONAL_FEE}"`);

    if (!APPLY) {
        console.log(`\nDry run only. Re-run with --apply to commit.\n`);
        process.exit(0);
    }

    for (const t of toArchive) {
        await db.update(teams).set({ archived: true, open: false }).where(eq(teams.id, t.id));
        console.log(`  Archived "${t.name}" (#${t.id})`);
    }

    for (const t of templates) {
        const created = await db.insert(teams).values({
            name: t.name,
            description: t.description,
            capacity: t.capacity,
            priceCents: REGULAR_CENTS,
            superEarlyBirdPriceCents: PRIORITY_CENTS,
            superEarlyBirdEnds: PRIORITY_ENDS,
            earlyBirdPriceCents: null,
            earlyBirdEnds: null,
            open: true,
            archived: false,
            season: NEW_SEASON,
        }).returning();
        console.log(`  Created "${created[0].name}" (#${created[0].id})`);
    }

    const existing = await db.select().from(siteContent).where(eq(siteContent.key, 'home_info')).limit(1);
    const content = { ...(existing[0]?.content as any ?? {}), seasonal_fee: SEASONAL_FEE };
    await db.insert(siteContent)
        .values({ key: 'home_info', content })
        .onConflictDoUpdate({ target: siteContent.key, set: { content, updatedAt: new Date() } });
    console.log('  Updated homepage fee text');

    console.log(`\nDone. ${toArchive.length} archived, ${templates.length} created.\n`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
