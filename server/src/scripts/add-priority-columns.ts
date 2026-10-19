/**
 * Adds the priority pricing tier columns to `teams`:
 *   priority_price_cents  integer    — price for returning families
 *   priority_ends         timestamp  — when the priority price ends
 *
 * Both are nullable with no default, so existing teams simply have no
 * priority tier. This must run BEFORE deploying the code that reads these columns,
 * otherwise every registration query fails with "column does not exist".
 *
 * DRY RUN by default — prints what it would do and changes nothing.
 * Add --apply to actually write to the database.
 *
 * Usage:
 *   npm run db:backup                                # ALWAYS back up first
 *   tsx src/scripts/add-priority-columns.ts           # preview
 *   tsx src/scripts/add-priority-columns.ts --apply   # commit
 */
import { sql } from 'drizzle-orm';
import { db } from '../db';
import dotenv from 'dotenv';
dotenv.config();

const APPLY = process.argv.includes('--apply');

const STATEMENTS = [
    `ALTER TABLE teams ADD COLUMN IF NOT EXISTS priority_price_cents integer`,
    `ALTER TABLE teams ADD COLUMN IF NOT EXISTS priority_ends timestamp`,
];

async function main() {
    const existing = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'teams' AND column_name IN ('priority_price_cents', 'priority_ends')
    `);
    const present = new Set((existing.rows as any[]).map(r => r.column_name));

    console.log(`priority_price_cents: ${present.has('priority_price_cents') ? 'already present' : 'MISSING — will add'}`);
    console.log(`priority_ends:        ${present.has('priority_ends') ? 'already present' : 'MISSING — will add'}`);

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
