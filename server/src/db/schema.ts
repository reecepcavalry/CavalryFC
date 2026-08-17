import { pgTable, serial, text, integer, boolean, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const experienceLevelEnum = pgEnum('experience_level', ['New', 'Some', 'Experienced']);
export const uniformSizeEnum = pgEnum('uniform_size', ['YS', 'YM', 'YL', 'AS', 'AM', 'AL', 'AXL']);
export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'paid', 'refunded', 'canceled']);

export const teams = pgTable('teams', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(), // e.g. "2017 Boys"
    priceCents: integer('price_cents').notNull().default(16000), // Regular (post-early-bird) price
    capacity: integer('capacity').notNull().default(20),
    description: text('description'),
    open: boolean('open').notNull().default(true),
    // Tiered pricing that steps up over time:
    //   super early bird (until superEarlyBirdEnds) -> early bird (until earlyBirdEnds) -> priceCents (regular).
    // Any tier with a null price/date is skipped. priceCents is always the final, full price.
    superEarlyBirdPriceCents: integer('super_early_bird_price_cents'),
    superEarlyBirdEnds: timestamp('super_early_bird_ends'),
    earlyBirdPriceCents: integer('early_bird_price_cents'),
    earlyBirdEnds: timestamp('early_bird_ends'),
    // Archived teams are kept for historical data but hidden from the public homepage.
    archived: boolean('archived').notNull().default(false),
    // Season label (e.g. "Fall 2026") used to group teams in the admin season picker.
    season: text('season'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const registrations = pgTable('registrations', {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').references(() => teams.id),

    // Player
    playerFirstName: text('player_first_name').notNull(),
    playerLastName: text('player_last_name').notNull(),
    dateOfBirth: text('date_of_birth').notNull(), // YYYY-MM-DD
    schoolGrade: text('school_grade'),
    primaryPosition: text('primary_position'),
    experienceLevel: experienceLevelEnum('experience_level'),
    medicalNotes: text('medical_notes'),

    // Uniform
    jerseySize: uniformSizeEnum('jersey_size'),
    shortSize: uniformSizeEnum('short_size'),

    // Guardian 1
    guardian1FirstName: text('guardian_1_first_name').notNull(),
    guardian1LastName: text('guardian_1_last_name').notNull(),
    guardian1Email: text('guardian_1_email').notNull(),
    guardian1Phone: text('guardian_1_phone').notNull(),
    guardian1Volunteer: text('guardian_1_volunteer').default('No'), // Yes, No, Maybe

    // Guardian 2 (Optional)
    guardian2FirstName: text('guardian_2_first_name'),
    guardian2LastName: text('guardian_2_last_name'),
    guardian2Email: text('guardian_2_email'),
    guardian2Phone: text('guardian_2_phone'),
    guardian2Volunteer: text('guardian_2_volunteer').default('No'), // Yes, No, Maybe

    // Emergency Contact
    emergencyContactFirstName: text('emergency_contact_first_name'),
    emergencyContactLastName: text('emergency_contact_last_name'),
    emergencyContactEmail: text('emergency_contact_email'),
    emergencyContactPhone: text('emergency_contact_phone'),
    emergencyContactRelation: text('emergency_contact_relation'),

    // Player Extra
    scheduleRequests: text('schedule_requests'),

    // Address
    street1: text('street_1').notNull(),
    street2: text('street_2'),
    city: text('city').notNull(),
    state: text('state').notNull(),
    zip: text('zip').notNull(),

    // Consents
    waiverAccepted: boolean('waiver_accepted').notNull().default(false), // Injury/Liability
    photoReleaseAccepted: boolean('photo_release_accepted').notNull().default(false), // Photos
    ageVerificationAccepted: boolean('age_verification_accepted').notNull().default(false), // Birth date attestation
    codeOfConductAccepted: boolean('code_of_conduct_accepted').notNull().default(false),

    // Payment
    amountCents: integer('amount_cents'),
    currency: text('currency').default('usd'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    paymentStatus: paymentStatusEnum('payment_status').default('unpaid'),
    isWaitlist: boolean('is_waitlist').default(false),
    paidAt: timestamp('paid_at'),

    // Soft delete. Removing a player from a roster sets these instead of deleting the
    // row, so the payment trail (amount, Stripe IDs, guardian contact) survives for
    // refunds. Removed rows are excluded from rosters, counts, capacity, and emails.
    removedAt: timestamp('removed_at'),
    removedReason: text('removed_reason'),

    createdAt: timestamp('created_at').defaultNow(),
});

export const donations = pgTable('donations', {
    id: serial('id').primaryKey(),
    type: text('type').notNull().default('donation'), // 'donation' | 'reimbursement'
    donorName: text('donor_name'),
    donorEmail: text('donor_email'),
    comment: text('comment'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').default('usd'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    paymentStatus: paymentStatusEnum('payment_status').default('unpaid'),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const siteContent = pgTable('site_content', {
    key: text('key').primaryKey(),
    content: jsonb('content').notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
