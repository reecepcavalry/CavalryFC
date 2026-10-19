import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function RegistrationPage() {
  const { teamId } = useParams();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const isWaitlist = mode === 'waitlist';

  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [team, setTeam] = useState<any>(null); // Store full team object

  useEffect(() => {
    if (teamId) {
      fetch(`${API_URL}/teams/${teamId}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.name) setTeam(data);
        })
        .catch(console.error);
    }
  }, [teamId]);

  // Form State
  const [formData, setFormData] = useState({
    playerFirstName: '',
    playerLastName: '',
    dateOfBirth: '',
    schoolGrade: '',
    primaryPosition: '',
    experienceLevel: 'New',
    medicalNotes: '',
    jerseySize: 'YM',
    shortSize: 'YM',

    guardian1FirstName: '',
    guardian1LastName: '',
    guardian1Email: '',
    guardian1Phone: '',
    guardian1Volunteer: 'No',

    guardian2FirstName: '',
    guardian2LastName: '',
    guardian2Email: '',
    guardian2Phone: '',
    guardian2Volunteer: 'No',

    emergencyContactFirstName: '',
    emergencyContactLastName: '',
    emergencyContactEmail: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',

    scheduleRequests: '',

    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',

    waiverAccepted: false,
    photoReleaseAccepted: false,
    ageVerificationAccepted: false,
    codeOfConductAccepted: false,
  });


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const type = e.target.type;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.waiverAccepted || !formData.ageVerificationAccepted || !formData.photoReleaseAccepted) {
      setError('You must accept the agreements to proceed.');
      return;
    }
    setSubmitting(true);
    setError('');

    const payload = {
      ...formData,
      teamId: Number(teamId),
      // Helper for backwards compatibility if needed, but backend expects explicit fields now
    };

    try {
      if (isWaitlist) {
        const res = await fetch(`${API_URL}/registrations/waitlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          navigate('/success?waitlist=true');
        } else {
          setError('Failed to join waitlist');
        }
      } else {
        const res = await fetch(`${API_URL}/registrations/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (data.url) {
          window.location.href = data.url; // Redirect to Stripe
        } else {
          setError('Failed to start payment session');
        }
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!team) return <div>Loading...</div>;

  // Pull the "... born <date range> ..." line out of the team description
  // so we can show the eligibility window in the header, like the homepage.
  const eligibilityLine = team.description
    ?.split('\n')
    .find((line: string) => /born/i.test(line))
    ?.replace(/^[•\s]+/, '')
    .trim();

  return (
    <div className={`min-h-screen py-12 px-4 sm:px-6 lg:px-8 ${isWaitlist ? 'bg-amber-50' : 'bg-gray-50'}`}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        <div className={`px-8 py-6 ${isWaitlist ? 'bg-amber-500' : 'bg-blue-800'}`}>
          <h1 className="text-2xl font-bold text-white mb-2">
            {isWaitlist ? 'Waitlist Registration' : 'Player Registration'}
          </h1>
          <p className="text-blue-100 font-medium opacity-90">
            {team.name} • {isWaitlist ? 'Join Waitlist' : `${team.season ?? ''} Season`.trim()}
          </p>
          {eligibilityLine && (
            <p className="text-blue-100 text-sm opacity-80 mt-1">
              {eligibilityLine}
            </p>
          )}
        </div>

        {isWaitlist && (
          <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-900 p-4 m-6 mb-0 rounded-r">
            <p className="font-bold">Team is currently full.</p>
            <p className="text-sm">You are joining the waitlist. You will <strong>not be charged</strong> today. If a spot opens up, we will contact you directly.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-8 space-y-8">

          {/* Player Info */}
          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">Player Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input required type="text" name="playerFirstName" value={formData.playerFirstName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input required type="text" name="playerLastName" value={formData.playerLastName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                <input required type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">School Grade in Spring</label>
                <select name="schoolGrade" value={formData.schoolGrade} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
                  <option value="">Select Grade</option>
                  <option value="K">Kindergarten</option>
                  <option value="1">1st Grade</option>
                  <option value="2">2nd Grade</option>
                  <option value="3">3rd Grade</option>
                  <option value="4">4th Grade</option>
                  <option value="5">5th Grade</option>
                  <option value="6">6th Grade</option>
                  <option value="7">7th Grade</option>
                  <option value="8">8th Grade</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Medical Notes / Allergies</label>
                <textarea name="medicalNotes" value={formData.medicalNotes} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" rows={2}></textarea>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Schedule Requests / Conflicts</label>
                <textarea name="scheduleRequests" value={formData.scheduleRequests} onChange={handleChange} placeholder="Please list any potential schedule conflicts or preferences..." className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" rows={2}></textarea>
              </div>

              {/* Address Moved Here */}
              <div className="md:col-span-2 pt-4 border-t mt-2">
                <h4 className="text-sm font-bold text-gray-900 mb-2">Home Address</h4>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Street Address</label>
                <input required type="text" name="street1" value={formData.street1} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">City, State, Zip</label>
                <div className="flex gap-2">
                  <input required type="text" placeholder="City" name="city" value={formData.city} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                  <input required type="text" placeholder="State" name="state" value={formData.state} onChange={handleChange} className="mt-1 block w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                  <input required type="text" placeholder="Zip" name="zip" value={formData.zip} onChange={handleChange} className="mt-1 block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
                </div>
              </div>

            </div>
          </section>

          {/* Guardian Info */}
          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">Guardian 1 Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input required type="text" name="guardian1FirstName" value={formData.guardian1FirstName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input required type="text" name="guardian1LastName" value={formData.guardian1LastName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Email (for receipt)</label>
                <input required type="email" name="guardian1Email" value={formData.guardian1Email} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div className="md:col-span-2 mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Does this parent have any interest in volunteer coaching?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="guardian1Volunteer" value="Yes" checked={formData.guardian1Volunteer === 'Yes'} onChange={handleChange} className="text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="guardian1Volunteer" value="No" checked={formData.guardian1Volunteer === 'No'} onChange={handleChange} className="text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">No</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="guardian1Volunteer" value="Maybe" checked={formData.guardian1Volunteer === 'Maybe'} onChange={handleChange} className="text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">Maybe</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Guardian 2 (Always visible now, Optional) */}
          <section>
            <div className="flex items-center justify-between pb-2 border-b mb-4">
              <h3 className="text-lg font-bold text-gray-900">Guardian 2 Information</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-gray-200 p-4 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input type="text" name="guardian2FirstName" value={formData.guardian2FirstName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input type="text" name="guardian2LastName" value={formData.guardian2LastName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" name="guardian2Email" value={formData.guardian2Email} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input type="tel" name="guardian2Phone" value={formData.guardian2Phone} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>

              <div className="md:col-span-2 mt-2 pt-2 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-1">Does this parent have any interest in volunteer coaching?</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="guardian2Volunteer" value="Yes" checked={formData.guardian2Volunteer === 'Yes'} onChange={handleChange} className="text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="guardian2Volunteer" value="No" checked={formData.guardian2Volunteer === 'No'} onChange={handleChange} className="text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">No</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="guardian2Volunteer" value="Maybe" checked={formData.guardian2Volunteer === 'Maybe'} onChange={handleChange} className="text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm text-gray-700">Maybe</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Emergency Contact */}
          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">Emergency Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input required type="text" name="emergencyContactFirstName" value={formData.emergencyContactFirstName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input required type="text" name="emergencyContactLastName" value={formData.emergencyContactLastName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Relation to Player</label>
                <input required type="text" name="emergencyContactRelation" value={formData.emergencyContactRelation} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input required type="tel" name="emergencyContactPhone" value={formData.emergencyContactPhone} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input required type="email" name="emergencyContactEmail" value={formData.emergencyContactEmail} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" />
              </div>
            </div>
          </section>

          {/* Address Section Removed (Moved to Player) */}

          {/* Uniform */}
          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">Uniform Sizes</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Jersey Size</label>
                <select required name="jerseySize" value={formData.jerseySize} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
                  <option value="">Select</option>
                  <option value="YS">Youth Small</option>
                  <option value="YM">Youth Medium</option>
                  <option value="YL">Youth Large</option>
                  <option value="AS">Adult Small</option>
                  <option value="AM">Adult Medium</option>
                  <option value="AL">Adult Large</option>
                  <option value="AXL">Adult XL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Short Size</label>
                <select required name="shortSize" value={formData.shortSize} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
                  <option value="">Select</option>
                  <option value="YS">Youth Small</option>
                  <option value="YM">Youth Medium</option>
                  <option value="YL">Youth Large</option>
                  <option value="AS">Adult Small</option>
                  <option value="AM">Adult Medium</option>
                  <option value="AL">Adult Large</option>
                  <option value="AXL">Adult XL</option>
                </select>
              </div>
            </div>
          </section>

          {/* Waivers & Agreements */}
          <section className="bg-gray-50 p-6 rounded-lg space-y-4 text-sm text-gray-700">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Agreements</h3>

            <div className="flex gap-3 items-start">
              <input required type="checkbox" name="waiverAccepted" checked={formData.waiverAccepted} onChange={handleChange} className="mt-1 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <label>
                <strong>Liability Waiver:</strong> I agree that soccer is a sport that carries inherent injury risk, and that Cavalry Booster Club is not liable for injuries incurred in the regular course of play.
              </label>
            </div>

            <div className="flex gap-3 items-start">
              <input required type="checkbox" name="ageVerificationAccepted" checked={formData.ageVerificationAccepted} onChange={handleChange} className="mt-1 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <label>
                <strong>Age Verification:</strong> I attest that the birthday on this form is accurate, and that I will be expected to furnish proof of age at a later date.
              </label>
            </div>

            <div className="flex gap-3 items-start">
              <input required type="checkbox" name="photoReleaseAccepted" checked={formData.photoReleaseAccepted} onChange={handleChange} className="mt-1 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <label>
                <strong>Photo Release:</strong> I agree that photos of my child may be used and sent to families via social media.
              </label>
            </div>
          </section>

          {error && <div className="text-red-600 text-sm font-bold text-center">{error}</div>}

          <button
            disabled={submitting}
            type="submit"
            className={`w-full py-4 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.99] text-lg
                ${submitting ? 'opacity-70 cursor-wait' : ''}
                ${mode === 'waitlist' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}
            `}
          >
            {submitting ? 'Processing...' : (isWaitlist ? 'Join Waitlist' : `Proceed to Payment ($${(team.priceCents / 100).toFixed(2)})`)}
          </button>
        </form>
      </div>
    </div>
  );
}
