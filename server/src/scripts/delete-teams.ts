// One-off Fall 2026 roster fix (written 2026-10-01, run against the live DB).
// IDs are hardcoded — kept as a record only; do not re-run.
import { db } from '../db';
import { teams } from '../db/schema';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    for (const id of [9, 10]) { // 2014 & 2015 Girls, 2012 & 2013 Girls
        const deleted = await db.delete(teams).where(eq(teams.id, id)).returning();
        if (deleted.length) {
            console.log(`Deleted team ${deleted[0].id}: ${deleted[0].name}`);
        } else {
            console.log(`Team ${id} not found`);
        }
    }
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
