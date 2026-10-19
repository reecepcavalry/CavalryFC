// One-off Fall 2026 roster fix (written 2026-10-01, run against the live DB).
// IDs are hardcoded — kept as a record only; do not re-run.
import { db } from '../db';
import { registrations } from '../db/schema';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const updated = await db.update(registrations)
        .set({ teamId: 5 })
        .where(eq(registrations.id, 43))
        .returning();
    console.log(`Moved ${updated[0].playerFirstName} ${updated[0].playerLastName} to teamId ${updated[0].teamId}`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
