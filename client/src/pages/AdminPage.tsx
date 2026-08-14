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
    const [emailDropdownOpen, setEmailDropdownOpen] = useState(false);

    const handleDeleteRegistration = async (reg: any) => {
        const confirmText = prompt(
            `To delete ${reg.playerFirstName} ${reg.playerLastName}, type their last name:`
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



    const saveTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTeam || !token) return;

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
                    priceCents: editingTeam.priceCents,
                    capacity: editingTeam.capacity,
                    open: editingTeam.open,
                    superEarlyBirdPriceCents: editingTeam.superEarlyBirdPriceCents ?? null,
                    superEarlyBirdEnds: editingTeam.superEarlyBirdEnds || null,
                    earlyBirdPriceCents: editingTeam.earlyBirdPriceCents ?? null,
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

    const allWaitlisted = registrations.filter(r => r.isWaitlist && seasonTeamIds.has(r.teamId));

    // Scoped to the season shown in the picker above — `registrations` holds every season.
    const copyEmails = (filter: 'all' | 'paid' | 'unpaid') => {
        const filtered = registrations.filter(r => {
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

    // Card Renderer Helper
    const renderTeamCard = (team: any) => {
        const allTeamRegs = registrations.filter(r => (r.teamId === team.id || r.teamName === team.name) && !r.isWaitlist);
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
                        <h3 className="font-bold text-lg text-gray-900">{team.name}</h3>
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
                                {team.priceTier === 'super' ? 'Super Early Bird' : 'Early Bird'} — ${((team.currentPriceCents ?? team.priceCents) / 100).toFixed(0)}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                const teamRegs = registrations.filter(r => (r.teamId === team.id || r.teamName === team.name) && !r.isWaitlist);
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
                        onClick={() => setEditingTeam(team)}
                        className="text-gray-400 hover:text-blue-600 p-1 hover:bg-gray-200 rounded transition-colors"
                        title="Edit Team Settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.157.945c.03.188.093.368.18.535l.937.669a.75.75 0 0 1 .184 1.082l-.634.957a.75.75 0 0 1-1.01.218l-.936-.67a2.536 2.536 0 0 0-3.003 0l-.936.67a.75.75 0 0 1-1.009-.218l-.634-.957a.75.75 0 0 1 .184-1.082l.937-.669a2.53 2.53 0 0 0 .18-.535l.157-.945ZM6.9 13.91a.75.75 0 0 1 .84.154l.583.583c.188.188.368.423.535.688l.669 1.252c.11.205.289.373.513.486l1.258.63a.75.75 0 0 1 .336 1.01l-.47.94a.75.75 0 0 1-1.08.256l-1.076-.718a2.529 2.529 0 0 0-2.822 0l-1.076.718a.75.75 0 0 1-1.08-.256l-.47-.94a.75.75 0 0 1 .336-1.01l1.258-.63c.224-.113.403-.28.513-.486l.669-1.252a2.534 2.534 0 0 0 .535-.688l.583-.583ZM16.275 14.07a.75.75 0 0 1 1.078-.006l.58.586c.189.19.423.37.689.537l1.252.67c.205.11.373.289.486.513l.63 1.258a.75.75 0 0 1-1.01.336l-.94-.47a.75.75 0 0 1-.256-1.08l.718-1.076a2.529 2.529 0 0 0 0-2.822l-.718-1.076a.75.75 0 0 1 .256-1.08l.94-.47a.75.75 0 0 1 1.01.336l-.63 1.258a2.534 2.534 0 0 0-.486.513l-1.252.67a2.53 2.53 0 0 0-.689.537l-.58.586ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
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
                                    <p className="font-semibold text-gray-900">{reg.playerLastName}, {reg.playerFirstName}</p>
                                    <p className="text-gray-500 text-xs">Guardian: {reg.guardian1Name} ({reg.guardian1Email})</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 text-green-800">
                                        paid
                                    </span>
                                    <button
                                        onClick={() => handleDeleteRegistration(reg)}
                                        className="opacity-0 group-hover/row:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1 rounded hover:bg-red-50"
                                        title="Delete registration"
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
                                        <p className="font-semibold text-gray-700">{reg.playerLastName}, {reg.playerFirstName}</p>
                                        <p className="text-gray-400 text-xs">Guardian: {reg.guardian1Name} ({reg.guardian1Email})</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-yellow-100 text-yellow-800">
                                            unpaid
                                        </span>
                                        <button
                                            onClick={() => handleDeleteRegistration(reg)}
                                            className="opacity-0 group-hover/row:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1 rounded hover:bg-red-50"
                                            title="Delete registration"
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
                                                    <p className="font-semibold text-gray-900">{reg.playerLastName}, {reg.playerFirstName}</p>
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

            {/* Edit Team Modal */}
            {editingTeam && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
                        <h3 className="text-xl font-bold mb-4">Edit Team Settings</h3>
                        <form onSubmit={saveTeam} className="space-y-4">
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
                                    <label className="block text-sm font-medium text-gray-700">Price (Cents)</label>
                                    <input
                                        type="number"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                        value={editingTeam.priceCents}
                                        onChange={e => setEditingTeam({ ...editingTeam, priceCents: parseInt(e.target.value || '0') })}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">${(editingTeam.priceCents / 100).toFixed(2)}</p>
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
                                    Price steps up over time: Super Early Bird → Early Bird → the regular price above. Leave a tier blank to skip it.
                                </p>

                                {/* Super Early Bird */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Super Early Bird Price (Cents)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 10000"
                                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                            value={editingTeam.superEarlyBirdPriceCents ?? ''}
                                            onChange={e => setEditingTeam({
                                                ...editingTeam,
                                                superEarlyBirdPriceCents: e.target.value === '' ? null : parseInt(e.target.value),
                                            })}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            {editingTeam.superEarlyBirdPriceCents != null
                                                ? `$${(editingTeam.superEarlyBirdPriceCents / 100).toFixed(2)}`
                                                : 'No super early bird'}
                                        </p>
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
                                        <label className="block text-sm font-medium text-gray-700">Early Bird Price (Cents)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 12000"
                                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                                            value={editingTeam.earlyBirdPriceCents ?? ''}
                                            onChange={e => setEditingTeam({
                                                ...editingTeam,
                                                earlyBirdPriceCents: e.target.value === '' ? null : parseInt(e.target.value),
                                            })}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            {editingTeam.earlyBirdPriceCents != null
                                                ? `$${(editingTeam.earlyBirdPriceCents / 100).toFixed(2)}`
                                                : 'No early bird'}
                                        </p>
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

                            <div className="flex justify-end space-x-3 mt-6 border-t pt-4">
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
