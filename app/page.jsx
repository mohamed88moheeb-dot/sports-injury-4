'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabaseClient';
import {
  injuryRegions,
  grades,
  sports,
  movements,
  equipmentOptions,
  mechanisms,
  symptomTypes,
  phases,
  exerciseBank,
  redFlagQuestions,
  muscleComponents
} from '../data/rehabKnowledge';

const emptyAssessment = {
  primaryRegion: 'hamstring',
  exactArea: '',
  secondaryRegions: [],
  grade: 'grade1',
  mechanism: 'Sudden sprint',
  symptoms: [],
  sports: [],
  movements: [],
  equipment: ['Bodyweight'],
  painRest: 1,
  painWalking: 2,
  painSport: 5,
  daysSince: 1,
  story: '',
  redFlags: []
};

const gradeLabels = Object.fromEntries(grades.map((g) => [g.id, g.name]));
const regionLabels = Object.fromEntries(injuryRegions.map((r) => [r.id, r.name]));

export default function Page() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [assessment, setAssessment] = useState(emptyAssessment);
  const [profile, setProfile] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [saving, setSaving] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState([
    { role: 'coach', text: 'Tell me what you are thinking about today’s training or your return to sport. I will keep the plan safe and realistic.' }
  ]);

  useEffect(() => {
    if (!hasSupabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !hasSupabase) return;
    loadRemoteProfile(user.id);
  }, [user]);

  useEffect(() => {
    if (hasSupabase && user) return;
    const cached = localStorage.getItem('injury-recovery-local-profile');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setProfile(parsed.profile || null);
        setCheckins(parsed.checkins || []);
      } catch {}
    }
  }, [user]);

  async function loadRemoteProfile(userId) {
    const { data, error } = await supabase
      .from('recovery_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) {
      setProfile(data.profile_data?.profile || null);
      if (data.profile_data?.assessment) data.profile_data.assessment = { ...emptyAssessment, ...data.profile_data.assessment };
      setCheckins(data.profile_data?.checkins || []);
      setAssessment(data.profile_data?.assessment || emptyAssessment);
    }
  }

  async function saveState(nextProfile = profile, nextCheckins = checkins, nextAssessment = assessment) {
    if (!nextProfile) return;
    const payload = { profile: nextProfile, checkins: nextCheckins, assessment: nextAssessment, updatedAt: new Date().toISOString() };
    if (hasSupabase && user) {
      setSaving(true);
      await supabase.from('recovery_profiles').upsert({ user_id: user.id, profile_data: payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      setSaving(false);
    } else {
      localStorage.setItem('injury-recovery-local-profile', JSON.stringify(payload));
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setAuthMessage('');
    if (!hasSupabase) {
      setAuthMessage('Supabase is not connected yet. Add your Vercel environment variables first.');
      return;
    }
    const action = authMode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await action({ email: authForm.email, password: authForm.password });
    if (error) setAuthMessage(error.message);
    else setAuthMessage(authMode === 'signup' ? 'Account created. Check your email if confirmation is enabled.' : 'Signed in successfully.');
  }

  function toggleArray(field, value) {
    setAssessment((prev) => {
      const exists = prev[field].includes(value);
      return { ...prev, [field]: exists ? prev[field].filter((x) => x !== value) : [...prev[field], value] };
    });
  }

  function generateProfile() {
    const nextProfile = buildProfile(assessment);
    setProfile(nextProfile);
    setCheckins([]);
    setActiveTab('dashboard');
    saveState(nextProfile, [], assessment);
  }

  function completeDay(phaseIndex, weekIndex, dayIndex) {
    if (!profile) return;
    const next = structuredClone(profile);
    const day = next.plan[phaseIndex].weeks[weekIndex].days[dayIndex];
    day.completed = !day.completed;
    next.progress = calculateProgress(next.plan);
    next.today = findToday(next.plan);
    setProfile(next);
    saveState(next, checkins, assessment);
  }

  function addCheckin(status) {
    if (!profile) return;
    const entry = { id: Date.now(), date: new Date().toLocaleDateString(), ...status };
    const nextCheckins = [entry, ...checkins].slice(0, 12);
    const nextProfile = { ...profile, aiStatus: getStatusMessage(status, profile), lastCheckin: entry };
    setCheckins(nextCheckins);
    setProfile(nextProfile);
    saveState(nextProfile, nextCheckins, assessment);
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    const response = coachResponse(chatInput, profile, assessment);
    setChat((prev) => [...prev, { role: 'user', text: chatInput }, { role: 'coach', text: response }]);
    setChatInput('');
  }

  const dashboardStats = useMemo(() => profile ? calculateProgress(profile.plan) : null, [profile]);

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand-lockup">
          <BodyPictogram type="logo" />
          <div>
            <p className="eyebrow">Personal recovery system</p>
            <h1>Injury Recovery</h1>
          </div>
        </div>
        <div className="account-pill">
          <span className={hasSupabase ? 'dot online' : 'dot offline'} />
          {user ? user.email : hasSupabase ? 'Not signed in' : 'Supabase setup needed'}
        </div>
      </header>

      {!user && <AuthCard authMode={authMode} setAuthMode={setAuthMode} authForm={authForm} setAuthForm={setAuthForm} handleAuth={handleAuth} authMessage={authMessage} />}

      {/* ===== HERO / DASHBOARD PREVIEW ===== */}
      <section className="app-section app-section-light">
        <div className="section-header">
          <h2 className="section-title">Evidence-driven beta</h2>
          <p className="section-description">
            Build a plan around the injury you actually have. Answer the assessment once. The app estimates your recovery lane, creates a phased day-by-day plan, saves your progress, and pushes back when returning too early is risky.
          </p>
        </div>
        <div className="hero-panel">
          <BodyPictogram type={assessment.primaryRegion} />
          <div>
            <span className="small-label">Current focus</span>
            <strong>{regionLabels[assessment.primaryRegion]}</strong>
            <span>{gradeLabels[assessment.grade]}</span>
          </div>
        </div>
      </section>

      {/* ===== TABS ===== */}
      <nav className="tabs">
        {['dashboard', 'assessment', 'plan', 'checkin', 'coach'].map((tab) => (
          <button key={tab} className={activeTab === tab ? 'tab active' : 'tab'} onClick={() => setActiveTab(tab)}>
            {tab === 'dashboard' ? 'Home' : tab === 'assessment' ? 'Assessment' : tab === 'plan' ? 'Plan' : tab === 'checkin' ? 'Check-in' : 'Coach'}
          </button>
        ))}
      </nav>

      {/* ===== ACTIVE TAB CONTENT ===== */}
      {activeTab === 'dashboard' && <Dashboard profile={profile} stats={dashboardStats} setActiveTab={setActiveTab} saving={saving} />}

      {activeTab === 'assessment' &&
        <section className="app-section app-section-soft">
          <Assessment assessment={assessment} setAssessment={setAssessment} toggleArray={toggleArray} generateProfile={generateProfile} />
        </section>
      }

      {activeTab === 'plan' &&
        <section className="app-section app-section-light">
          <PlanView profile={profile} completeDay={completeDay} setActiveTab={setActiveTab} />
        </section>
      }

      {activeTab === 'checkin' &&
        <section className="app-section app-section-soft">
          <Checkin addCheckin={addCheckin} checkins={checkins} />
        </section>
      }

      {activeTab === 'coach' &&
        <section className="app-section app-section-dark">
          <Coach chat={chat} chatInput={chatInput} setChatInput={setChatInput} sendChat={sendChat} />
        </section>
      }
    </main>
  );
}

// AuthCard, Dashboard, Assessment, PlanView, Checkin, Coach, MuscleSelector, MultiSelect, Field, Slider, Metric, BodyPictogram
// ... all existing functions remain unchanged
