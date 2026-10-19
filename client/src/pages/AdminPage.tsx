import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Dedupe case-insensitively (some families registered as both "Foo@x.com" and "foo@x.com"),
// keeping the first spelling we saw.
const dedupeEmails = (list: (string | null | undefined)[]) => {
    const seen = new Map<string, string>();
    for (const email of list) {
        const trimmed = email?.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) seen.set(key, trimmed);
    }
    return [...seen.values()];
};

// Columns for the per-team roster popup. One definition drives both the on-screen
// table and the "Copy for Sheets" TSV so the two can't drift apart.
const ROSTER_COLUMNS: { label: string; get: (r: any) => string }[] = [
    { label: 'Last', get: r => r.playerLastName || '' },
    { label: 'First', get: r => r.playerFirstName || '' },
    { label: 'Status', get: r => (r.isWaitlist ? 'waitlist' : r.paymentStatus || '') },
    { label: 'DOB', get: r => r.dateOfBirth || '' },
    { label: 'Grade', get: r => r.schoolGrade || '' },
    { label: 'Position', get: r => r.primaryPosition || '' },
    { label: 'Experience', get: r => r.experienceLevel || '' },
    { label: 'Guardian 1', get: r => `${r.guardian1FirstName || ''} ${r.guardian1LastName || ''}`.trim() },
    { label: 'G1 Phone', get: r => r.guardian1Phone || '' },
    { label: 'G1 Email', get: r => r.guardian1Email || '' },
    { label: 'G1 Volunteer', get: r => r.guardian1Volunteer || '' },
    { label: 'Guardian 2', get: r => `${r.guardian2FirstName || ''} ${r.guardian2LastName || ''}`.trim() },
    { label: 'G2 Email', get: r => r.guardian2Email || '' },
    { label: 'G2 Phone', get: r => r.guardian2Phone || '' },
    { label: 'G2 Volunteer', get: r => r.guardian2Volunteer || '' },
    { label: 'Emergency Contact', get: r => `${r.emergencyContactFirstName || ''} ${r.emergencyContactLastName || ''}`.trim() },
    { label: 'Emergency Phone', get: r => r.emergencyContactPhone || '' },
    { label: 'Relation', get: r => r.emergencyContactRelation || '' },
    {
        label: 'Address',
        get: r => {
            const street = [r.street1, r.street2].filter(Boolean).join(' ');
            return [street, r.city, `${r.state || ''} ${r.zip || ''}`.trim()].filter(Boolean).join(', ');
        },
    },
    { label: 'Medical Notes', get: r => r.medicalNotes || '' },
    { label: 'Schedule Requests', get: r => r.scheduleRequests || '' },
    { label: 'Amount', get: r => (r.amountCents ? `$${(r.amountCents / 100).toFixed(2)}` : '') },
    { label: 'Registered', get: r => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '') },
    { label: 'Jersey', get: r => r.jerseySize || '' },
    { label: 'Shorts', get: r => r.shortSize || '' },
];

// Grouped read-only view of one registration. The Payment block is what you need
// in hand to issue a Stripe refund, so it stays even after a player is removed.
const yesNo = (v: any) => (v ? 'Yes' : 'No');
const DETAIL_SECTIONS: { title: string; fields: [string, (r: any) => string][] }[] = [
    {
        title: 'Player',
        fields: [
            ['Name', r => `${r.playerFirstName || ''} ${r.playerLastName || ''}`.trim()],
            ['Date of Birth', r => r.dateOfBirth || '—'],
            ['School Grade', r => r.schoolGrade || '—'],
            ['Primary Position', r => r.primaryPosition || '—'],
            ['Experience', r => r.experienceLevel || '—'],
            ['Jersey Size', r => r.jerseySize || '—'],
            ['Short Size', r => r.shortSize || '—'],
            ['Medical Notes', r => r.medicalNotes || '—'],
            ['Schedule Requests', r => r.scheduleRequests || '—'],
        ],
    },
    {
        title: 'Guardian 1',
        fields: [
            ['Name', r => `${r.guardian1FirstName || ''} ${r.guardian1LastName || ''}`.trim() || '—'],
            ['Phone', r => r.guardian1Phone || '—'],
            ['Email', r => r.guardian1Email || '—'],
            ['Volunteer?', r => r.guardian1Volunteer || '—'],
        ],
    },
    {
        title: 'Guardian 2',
        fields: [
            ['Name', r => `${r.guardian2FirstName || ''} ${r.guardian2LastName || ''}`.trim() || '—'],
            ['Phone', r => r.guardian2Phone || '—'],
            ['Email', r => r.guardian2Email || '—'],
            ['Volunteer?', r => r.guardian2Volunteer || '—'],
        ],
    },
    {
        title: 'Emergency Contact',
        fields: [
            ['Name', r => `${r.emergencyContactFirstName || ''} ${r.emergencyContactLastName || ''}`.trim() || '—'],
            ['Phone', r => r.emergencyContactPhone || '—'],
            ['Email', r => r.emergencyContactEmail || '—'],
            ['Relation', r => r.emergencyContactRelation || '—'],
        ],
    },
    {
        title: 'Address',
        fields: [
            ['Street', r => [r.street1, r.street2].filter(Boolean).join(' ') || '—'],
            ['City', r => r.city || '—'],
            ['State', r => r.state || '—'],
            ['ZIP', r => r.zip || '—'],
        ],
    },
    {
        title: 'Payment',
        fields: [
            ['Status', r => (r.isWaitlist ? 'waitlist' : r.paymentStatus || '—')],
            ['Amount', r => (r.amountCents ? `$${(r.amountCents / 100).toFixed(2)}` : '—')],
            ['Paid On', r => (r.paidAt ? new Date(r.paidAt).toLocaleString() : '—')],
            ['Registered', r => (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—')],
            ['Stripe Payment Intent', r => r.stripePaymentIntentId || '—'],
            ['Stripe Session', r => r.stripeCheckoutSessionId || '—'],
        ],
    },
    {
        title: 'Consents',
        fields: [
            ['Waiver', r => yesNo(r.waiverAccepted)],
            ['Photo Release', r => yesNo(r.photoReleaseAccepted)],
            ['Age Verification', r => yesNo(r.ageVerificationAccepted)],
            ['Code of Conduct', r => yesNo(r.codeOfConductAccepted)],
        ],
    },
];

// Roster order: paid, then unpaid, then waitlist — each alphabetical by last name.
const rosterSort = (a: any, b: any) => {
    const rank = (r: any) => (r.isWaitlist ? 2 : r.paymentStatus === 'paid' ? 0 : 1);
    return rank(a) - rank(b) || (a.playerLastName || '').localeCompare(b.playerLastName || '');
};

export function AdminPage() {
    // Content State (Moved to top) - Fix hooks
    const [editingContent, setEditingContent] = useState(false);
    const [contentForm, setContentForm] = useState({
        program_header: '',
        program_body: '',
        seasonal_fee: '',
        schedule_header: '',
        schedule_body: '',
        coaches_header: '',
        coaches_body: ''
    });

    const [token, setToken] = useState<string | null>(localStorage.getItem('adminToken'));
    const [password, setPassword] = useState('');
    const [registrations, setRegistrations] = useState<any[]>([]);
    const [teams, setTeams] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null);


    // Edit state
    const [editingTeam, setEditingTeam] = useState<any>(null);
    // Prices live in the DB as cents but are edited in dollars. The modal holds raw
    // dollar strings while typing (so "150." mid-keystroke doesn't get mangled) and
    // converts to cents once, on save.
    const [priceInputs, setPriceInputs] = useState({ price: '', priorityPrice: '', superPrice: '', earlyPrice: '' });
    const [emailDropdownOpen, setEmailDropdownOpen] = useState(false);
    // Team whose roster spreadsheet is open (null = closed)
    const [viewingRoster, setViewingRoster] = useState<any>(null);
    // Registration whose detail card is open (null = closed)
    const [viewingPlayer, setViewingPlayer] = useState<any>(null);
    const [showRemoved, setShowRemoved] = useState(false);

    // Takes the player off the roster but keeps the record — the payment trail is
    // what you need to issue a refund, so it must survive the removal.
    const handleRemoveRegistration = async (reg: any) => {
        const reason = prompt(
            `Remove ${reg.playerFirstName} ${reg.playerLastName} from ${reg.teamName || 'this team'}?\n\n` +
            `Their record and payment details are kept for refunds, and you can restore them later.\n\n` +
            `Reason (optional):`
        );
        if (reason === null) return; // canceled
        try {
            const res = await fetch(`${API_URL}/registrations/${reg.id}/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-password': token! },
                body: JSON.stringify({ reason }),
            });
            if (res.ok) {
                setViewingPlayer(null);
                fetchData();
            } else {
                alert('Failed to remove registration');
            }
        } catch (error) {
            console.error(error);
            alert('Error removing registration');
        }
    };

    const handleRestoreRegistration = async (reg: any) => {
        try {
            const res = await fetch(`${API_URL}/registrations/${reg.id}/restore`, {
                method: 'POST',
                headers: { 'x-admin-password': token! },
            });
            if (res.ok) {
                setViewingPlayer(null);
                fetchData();
            } else {
                alert('Failed to restore registration');
            }
        } catch (error) {
            console.error(error);
            alert('Error restoring registration');
        }
    };

    // Permanent purge — destroys the payment trail too, so it keeps the strict
    // type-the-last-name confirmation.
    const handleDeleteRegistration = async (reg: any) => {
        const confirmText = prompt(
            `PERMANENTLY delete ${reg.playerFirstName} ${reg.playerLastName}?\n\n` +
            `This erases the record including Stripe payment details — you will not be able to trace a refund afterwards.\n\n` +
            `Type their last name to confirm:`
        );
        if (!confirmText || confirmText.trim().toLowerCase() !== reg.playerLastName.trim().toLowerCase()) {
            if (confirmText !== null) alert('Last name did not match. Delete canceled.');
            return;
        }
        try {
            const res = await fetch(`${API_URL}/registrations/${reg.id}`, {
                method: 'DELETE',
                headers: { 'x-admin-password': token! },
            });
            if (res.ok) {
                setViewingPlayer(null);
                fetchData();
            } else {
                alert('Failed to delete registration');
            }
        } catch (error) {
            console.error(error);
            alert('Error deleting registration');
        }
    };

    useEffect(() => {
        if (token) {
            fetchData();
        }
    }, [token]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/registrations/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (res.ok) {
                localStorage.setItem('adminToken', password);
                setToken(password);
            } else {
                alert('Invalid password');
            }
        } catch (error) {
            console.error(error);
            alert('Login failed');
        }
    };

    const fetchData = async () => {
        if (!token) return;
        setLoading(true);
        try {
            // Fetch Registrations
            const regRes = await fetch(`${API_URL}/registrations`, {
                headers: { 'x-admin-password': token },
            });
            if (regRes.ok) {
                setRegistrations(await regRes.json());
            } else if (regRes.status === 401) {
                logout();
                return;
            }

            // Fetch Teams (include archived/past-season teams in admin)
            const teamRes = await fetch(`${API_URL}/teams?includeArchived=1`);
            if (teamRes.ok) {
                setTeams(await teamRes.json());
            }

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        try {
            const response = await fetch(`${API_URL}/registrations/export`);
            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `registrations-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error downloading CSV:', error);
            alert('Failed to download');
        }
    };



    const centsToInput = (cents: number | null | undefined) =>
        cents == null ? '' : (cents / 100).toFixed(2);

    // "" means "no such tier". Anything unparseable is treated the same way.
    const inputToCents = (value: string) => {
        const cleaned = value.trim().replace(/[$,]/g, '');
        if (cleaned === '') return null;
        const dollars = parseFloat(cleaned);
        return Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
    };

    const openTeamEditor = (team: any) => {
        setPriceInputs({
            price: centsToInput(team.priceCents),
            priorityPrice: centsToInput(team.priorityPriceCents),
            superPrice: centsToInput(team.superEarlyBirdPriceCents),
            earlyPrice: centsToInput(team.earlyBirdPriceCents),
        });
        setEditingTeam(team);
    };

    const saveTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTeam || !token) return;

        const priceCents = inputToCents(priceInputs.price);
        if (priceCents == null || priceCents < 0) {
            alert('Enter a regular price (e.g. 150.00).');
            return;
        }
        const priorityPriceCents = inputToCents(priceInputs.priorityPrice);
        const superEarlyBirdPriceCents = inputToCents(priceInputs.superPrice);
        const earlyBirdPriceCents = inputToCents(priceInputs.earlyPrice);

        // A tier needs both a price and an end date — pricing silently skips it
        // otherwise, which looks like the discount just never applied.
        const tierChecks: [string, number | null, any][] = [
            ['Priority', priorityPriceCents, editingTeam.priorityEnds],
            ['Super Early Bird', superEarlyBirdPriceCents, editingTeam.superEarlyBirdEnds],
            ['Early Bird', earlyBirdPriceCents, editingTeam.earlyBirdEnds],
        ];
        for (const [label, cents, ends] of tierChecks) {
            if ((cents == null) !== !ends) {
                alert(`${label} needs both a price and an end date — fill in both, or clear both to skip that tier.`);
                return;
            }
        }

        try {
            const res = await fetch(`${API_URL}/teams/${editingTeam.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': token
                },
                body: JSON.stringify({
                    name: editingTeam.name,
                    description: editingTeam.description,
                    priceCents,
                    capacity: editingTeam.capacity,
                    open: editingTeam.open,
                    priorityPriceCents,
                    priorityEnds: editingTeam.priorityEnds || null,
                    superEarlyBirdPriceCents,
                    superEarlyBirdEnds: editingTeam.superEarlyBirdEnds || null,
                    earlyBirdPriceCents,
                    earlyBirdEnds: editingTeam.earlyBirdEnds || null,
                    archived: editingTeam.archived ?? false,
                    season: editingTeam.season || null,
                }),
            });

            if (res.ok) {
                setEditingTeam(null);
                fetchData(); // Refresh list
            } else {
                alert('Failed to update team');
            }
        } catch (error) {
            console.error(error);
            alert('Error updating team');
        }
    };

    const logout = () => {
        localStorage.removeItem('adminToken');
        setToken(null);
        setRegistrations([]);
        setTeams([]);
        setPassword('');
    };

    // Sorting Logic: youngest age group on top.
    // New teams use "U9/U10" labels (sort by U-number ascending); older archived
    // teams use birth years (sort by year descending — younger = higher year).
    const sortTeams = (a: any, b: any) => {
        const uA = a.name.match(/U(\d+)/i);
        const uB = b.name.match(/U(\d+)/i);
        if (uA && uB) return parseInt(uA[1]) - parseInt(uB[1]);
        const yearA = parseInt(a.name.match(/\d{4}/)?.[0] || '0');
        const yearB = parseInt(b.name.match(/\d{4}/)?.[0] || '0');
        return yearB - yearA;
    };

    // Season selection: default to the current (non-archived) season; allow viewing past ones.
    const currentSeason = teams.find(t => !t.archived)?.season || null;
    const allSeasons = Array.from(new Set(teams.map(t => t.season).filter(Boolean)));
    // Show the current season first, then the rest.
    const seasonOptions = [
        ...(currentSeason ? [currentSeason] : []),
        ...allSeasons.filter(s => s !== currentSeason),
    ];
    const activeSeason = selectedSeason ?? currentSeason ?? seasonOptions[0] ?? null;
    const isViewingPast = activeSeason !== currentSeason;

    const seasonTeams = teams.filter(t => (t.season ?? null) === activeSeason);
    const seasonTeamIds = new Set(seasonTeams.map(t => t.id));
    const boysTeams = seasonTeams.filter(t => t.name.toLowerCase().includes('boys')).sort(sortTeams);
    const girlsTeams = seasonTeams.filter(t => t.name.toLowerCase().includes('girls')).sort(sortTeams);

    // Removed players are hidden from every roster view and only surface in the
    // "Removed from roster" section below.
    const activeRegs = registrations.filter(r => !r.removedAt);
    const removedRegs = registrations
        .filter(r => r.removedAt && seasonTeamIds.has(r.teamId))
        .sort((a, b) => new Date(b.removedAt).getTime() - new Date(a.removedAt).getTime());

    const allWaitlisted = activeRegs.filter(r => r.isWaitlist && seasonTeamIds.has(r.teamId));

    // Scoped to the season shown in the picker above — `registrations` holds every season.
    const copyEmails = (filter: 'all' | 'paid' | 'unpaid') => {
        const filtered = activeRegs.filter(r => {
            if (!seasonTeamIds.has(r.teamId)) return false;
            if (r.isWaitlist) return false;
            if (filter === 'paid') return r.paymentStatus === 'paid';
            if (filter === 'unpaid') return r.paymentStatus !== 'paid';
            return true;
        });
        const emails = dedupeEmails([
            ...filtered.map((r: any) => r.guardian1Email),
            ...filtered.map((r: any) => r.guardian2Email),
        ]);
        if (emails.length === 0) {
            alert(`No ${filter === 'all' ? '' : filter + ' '}emails to copy for ${activeSeason ?? 'this season'}.`);
            setEmailDropdownOpen(false);
            return;
        }
        navigator.clipboard.writeText(emails.join(', '));
        alert(`Copied ${emails.length} email(s) for ${activeSeason ?? 'this season'}!`);
        setEmailDropdownOpen(false);
    };

    // Copies the roster as TSV so it can be pasted straight into Sheets/Excel —
    // tabs/newlines inside a cell would break the grid, so they collapse to spaces.
    const copyRoster = (rows: any[], teamName: string) => {
        const tsv = [
            ROSTER_COLUMNS.map(c => c.label).join('\t'),
            ...rows.map(r => ROSTER_COLUMNS.map(c => c.get(r).replace(/[\t\n\r]+/g, ' ')).join('\t')),
        ].join('\n');
        navigator.clipboard.writeText(tsv);
        alert(`Copied ${rows.length} row(s) for ${teamName}. Paste into Google Sheets or Excel.`);
    };

    // Registrations belonging to a team. Match on id only: seasons reuse team
    // names (Fall 2026 and Spring 2027 both have "U9/U10 Boys").
    const teamRegistrations = (team: any, includeWaitlist = false) =>
        activeRegs.filter(r => r.teamId === team.id && (includeWaitlist || !r.isWaitlist));

    // Card Renderer Helper
    const renderTeamCard = (team: any) => {
        const allTeamRegs = teamRegistrations(team);
        const paidRegs = allTeamRegs
            .filter(r => r.paymentStatus === 'paid')
            .sort((a: any, b: any) => (a.playerLastName || '').localeCompare(b.playerLastName || ''));
        const unpaidRegs = allTeamRegs
            .filter(r => r.paymentStatus !== 'paid')
            .sort((a: any, b: any) => (a.playerLastName || '').localeCompare(b.playerLastName || ''));

        return (
            <div key={team.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col mb-4">
                {/* Card Header: Team Name, Count, Edit Button */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {/* Click the team name to open the full roster spreadsheet */}
                        <button
                            onClick={() => setViewingRoster(team)}
                            className="font-bold text-lg text-gray-900 hover:text-blue-700 hover:underline decoration-2 underline-offset-4 transition-colors text-left"
                            title="View full roster spreadsheet"
                        >
                            {team.name}
                        </button>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded border ${paidRegs.length >= team.capacity
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                            {paidRegs.length} / {team.capacity} Filled
                        </span>
                        {team.archived && (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded border bg-gray-200 text-gray-600 border-gray-300">
                                Archived
                            </span>
                        )}
                        {team.priceTier && team.priceTier !== 'regular' && (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                                {({ priority: 'Priority', super: 'Super Early Bird', early: 'Early Bird' } as Record<string, string>)[team.priceTier]} — ${((team.currentPriceCents ?? team.priceCents) / 100).toFixed(0)}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                const teamRegs = teamRegistrations(team);
                                const emails = dedupeEmails([
                                    ...teamRegs.map((r: any) => r.guardian1Email),
                                    ...teamRegs.map((r: any) => r.guardian2Email),
                                ]);
                                if (emails.length === 0) {
                                    alert('No emails to copy for this team.');
                                    return;
                                }
                                navigator.clipboard.writeText(emails.join(', '));
                                alert(`Copied ${emails.length} email(s) for ${team.name}!`);
                            }}
                            className="text-gray-400 hover:text-purple-600 p-1 hover:bg-purple-50 rounded transition-colors"
                            title="Copy team emails"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                            </svg>
                        </button>
                    <button
                        onClick={() => openTeamEditor(team)}
                        className="text-gray-400 hover:text-blue-600 p-1 hover:bg-gray-200 rounded transition-colors"
                        title="Edit Team Settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                    </button>
                    </div>
                </div>

                {/* Paid Registrations */}
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                    {paidRegs.length === 0 && unpaidRegs.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 italic">
                            No active registrations.
                        </div>
                    ) : (
                        paidRegs.map((reg) => (
                            <div key={reg.id} className="p-4 hover:bg-gray-50 flex justify-between items-center text-sm group/row">
                                <div>
                                    <button
                                        onClick={() => setViewingPlayer(reg)}
                                        className="font-semibold text-gray-900 hover:text-blue-700 hover:underline underline-offset-2 text-left"
                                        title="View registration details"
                                    >
                                        {reg.playerLastName}, {reg.playerFirstName}
                                    </button>
                                    <p className="text-gray-500 text-xs">Guardian: {reg.guardian1Name} ({reg.guardian1Email})</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-800">
                                        paid
                                    </span>
                                    <button
                                        onClick={() => handleRemoveRegistration(reg)}
                                        className="opacity-0 group-hover/row:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1 rounded hover:bg-red-50"
                                        title="Remove from roster (record kept for refunds)"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Unpaid Registrations - Separated */}
                {unpaidRegs.length > 0 && (
                    <div className="border-t-2 border-dashed border-yellow-300 bg-yellow-50/50">
                        <div className="px-6 py-2 text-xs font-bold uppercase text-yellow-700 tracking-wider">
                            Unpaid ({unpaidRegs.length})
                        </div>
                        <div className="divide-y divide-yellow-100">
                            {unpaidRegs.map((reg) => (
                                <div key={reg.id} className="p-4 flex justify-between items-center text-sm opacity-70 group/row">
                                    <div>
                                        <button
                                            onClick={() => setViewingPlayer(reg)}
                                            className="font-semibold text-gray-700 hover:text-blue-700 hover:underline underline-offset-2 text-left"
                                            title="View registration details"
                                        >
                                            {reg.playerLastName}, {reg.playerFirstName}
                                        </button>
                                        <p className="text-gray-400 text-xs">Guardian: {reg.guardian1Name} ({reg.guardian1Email})</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-100 text-yellow-800">
                                            unpaid
                                        </span>
                                        <button
                                            onClick={() => handleRemoveRegistration(reg)}
                                            className="opacity-0 group-hover/row:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1 rounded hover:bg-red-50"
                                            title="Remove from roster (record kept for refunds)"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer Info */}
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 text-xs text-gray-500 flex justify-between gap-4">
                    <span>
                        {team.priorityPriceCents != null && team.priorityEnds && (
                            <span className="text-emerald-600 font-medium">
                                ${(team.priorityPriceCents / 100).toFixed(0)} until {new Date(team.priorityEnds).toLocaleDateString()} →{' '}
                            </span>
                        )}
                        {team.superEarlyBirdPriceCents != null && team.superEarlyBirdEnds && (
                            <span className="text-emerald-600 font-medium">
                                ${(team.superEarlyBirdPriceCents / 100).toFixed(0)} until {new Date(team.superEarlyBirdEnds).toLocaleDateString()} →{' '}
                            </span>
                        )}
                        {team.earlyBirdPriceCents != null && team.earlyBirdEnds && (
                            <span className="text-emerald-600 font-medium">
                                ${(team.earlyBirdPriceCents / 100).toFixed(0)} until {new Date(team.earlyBirdEnds).toLocaleDateString()} →{' '}
                            </span>
                        )}
                        <span className="font-medium text-gray-700">${(team.priceCents / 100).toFixed(2)}</span>
                    </span>
                    <span className="whitespace-nowrap">Status: {team.open ? 'Open' : 'Closed'}</span>
                </div>
            </div>
        );
    };

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-96">
                    <h1 className="text-xl font-bold mb-4">Admin Login</h1>
                    <input
                        type="password"
                        placeholder="Admin Password"
                        className="w-full border p-2 rounded mb-4"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                    <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
                        Login
                    </button>
                </form>
            </div>
        );
    }



    const initContentForm = async () => {
        try {
            const res = await fetch(`${API_URL}/content/home_info`);
            const data = await res.json();

            // Plain Text Defaults
            const defaults = {
                program_header: 'About',
                program_body: `Cavalry FC is a youth soccer program where kids of all ages and experience levels play soccer with their South Arbor peers on organized teams. Cavalry FC competes in the recreational division of the WSSL, with an emphasis on development, teamwork, and enjoyment of the game.`,
                seasonal_fee: 'Seasonal Fee: $160 per player',
                schedule_header: 'Schedule',
                schedule_body: `Practices begin the week of March 16th (weather permitting) and are held 1–2 times per week on weekday afternoons or evenings at South Arbor or Wall Park. Times are coordinated by coaches in partnership with parents.\n\nGames begin weekend of March 28th. Typically played on weekends (occasional weekday evenings). Teams play 8 games total. Final game date is Saturday, June 7th.`,
                coaches_header: 'Coaches & Info',
                coaches_body: `Coaches: Teams are led by volunteer parents. All coaches complete background checks and safety training as required by U.S. Soccer. Interested? Indicate it on the form!\n\nRefunds: If a team does not receive sufficient registrations, we will attempt to combine teams or process full refunds.`
            };

            // If old format data exists (with keys like 'program'), we should ignore it and use defaults for a clean break,
            // or attempt to convert it? Safer to just use defaults if the keys don't match our new structure.
            // Let's check if the new keys exist in data.
            if (data && data.program_header) {
                setContentForm({ ...defaults, ...data });
            } else {
                setContentForm(defaults);
            }
            setEditingContent(true);
        } catch (error) {
            console.error(error);
            alert('Failed to load content');
        }
    };

    const saveContent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/content/home_info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-password': token!
                },
                body: JSON.stringify(contentForm),
            });

            if (res.ok) {
                setEditingContent(false);
                alert('Content updated successfully! Refresh the home page to see changes.');
            } else {
                alert('Failed to update content');
            }
        } catch (error) {
            console.error(error);
            alert('Error saving content');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 relative">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                    <div className="space-x-4">
                        {/* Seed button removed as per request */}
                        {/* <button onClick={handleSeed} disabled={seeding} className="text-sm text-gray-600 hover:text-gray-900 border px-3 py-1 rounded">
                            {seeding ? 'Seeding...' : '+ Seed Data (20)'}
                        </button> */}
                        <button onClick={logout} className="text-sm text-red-600 hover:text-red-800">
                            Logout
                        </button>
                    </div>
                </div>

                {/* Subheader */}
                <div className="mb-6 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-gray-800">
                            {activeSeason ? `${activeSeason} Teams` : 'Teams'}
                        </h2>
                        {seasonOptions.length > 1 && (
                            <select
                                value={activeSeason ?? ''}
                                onChange={e => setSelectedSeason(e.target.value)}
                                className="border border-gray-300 rounded-md text-sm py-1.5 px-2 bg-white text-gray-700"
                            >
                                {seasonOptions.map(s => (
                                    <option key={s} value={s}>
                                        {s}{s === currentSeason ? ' (current)' : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                        {isViewingPast && (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                                Past season (archived)
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        {/* Copy Emails Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setEmailDropdownOpen(!emailDropdownOpen)}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded transition-colors flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                                </svg>
                                <span>Copy Emails</span>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                </svg>
                            </button>
                            {emailDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setEmailDropdownOpen(false)} />
                                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
                                        <button onClick={() => copyEmails('all')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700">
                                            All Emails
                                        </button>
                                        <button onClick={() => copyEmails('paid')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700">
                                            Paid Only
                                        </button>
                                        <button onClick={() => copyEmails('unpaid')} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-700">
                                            Unpaid Only
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                        <button
                            onClick={initContentForm}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                            <span>Edit Site Text</span>
                        </button>
                        <button
                            onClick={handleDownload}
                            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded transition-colors flex items-center gap-2"
                        >
                            <span>Download All CSV</span>
                        </button>
                    </div>
                </div>

                {/* 2-Column Sorted Grid */}
                {loading ? (
                    <div className="text-center py-8">Loading...</div>
                ) : (
                    <div className="space-y-12">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 w-full">
                            {/* Boys Column */}
                            <div className="flex flex-col">
                                <div className="flex items-center pb-4 border-b-2 border-blue-500 mb-6">
                                    <h2 className="text-2xl font-bold text-slate-800">Boys</h2>
                                </div>
                                {boysTeams.map(renderTeamCard)}
                            </div>

                            {/* Girls Column */}
                            <div className="flex flex-col">
                                <div className="flex items-center pb-4 border-b-2 border-pink-500 mb-6">
                                    <h2 className="text-2xl font-bold text-slate-800">Girls</h2>
                                </div>
                                {girlsTeams.map(renderTeamCard)}
                            </div>
                        </div>

                        {/* Removed Players — kept for refunds */}
                        {removedRegs.length > 0 && (
                            <div className="mt-12 bg-white rounded-lg shadow-sm border border-red-200 overflow-hidden">
                                <button
                                    onClick={() => setShowRemoved(!showRemoved)}
                                    className="w-full bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-2 hover:bg-red-100 transition-colors text-left"
                                >
                                    <h3 className="font-bold text-lg text-red-900">Removed from Roster</h3>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                                        {removedRegs.length}
                                    </span>
                                    <span className="text-xs text-red-700/70">records kept for refunds</span>
                                    <span className="ml-auto text-red-700 text-sm">{showRemoved ? '▲' : '▼'}</span>
                                </button>

                                {showRemoved && (
                                    <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                                        {removedRegs.map((reg) => (
                                            <div key={reg.id} className="p-4 hover:bg-gray-50 flex justify-between items-center gap-4 text-sm">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button
                                                            onClick={() => setViewingPlayer(reg)}
                                                            className="font-semibold text-gray-900 hover:text-blue-700 hover:underline underline-offset-2 text-left"
                                                        >
                                                            {reg.playerLastName}, {reg.playerFirstName}
                                                        </button>
                                                        <span className="font-medium text-blue-800 bg-blue-50 px-1.5 rounded text-xs">{reg.teamName}</span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${reg.paymentStatus === 'paid'
                                                            ? 'bg-green-100 text-green-800'
                                                            : 'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {reg.paymentStatus}
                                                            {reg.amountCents ? ` · $${(reg.amountCents / 100).toFixed(2)}` : ''}
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-500 text-xs mt-0.5 truncate">
                                                        Removed {new Date(reg.removedAt).toLocaleDateString()}
                                                        {reg.removedReason ? ` — ${reg.removedReason}` : ''}
                                                        {' · '}{reg.guardian1Email}
                                                    </p>
                                                    {reg.stripePaymentIntentId && (
                                                        <p className="text-gray-400 text-[11px] font-mono mt-0.5 truncate">
                                                            {reg.stripePaymentIntentId}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {reg.stripePaymentIntentId && (
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(reg.stripePaymentIntentId);
                                                                alert('Stripe payment ID copied — paste it into Stripe to refund.');
                                                            }}
                                                            className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-100"
                                                            title="Copy the Stripe payment ID for issuing a refund"
                                                        >
                                                            Copy Stripe ID
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleRestoreRegistration(reg)}
                                                        className="text-xs border border-blue-300 text-blue-700 rounded px-2 py-1 hover:bg-blue-50"
                                                    >
                                                        Restore
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Waitlist Section */}
                        <div className="mt-12 bg-white rounded-lg shadow-sm border border-amber-200 overflow-hidden">
                            <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex items-center gap-2">
                                <h3 className="font-bold text-lg text-amber-900">Waitlist Management</h3>
                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                    {allWaitlisted.length} Waiting
                                </span>
                            </div>

                            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                                {allWaitlisted.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 italic">
                                        No one is currently on the waitlist.
                                    </div>
                                ) : (
                                    allWaitlisted.map((reg) => (
                                        <div key={reg.id} className="p-4 hover:bg-gray-50 flex justify-between items-center text-sm">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setViewingPlayer(reg)}
                                                        className="font-semibold text-gray-900 hover:text-blue-700 hover:underline underline-offset-2 text-left"
                                                        title="View registration details"
                                                    >
                                                        {reg.playerLastName}, {reg.playerFirstName}
                                                    </button>
                                                    <span className="text-xs text-slate-400">waiting for</span>
                                                    <span className="font-medium text-blue-800 bg-blue-50 px-1.5 rounded">{reg.teamName}</span>
                                                </div>
                                                <p className="text-gray-500 text-xs mt-0.5">Guardian: {reg.guardian1Name} ({reg.guardian1Email}) • {reg.guardian1Phone}</p>
                                            </div>
                                            <div className="text-right text-xs text-gray-400">
                                                {new Date(reg.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Content Modal */}
            {editingContent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">Edit Homepage Text</h3>
                            <button onClick={() => setEditingContent(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>

                        <form onSubmit={saveContent} className="space-y-6">
                            <div className="p-4 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600 mb-4">
                                <strong>Done!</strong> Now you can just edit the text directly. All the formatting is handled automatically.
                            </div>

                            {/* Program Section */}
                            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800">Program Section</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Header (e.g. About)</label>
                                        <input
                                            className="w-full border border-gray-300 rounded p-2 text-sm"
                                            value={contentForm.program_header}
                                            onChange={e => setContentForm({ ...contentForm, program_header: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Fee Label</label>
                                        <input
                                            className="w-full border border-gray-300 rounded p-2 text-sm"
                                            value={contentForm.seasonal_fee}
                                            onChange={e => setContentForm({ ...contentForm, seasonal_fee: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                                    <textarea
                                        className="w-full border border-gray-300 rounded p-2 text-sm font-sans h-24"
                                        value={contentForm.program_body}
                                        onChange={e => setContentForm({ ...contentForm, program_body: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Schedule Section */}
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">Schedule Section</h4>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Header</label>
                                        <input
                                            className="w-full border border-gray-300 rounded p-2 text-sm"
                                            value={contentForm.schedule_header}
                                            onChange={e => setContentForm({ ...contentForm, schedule_header: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Details</label>
                                        <textarea
                                            className="w-full border border-gray-300 rounded p-2 text-sm font-sans h-48"
                                            value={contentForm.schedule_body}
                                            onChange={e => setContentForm({ ...contentForm, schedule_body: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Coaches Section */}
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">Coaches & Info Section</h4>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Header</label>
                                        <input
                                            className="w-full border border-gray-300 rounded p-2 text-sm"
                                            value={contentForm.coaches_header}
                                            onChange={e => setContentForm({ ...contentForm, coaches_header: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Details</label>
                                        <textarea
                                            className="w-full border border-gray-300 rounded p-2 text-sm font-sans h-48"
                                            value={contentForm.coaches_body}
                                            onChange={e => setContentForm({ ...contentForm, coaches_body: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t">
                                <button type="button" onClick={() => setEditingContent(false)} className="bg-gray-200 px-4 py-2 rounded">Cancel</button>
                                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">Save Content</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Player Detail Modal */}
            {viewingPlayer && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]"
                    onClick={() => setViewingPlayer(null)}
                >
                    <div
                        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-start px-6 py-4 border-b border-gray-200">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">
                                    {viewingPlayer.playerFirstName} {viewingPlayer.playerLastName}
                                </h3>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-sm text-gray-500">{viewingPlayer.teamName}</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${viewingPlayer.removedAt
                                        ? 'bg-red-100 text-red-800'
                                        : viewingPlayer.isWaitlist
                                            ? 'bg-amber-100 text-amber-800'
                                            : viewingPlayer.paymentStatus === 'paid'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {viewingPlayer.removedAt ? 'removed' : viewingPlayer.isWaitlist ? 'waitlist' : viewingPlayer.paymentStatus}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewingPlayer(null)}
                                className="text-gray-500 hover:text-gray-700 text-lg leading-none"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                            {viewingPlayer.removedAt && (
                                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm">
                                    <p className="font-semibold text-red-800">
                                        Removed from roster on {new Date(viewingPlayer.removedAt).toLocaleDateString()}
                                    </p>
                                    <p className="text-red-700 text-xs mt-0.5">
                                        Reason: {viewingPlayer.removedReason || '(none given)'} — the payment details below are kept so you can still issue a refund.
                                    </p>
                                </div>
                            )}

                            {DETAIL_SECTIONS.map(section => (
                                <div key={section.title}>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 pb-1 border-b border-gray-200">
                                        {section.title}
                                    </h4>
                                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                        {section.fields.map(([label, get]) => (
                                            <div key={label} className="flex gap-2">
                                                <dt className="text-gray-500 shrink-0">{label}:</dt>
                                                <dd className="text-gray-900 font-medium break-all">{get(viewingPlayer)}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                            {viewingPlayer.removedAt ? (
                                <>
                                    <button
                                        onClick={() => handleDeleteRegistration(viewingPlayer)}
                                        className="text-sm text-gray-500 hover:text-red-700 underline underline-offset-2"
                                    >
                                        Delete permanently
                                    </button>
                                    <button
                                        onClick={() => handleRestoreRegistration(viewingPlayer)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
                                    >
                                        Restore to roster
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span className="text-xs text-gray-500">
                                        Removing keeps the record and payment trail for refunds.
                                    </span>
                                    <button
                                        onClick={() => handleRemoveRegistration(viewingPlayer)}
                                        className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded transition-colors"
                                    >
                                        Remove from roster
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Team Roster Spreadsheet Modal */}
            {viewingRoster && (() => {
                const rows = teamRegistrations(viewingRoster, true).sort(rosterSort);
                const paidCount = rows.filter(r => !r.isWaitlist && r.paymentStatus === 'paid').length;
                const unpaidCount = rows.filter(r => !r.isWaitlist && r.paymentStatus !== 'paid').length;
                const waitlistCount = rows.filter(r => r.isWaitlist).length;

                return (
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
                        onClick={() => setViewingRoster(null)}
                    >
                        <div
                            className="bg-white rounded-lg shadow-xl w-full max-w-[95vw] max-h-[90vh] flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal header */}
                            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h3 className="text-xl font-bold text-gray-900">{viewingRoster.name}</h3>
                                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded border bg-green-50 text-green-700 border-green-200">
                                        {paidCount} paid
                                    </span>
                                    {unpaidCount > 0 && (
                                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded border bg-yellow-50 text-yellow-800 border-yellow-200">
                                            {unpaidCount} unpaid
                                        </span>
                                    )}
                                    {waitlistCount > 0 && (
                                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">
                                            {waitlistCount} waitlist
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-400">Capacity {viewingRoster.capacity}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => copyRoster(rows, viewingRoster.name)}
                                        disabled={rows.length === 0}
                                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                                        title="Copy as a tab-separated table you can paste into Sheets"
                                    >
                                        Copy for Sheets
                                    </button>
                                    <button
                                        onClick={() => setViewingRoster(null)}
                                        className="text-gray-500 hover:text-gray-700 text-lg leading-none"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable grid */}
                            <div className="overflow-auto flex-1">
                                {rows.length === 0 ? (
                                    <div className="p-12 text-center text-gray-400 italic">
                                        No registrations for this team yet.
                                    </div>
                                ) : (
                                    <table className="text-xs border-collapse w-max min-w-full">
                                        <thead className="sticky top-0 z-10">
                                            <tr className="bg-gray-100">
                                                <th className="px-2 py-2 text-left font-semibold text-gray-500 border-b border-r border-gray-200 w-10">
                                                    #
                                                </th>
                                                {ROSTER_COLUMNS.map(col => (
                                                    <th
                                                        key={col.label}
                                                        className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-r border-gray-200 whitespace-nowrap"
                                                    >
                                                        {col.label}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((reg, i) => (
                                                <tr
                                                    key={reg.id}
                                                    onClick={() => setViewingPlayer(reg)}
                                                    title="Open full registration"
                                                    className={`cursor-pointer hover:bg-blue-50 ${reg.isWaitlist
                                                        ? 'bg-amber-50/60'
                                                        : reg.paymentStatus !== 'paid'
                                                            ? 'bg-yellow-50/60'
                                                            : i % 2 === 1 ? 'bg-gray-50/60' : ''
                                                        }`}
                                                >
                                                    <td className="px-2 py-1.5 text-gray-400 border-b border-r border-gray-100 text-right">
                                                        {i + 1}
                                                    </td>
                                                    {ROSTER_COLUMNS.map(col => (
                                                        <td
                                                            key={col.label}
                                                            className="px-3 py-1.5 text-gray-800 border-b border-r border-gray-100 whitespace-nowrap max-w-xs truncate"
                                                            title={col.get(reg)}
                                                        >
                                                            {col.get(reg)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <div className="px-6 py-2 border-t border-gray-200 text-xs text-gray-400">
                                Scroll sideways for more columns • hover a cell to see the full value
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Edit Team Modal */}
            {editingTeam && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                            <h3 className="text-xl font-bold">Edit Team Settings</h3>
                            <button
                                type="button"
                                onClick={() => setEditingTeam(null)}
                                className="text-gray-500 hover:text-gray-700 text-lg leading-none"
                            >
                                ✕
                            </button>
                        </div>
                        <form onSubmit={saveTeam} className="flex flex-col flex-1 min-h-0">
                            <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Team Name</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                    value={editingTeam.name}
                                    onChange={e => setEditingTeam({ ...editingTeam, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Description (Supports bullet points!)</label>
                                <textarea
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm font-mono whitespace-pre"
                                    rows={6}
                                    value={editingTeam.description}
                                    onChange={e => setEditingTeam({ ...editingTeam, description: e.target.value })}
                                />
                                <p className="text-xs text-gray-500 mt-1">Tip: Use • for bullet points (Option+8 on Mac, Alt+0149 on Windows)</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Regular Price</label>
                                    <div className="relative mt-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="block w-full border border-gray-300 rounded-md shadow-sm p-2 pl-7"
                                            value={priceInputs.price}
                                            onChange={e => setPriceInputs({ ...priceInputs, price: e.target.value })}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Full price once early-bird tiers end</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Capacity</label>
                                    <input
                                        type="number"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                        value={editingTeam.capacity}
                                        onChange={e => setEditingTeam({ ...editingTeam, capacity: parseInt(e.target.value || '0') })}
                                    />
                                </div>
                            </div>

                            {/* Tiered Pricing */}
                            <div className="p-4 bg-emerald-50/50 rounded-lg border border-emerald-100 space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                                    Tiered Pricing (optional)
                                </p>
                                <p className="text-xs text-gray-500 -mt-2">
                                    Price steps up over time: Priority → Super Early Bird → Early Bird → the regular price above. Leave a tier blank to skip it.
                                </p>

                                {/* Priority (returning families) */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Priority Price</label>
                                        <div className="relative mt-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="95.00"
                                                className="block w-full border border-gray-300 rounded-md shadow-sm p-2 pl-7"
                                                value={priceInputs.priorityPrice}
                                                onChange={e => setPriceInputs({ ...priceInputs, priorityPrice: e.target.value })}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">Blank = no priority window</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Priority Ends</label>
                                        <input
                                            type="date"
                                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                            value={editingTeam.priorityEnds ? String(editingTeam.priorityEnds).split('T')[0] : ''}
                                            onChange={e => setEditingTeam({ ...editingTeam, priorityEnds: e.target.value || null })}
                                        />
                                    </div>
                                </div>

                                {/* Super Early Bird */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Super Early Bird Price</label>
                                        <div className="relative mt-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="100.00"
                                                className="block w-full border border-gray-300 rounded-md shadow-sm p-2 pl-7"
                                                value={priceInputs.superPrice}
                                                onChange={e => setPriceInputs({ ...priceInputs, superPrice: e.target.value })}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">Blank = no super early bird</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Super Early Bird Ends</label>
                                        <input
                                            type="date"
                                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                            value={editingTeam.superEarlyBirdEnds ? String(editingTeam.superEarlyBirdEnds).split('T')[0] : ''}
                                            onChange={e => setEditingTeam({ ...editingTeam, superEarlyBirdEnds: e.target.value || null })}
                                        />
                                    </div>
                                </div>

                                {/* Early Bird */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Early Bird Price</label>
                                        <div className="relative mt-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="120.00"
                                                className="block w-full border border-gray-300 rounded-md shadow-sm p-2 pl-7"
                                                value={priceInputs.earlyPrice}
                                                onChange={e => setPriceInputs({ ...priceInputs, earlyPrice: e.target.value })}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">Blank = no early bird</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Early Bird Ends</label>
                                        <input
                                            type="date"
                                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                            value={editingTeam.earlyBirdEnds ? String(editingTeam.earlyBirdEnds).split('T')[0] : ''}
                                            onChange={e => setEditingTeam({ ...editingTeam, earlyBirdEnds: e.target.value || null })}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Reverts to regular price after this date</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center pt-2">
                                <input
                                    type="checkbox"
                                    id="open"
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    checked={editingTeam.open}
                                    onChange={e => setEditingTeam({ ...editingTeam, open: e.target.checked })}
                                />
                                <label htmlFor="open" className="ml-2 block text-sm font-medium text-gray-900">
                                    Registration Open
                                </label>
                            </div>

                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="archived"
                                    className="h-4 w-4 text-gray-600 focus:ring-gray-500 border-gray-300 rounded"
                                    checked={editingTeam.archived ?? false}
                                    onChange={e => setEditingTeam({ ...editingTeam, archived: e.target.checked })}
                                />
                                <label htmlFor="archived" className="ml-2 block text-sm font-medium text-gray-900">
                                    Archived <span className="text-gray-500 font-normal">(hidden from public homepage, kept for records)</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Season</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Fall 2026"
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                    value={editingTeam.season ?? ''}
                                    onChange={e => setEditingTeam({ ...editingTeam, season: e.target.value })}
                                />
                                <p className="text-xs text-gray-500 mt-1">Groups this team under a season in the picker above.</p>
                            </div>
                            </div>

                            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                                <button
                                    type="button"
                                    onClick={() => setEditingTeam(null)}
                                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
