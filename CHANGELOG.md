# Changelog

Notable changes to the Cavalry FC site. Newest first.

## 2026-08-17

### Added
- **Click a team name** on the admin dashboard for a full roster spreadsheet in
  a popup — every field the registration form collects, paid/unpaid/waitlist
  colour-coded, plus "Copy for Sheets" which puts the whole table on the
  clipboard as TSV for pasting into Google Sheets. No file download involved.
- **Click a player name** anywhere (roster card, spreadsheet row, waitlist,
  removed list) for their complete registration: player, both guardians,
  emergency contact, address, consents, and the payment block including the
  Stripe payment intent ID.
- **Remove from roster** replaces the old delete. It soft-deletes: the player
  comes off the roster and frees their capacity slot, but the record and its
  payment trail are kept so a refund can still be traced and issued. Removed
  players appear in a collapsible "Removed from Roster" section with their
  amount paid, a one-click copy of the Stripe payment ID, and Restore.
  Permanent deletion still exists, in the player's detail card, behind the
  type-the-last-name confirmation.
- `removed_at` / `removed_reason` columns on `registrations`, plus
  `add-removed-columns.ts` to apply them (dry run by default, `--apply` to
  commit).

### Changed
- Team prices are edited in **dollars**, not cents. The field was labelled
  "Price (Cents)" and wanted `15000` for $150.
- The Edit Team dialog fits the screen. It had no height limit, so on shorter
  displays the Save and Cancel buttons sat below the viewport with no way to
  scroll to them. It now has a fixed header, a scrolling body, and a footer
  that's always visible.
- Saving a team warns when an early-bird tier has a price but no end date, or
  vice versa. Pricing silently skips a half-configured tier, so the discount
  would just never apply, with nothing to indicate why.
- A removed registration no longer blocks that player from re-registering for
  the same team, and no longer counts against team capacity.
- CSV export gains "Removed On" and "Removal Reason" columns.

### Fixed
- The Edit Team button rendered as an unrecognisable scribble — its SVG path
  data was malformed. It's a gear now.
- `backups/` is gitignored. The directory holds `pg_dump` output containing
  every registrant's address, phone, email, and medical notes, and was one
  `git add -A` away from being published to GitHub.

## 2026-08-14

### Fixed
- **Admin "Copy Emails" pulled in prior seasons.** The dropdown filtered
  registrations by waitlist and payment status only, never by season, so it
  returned every family who had ever registered. With Fall 2026 selected it
  copied 60 addresses, 29 of them Spring 2026 families not registered for Fall.
  "Unpaid Only" was the worst case — half that list was last season's
  stragglers, who would have been chased for a season that already ended.
  It now scopes to the season in the picker (`4483f00`).
- Copy Emails now includes guardian 2, matching the per-team copy button.
- Email dedupe is case-insensitive. The previous `Set` treated `Foo@x.com` and
  `foo@x.com` as different people, so those families got two copies of anything
  the list was pasted into. Applies to both the bulk dropdown and the per-team
  button.
- Copying an empty list no longer writes an empty string to the clipboard and
  reports "Copied 0 email(s)". Confirmations now name the season.

## 2026-06-10

### Added
- Season picker on the admin dashboard, for viewing past seasons alongside the
  current one (`80c1725`).
- Tiered early-bird pricing (super early bird → early bird → regular), team
  archiving, and the Fall 2026 rollover (`4747eb5`).
- Birth-year eligibility window shown in the registration header (`8ec2f84`).

### Changed
- Teams sort by age group, youngest first (`31811a0`).
- U9/U10 team capacity set to 12 (`fa37a4e`).
- Donate button moved to the bottom of the homepage (`ed2e313`).
- Team Schedules button removed from the homepage (`44515c6`).

## 2026-04-06

### Added
- Team schedules page with an embedded Google Calendar (`d056e81`), plus
  per-team filter checkboxes (`0b9215a`).

## 2026-02-27

### Added
- Per-team "copy emails" button on the admin dashboard (`73acfb9`).

## 2026-02-13

### Added
- Donation and cash reimbursement flows (`986ac61`).

## 2026-02-09

### Fixed
- Duplicate registrations, plus admin tooling and team management improvements
  (`3b0c5ee`).

## 2026-01-02

### Fixed
- Spot counter now subtracts registrations from capacity (`9108e55`).
- Express 5 wildcard route error (`a69314a`).
- API URLs use relative paths in production; Vite proxy configured for local
  dev; hardcoded localhost removed from the success page.
- AdminPage React hook-order violations.

### Added
- Startup warning when `FRONTEND_URL` is missing in production (`adf0600`).
