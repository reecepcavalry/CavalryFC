// One-off Fall 2026 roster fix (written 2026-10-01, run against the live DB).
// IDs are hardcoded — kept as a record only; do not re-run.
import { db } from '../db';
import { registrations } from '../db/schema';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const fromTeamId = 6;  // 2018 Girls (old)
    const toTeamId = 7;    // 2017-2018 Girls (merged)

    const updated = await db.update(registrations)
        .set({ teamId: toTeamId })
        .where(eq(registrations.teamId, fromTeamId))
        .returning();

    console.log(`Moved ${updated.length} registrations from team ${fromTeamId} to team ${toTeamId}:`);
    for (const r of updated) {
        console.log(`  ID=${r.id} ${r.playerFirstName} ${r.playerLastName}`);
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
