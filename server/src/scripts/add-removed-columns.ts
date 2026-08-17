/**
 * Adds the soft-delete columns to `registrations`:
 *   removed_at      timestamp  — when the player was removed from the roster
 *   removed_reason  text       — why (free text typed by the admin)
 *
 * Both are nullable with no default, so existing rows are untouched and stay
 * active. This must run BEFORE deploying the code that reads these columns,
 * otherwise every registration query fails with "column does not exist".
 *
 * DRY RUN by default — prints what it would do and changes nothing.
 * Add --apply to actually write to the database.
 *
 * Usage:
 *   npm run db:backup                                # ALWAYS back up first
 *   tsx src/scripts/add-removed-columns.ts           # preview
 *   tsx src/scripts/add-removed-columns.ts --apply   # commit
 */
import { sql } from 'drizzle-orm';
import { db } from '../db';
import dotenv from 'dotenv';
dotenv.config();

const APPLY = process.argv.includes('--apply');

const STATEMENTS = [
    `ALTER TABLE registrations ADD COLUMN IF NOT EXISTS removed_at timestamp`,
    `ALTER TABLE registrations ADD COLUMN IF NOT EXISTS removed_reason text`,
];

async function main() {
    const existing = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'registrations' AND column_name IN ('removed_at', 'removed_reason')
    `);
    const present = new Set((existing.rows as any[]).map(r => r.column_name));

    console.log(`removed_at:     ${present.has('removed_at') ? 'already present' : 'MISSING — will add'}`);
    console.log(`removed_reason: ${present.has('removed_reason') ? 'already present' : 'MISSING — will add'}`);

    if (present.size === 2) {
        console.log('\nNothing to do.');
        return;
    }

    if (!APPLY) {
        console.log('\nDRY RUN — no changes made. Re-run with --apply to commit:');
        STATEMENTS.forEach(s => console.log(`  ${s};`));
        return;
    }

    for (const statement of STATEMENTS) {
        console.log(`Running: ${statement}`);
        await db.execute(sql.raw(statement));
    }
    console.log('\nDone. Columns added.');
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
