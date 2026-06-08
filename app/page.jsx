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

      <section className="hero-card app-section app-section-light">
        <div>
          <p className="eyebrow">Evidence-driven beta</p>
          <h2>Build a plan around the injury you actually have.</h2>
          <p className="hero-copy">Answer the assessment once. The app estimates your recovery lane, creates a phased day-by-day plan, saves your progress, and pushes back when returning too early is risky.</p>
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

      <nav className="tabs">
        {['dashboard', 'assessment', 'plan', 'checkin', 'coach'].map((tab) => (
          <button key={tab} className={activeTab === tab ? 'tab active' : 'tab'} onClick={() => setActiveTab(tab)}>
            {tab === 'dashboard' ? 'Home' : tab === 'assessment' ? 'Assessment' : tab === 'plan' ? 'Plan' : tab === 'checkin' ? 'Check-in' : 'Coach'}
          </button>
        ))}
      </nav>

      {activeTab === 'dashboard' && <Dashboard profile={profile} stats={dashboardStats} setActiveTab={setActiveTab} saving={saving} />}
      {activeTab === 'assessment' && <Assessment assessment={assessment} setAssessment={setAssessment} toggleArray={toggleArray} generateProfile={generateProfile} />}
      {activeTab === 'plan' && <PlanView profile={profile} completeDay={completeDay} setActiveTab={setActiveTab} />}
      {activeTab === 'checkin' && <Checkin addCheckin={addCheckin} checkins={checkins} />}
      {activeTab === 'coach' && <Coach chat={chat} chatInput={chatInput} setChatInput={setChatInput} sendChat={sendChat} />}
    </main>
  );
}

function AuthCard({ authMode, setAuthMode, authForm, setAuthForm, handleAuth, authMessage }) {
  return (
    <section className="auth-card app-section app-section-soft">
      <div>
        <p className="eyebrow">Account access</p>
        <h3>{authMode === 'signin' ? 'Sign in to save progress' : 'Create a tester account'}</h3>
        <p>Accounts use Supabase. Progress syncs across devices once your database is connected.</p>
      </div>
      <form onSubmit={handleAuth} className="auth-form">
        <input type="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
        <input type="password" placeholder="Password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
        <button className="primary-btn" type="submit">{authMode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button className="text-btn" type="button" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>
          {authMode === 'signin' ? 'Create a new account' : 'I already have an account'}
        </button>
        {authMessage && <p className="form-note">{authMessage}</p>}
      </form>
    </section>
  );
}

function Dashboard({ profile, stats, setActiveTab, saving }) {
  if (!profile) {
    return (
      <section className="empty-state app-section app-section-light">
        <BodyPictogram type="assessment" />
        <h2>Start with the assessment.</h2>
        <p>Your home dashboard will appear here after the app builds your recovery plan.</p>
        <button className="primary-btn" onClick={() => setActiveTab('assessment')}>Open assessment</button>
      </section>
    );
  }

  return (
    <section className="dashboard-grid">
      <div className="summary-card span-2">
        <div className="summary-top">
          <div>
            <p className="eyebrow">Current injury</p>
            <h2>{profile.regionName}</h2>
            <p>{profile.gradeName} · {profile.mechanism}</p>
          </div>
          <BodyPictogram type={profile.primaryRegion} />
        </div>
        <div className="metric-row">
          <Metric label="Expected return" value={profile.returnRange} />
          <Metric label="Exact area" value={profile.exactAreaName || 'General area'} />
          <Metric label="Current phase" value={profile.today?.phaseLabel || 'Not started'} />
          <Metric label="Saved" value={saving ? 'Saving' : 'Synced'} />
        </div>
        <div className="progress-track"><span style={{ width: `${stats.percent}%` }} /></div>
        <p className="progress-caption">{stats.completedDays} of {stats.totalDays} days completed · {stats.percent}%</p>
      </div>

      <div className="today-card span-2">
        <p className="eyebrow">Today</p>
        <h3>{profile.today?.title || 'Open the plan to start'}</h3>
        <p>{profile.today?.summary || 'Your session summary will appear here.'}</p>
        <div className="today-actions">
          <button className="primary-btn" onClick={() => setActiveTab('plan')}>Open today’s plan</button>
          <button className="secondary-btn" onClick={() => setActiveTab('checkin')}>Log check-in</button>
        </div>
      </div>

      <div className="compact-card">
        <span className="small-label">Completed phases</span>
        <strong>{stats.completedPhases} / {stats.totalPhases}</strong>
      </div>
      <div className="compact-card">
        <span className="small-label">Completed weeks</span>
        <strong>{stats.completedWeeks} / {stats.totalWeeks}</strong>
      </div>
      <div className="compact-card span-2">
        <span className="small-label">Recovery coach note</span>
        <p>{profile.aiStatus}</p>
      </div>
    </section>
  );
}

function Assessment({ assessment, setAssessment, toggleArray, generateProfile }) {
  return (
    <section className="assessment-grid app-section app-section-soft">
      <div className="section-card span-2">
        <p className="eyebrow">Step 1</p>
        <h2>Injury profile</h2>
        <div className="form-grid">
          <Field label="Main area">
            <select value={assessment.primaryRegion} onChange={(e) => setAssessment({ ...assessment, primaryRegion: e.target.value, exactArea: '' })}>
              {injuryRegions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Estimated grade">
            <select value={assessment.grade} onChange={(e) => setAssessment({ ...assessment, grade: e.target.value })}>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="How it happened">
            <select value={assessment.mechanism} onChange={(e) => setAssessment({ ...assessment, mechanism: e.target.value })}>
              {mechanisms.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Days since injury">
            <input type="number" min="0" value={assessment.daysSince} onChange={(e) => setAssessment({ ...assessment, daysSince: Number(e.target.value) })} />
          </Field>
        </div>
        <MuscleSelector assessment={assessment} setAssessment={setAssessment} />
        <MultiSelect title="Secondary areas" items={injuryRegions.filter((r) => r.id !== assessment.primaryRegion).map((r) => r.name)} selected={assessment.secondaryRegions} onToggle={(v) => toggleArray('secondaryRegions', v)} />
        <MultiSelect title="What are you feeling?" items={symptomTypes} selected={assessment.symptoms} onToggle={(v) => toggleArray('symptoms', v)} />
      </div>

      <div className="section-card span-2">
        <p className="eyebrow">Step 2</p>
        <h2>Sport profile</h2>
        <MultiSelect title="What sports do you play?" items={sports} selected={assessment.sports} onToggle={(v) => toggleArray('sports', v)} />
        <MultiSelect title="What does your sport demand?" items={movements} selected={assessment.movements} onToggle={(v) => toggleArray('movements', v)} />
        <MultiSelect title="What equipment do you have access to?" items={equipmentOptions} selected={assessment.equipment} onToggle={(v) => toggleArray('equipment', v)} />
      </div>

      <div className="section-card span-2">
        <p className="eyebrow">Step 3</p>
        <h2>Pain and context</h2>
        <div className="slider-grid">
          <Slider label="Pain at rest" value={assessment.painRest} onChange={(v) => setAssessment({ ...assessment, painRest: v })} />
          <Slider label="Pain walking / stairs" value={assessment.painWalking} onChange={(v) => setAssessment({ ...assessment, painWalking: v })} />
          <Slider label="Pain if you try sport movement" value={assessment.painSport} onChange={(v) => setAssessment({ ...assessment, painSport: v })} />
        </div>
        <textarea placeholder="Describe the story in your own words. Example: I felt a pull while sprinting, pain is high when I lengthen the leg, walking is okay." value={assessment.story} onChange={(e) => setAssessment({ ...assessment, story: e.target.value })} />
      </div>

      <div className="section-card span-2 redflag-card">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Optional safety screen</p>
            <h2>Red flags</h2>
            <p className="short-copy">Select only what applies. These answers help the app avoid unsafe rehab suggestions.</p>
          </div>
        </div>
        <div className="redflag-grid">
          {redFlagQuestions.map((q) => (
            <button key={q} className={assessment.redFlags.includes(q) ? 'tiny-check active' : 'tiny-check'} onClick={() => toggleArray('redFlags', q)} type="button">
              {q}
            </button>
          ))}
        </div>
      </div>

      <button className="primary-btn generate-btn" onClick={generateProfile}>Build my recovery plan</button>
    </section>
  );
}

function PlanView({ profile, completeDay, setActiveTab }) {
  const [openPhase, setOpenPhase] = useState(0);
  const [openWeek, setOpenWeek] = useState('0-0');
  const [openDay, setOpenDay] = useState('0-0-0');
  const [openAlt, setOpenAlt] = useState({});

  if (!profile) return <section className="empty-state"><h2>No plan yet.</h2><p>Complete the assessment to create your day-by-day plan.</p><button className="primary-btn" onClick={() => setActiveTab('assessment')}>Open assessment</button></section>;

  return (
    <section className="plan-shell app-section app-section-light">
      <div className="plan-intro">
        <p className="eyebrow">Recovery plan</p>
        <h2>{profile.regionName}</h2>
        <p>{profile.planNote}</p>
      </div>
      {profile.plan.map((phase, pIndex) => (
        <article className={`phase-card ${phase.accent}`} key={phase.id}>
          <button className="phase-head" onClick={() => setOpenPhase(openPhase === pIndex ? null : pIndex)}>
            <div>
              <span>{phase.name}</span>
              <h3>{phase.label}</h3>
              <p>{phase.goal}</p>
            </div>
            <strong>{phase.weeks.length} weeks</strong>
          </button>
          {openPhase === pIndex && (
            <div className="phase-body">
              <p className="phase-description">{phase.description}</p>
              {phase.weeks.map((week, wIndex) => {
                const weekKey = `${pIndex}-${wIndex}`;
                return (
                  <div className="week-card" key={weekKey}>
                    <button className="week-head" onClick={() => setOpenWeek(openWeek === weekKey ? null : weekKey)}>
                      <div><strong>{week.title}</strong><span>{week.focus}</span></div>
                      <small>{week.days.filter((d) => d.completed).length}/{week.days.length} done</small>
                    </button>
                    {openWeek === weekKey && (
                      <div className="days-list">
                        {week.days.map((day, dIndex) => {
                          const dayKey = `${pIndex}-${wIndex}-${dIndex}`;
                          return (
                            <div className={day.completed ? 'day-card completed' : 'day-card'} key={dayKey}>
                              <button className="day-head" onClick={() => setOpenDay(openDay === dayKey ? null : dayKey)}>
                                <div><strong>{day.title}</strong><span>{day.summary}</span></div>
                                <small>{day.load}</small>
                              </button>
                              {openDay === dayKey && (
                                <div className="session-card">
                                  <div className="session-header">
                                    <div>
                                      <p className="eyebrow">Session</p>
                                      <h4>{day.sessionTitle}</h4>
                                    </div>
                                    <button className={day.completed ? 'secondary-btn done' : 'secondary-btn'} onClick={() => completeDay(pIndex, wIndex, dIndex)}>
                                      {day.completed ? 'Mark incomplete' : 'Mark complete'}
                                    </button>
                                  </div>
                                  {day.recovery?.length > 0 && (
                                    <div className="recovery-box">
                                      {day.recovery.map((item, i) => <p key={i}>{item}</p>)}
                                    </div>
                                  )}
                                  {day.mobility?.length > 0 && (
                                    <div className="mobility-strip">
                                      <div><span className="field-label">Mobility / warm-up</span><p>These do not count toward the 12 main rehab exercises.</p></div>
                                      <div className="mobility-list">
                                        {day.mobility.map((m, i) => <span key={i}>{m.name} · {m.prescription}</span>)}
                                      </div>
                                    </div>
                                  )}
                                  <div className="session-blocks">
                                    {day.exercises.map((ex, eIndex) => {
                                      const altKey = `${dayKey}-${eIndex}`;
                                      return (
                                        <div className="exercise-card" key={altKey}>
                                          <div className="video-placeholder">
                                            <span>Video demo placeholder</span>
                                            <small>{ex.video}</small>
                                          </div>
                                          <div className="exercise-main">
                                            <div className="exercise-title-row"><h5>{ex.name}</h5><span>{ex.intensity}</span></div>
                                            <div className="exercise-details">
                                              <span>{ex.prescription}</span>
                                              <span>{ex.equipment}</span>
                                            </div>
                                            <p>{ex.cue}</p>
                                            <button className="alt-btn" onClick={() => setOpenAlt({ ...openAlt, [altKey]: !openAlt[altKey] })}>
                                              Too hard? Show easier option
                                            </button>
                                            {openAlt[altKey] && <div className="alternative-box"><strong>{ex.alternative.name}</strong><span>{ex.alternative.prescription}</span><p>{ex.alternative.cue}</p></div>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {day.exercises.length === 0 && <div className="rest-visual"><BodyPictogram type="assessment" /><p>Complete rest today. Recovery is the training stimulus.</p></div>}
                                  <div className="day-rule"><strong>Progress rule:</strong> {day.rule}</div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function Checkin({ addCheckin, checkins }) {
  const [status, setStatus] = useState({ pain: 2, confidence: 60, swelling: 'No change', response: 'Stable', notes: '' });
  return (
    <section className="checkin-grid app-section app-section-soft">
      <div className="section-card">
        <p className="eyebrow">Daily check-in</p>
        <h2>How did the injury respond?</h2>
        <Slider label="Pain today" value={status.pain} onChange={(v) => setStatus({ ...status, pain: v })} />
        <Slider label="Confidence to move" value={status.confidence} max={100} onChange={(v) => setStatus({ ...status, confidence: v })} />
        <Field label="Swelling / tightness">
          <select value={status.swelling} onChange={(e) => setStatus({ ...status, swelling: e.target.value })}>
            <option>No change</option><option>Better</option><option>Worse</option><option>New swelling</option>
          </select>
        </Field>
        <Field label="Next-day response">
          <select value={status.response} onChange={(e) => setStatus({ ...status, response: e.target.value })}>
            <option>Stable</option><option>Better than yesterday</option><option>Sore but settled</option><option>Worse than yesterday</option>
          </select>
        </Field>
        <textarea placeholder="Notes" value={status.notes} onChange={(e) => setStatus({ ...status, notes: e.target.value })} />
        <button className="primary-btn" onClick={() => addCheckin(status)}>Save check-in</button>
      </div>
      <div className="section-card">
        <p className="eyebrow">History</p>
        <h2>Recent entries</h2>
        <div className="history-list">
          {checkins.length === 0 && <p>No check-ins yet.</p>}
          {checkins.map((c) => <div className="history-item" key={c.id}><strong>{c.date}</strong><span>Pain {c.pain}/10 · Confidence {c.confidence}%</span><p>{c.response} · {c.swelling}</p></div>)}
        </div>
      </div>
    </section>
  );
}

function Coach({ chat, chatInput, setChatInput, sendChat }) {
  return (
    <section className="coach-card app-section app-section-dark">
      <p className="eyebrow">Recovery coach</p>
      <h2>Ask about pain, training, or returning to sport.</h2>
      <div className="chat-window">
        {chat.map((m, i) => <div key={i} className={m.role === 'user' ? 'chat-bubble user' : 'chat-bubble coach'}>{m.text}</div>)}
      </div>
      <div className="chat-input">
        <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Example: I feel good. Can I sprint today?" onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
        <button className="primary-btn" onClick={sendChat}>Send</button>
      </div>
    </section>
  );
}


function MuscleSelector({ assessment, setAssessment }) {
  const parts = muscleComponents[assessment.primaryRegion] || [];
  const selected = parts.find((p) => p.id === assessment.exactArea);
  return (
    <div className="muscle-selector">
      <div className="muscle-map-panel">
        <BodyPictogram type={assessment.primaryRegion} selectedArea={assessment.exactArea} detailed />
      </div>
      <div className="muscle-select-content">
        <span className="field-label">Where exactly do you feel it?</span>
        <p className="micro-copy">Pick the closest area. The plan will adjust loading speed, caution level, and exercise emphasis.</p>
        <div className="component-grid">
          {parts.map((part, idx) => (
            <button
              type="button"
              key={part.id}
              className={assessment.exactArea === part.id ? 'component-chip active' : 'component-chip'}
              onClick={() => setAssessment({ ...assessment, exactArea: part.id })}
            >
              <span>{String(idx + 1).padStart(2, '0')}</span>
              <strong>{part.name}</strong>
            </button>
          ))}
        </div>
        {selected && <p className="selected-area-note">{selected.detail}</p>}
      </div>
    </div>
  );
}

function MultiSelect({ title, items, selected, onToggle }) {
  return <div className="multi-select"><span className="field-label">{title}</span><div className="pill-grid">{items.map((item) => <button type="button" key={item} className={selected.includes(item) ? 'select-pill active' : 'select-pill'} onClick={() => onToggle(item)}>{item}</button>)}</div></div>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Slider({ label, value, onChange, max = 10 }) {
  return <label className="slider"><span>{label}<strong>{value}{max === 10 ? '/10' : '%'}</strong></span><input type="range" min="0" max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function BodyPictogram({ type, selectedArea = '', detailed = false }) {
  const region = type || 'assessment';
  const highlights = {
    hamstring: { x: 55, y: 75, w: 14, h: 30 },
    quadriceps: { x: 35, y: 72, w: 14, h: 30 },
    calf_shin: { x: 36, y: 108, w: 14, h: 30 },
    adductor_groin: { x: 45, y: 68, w: 18, h: 18 },
    it_band: { x: 31, y: 72, w: 8, h: 38 },
    abdomen: { x: 39, y: 38, w: 22, h: 26 },
    ankle: { x: 35, y: 135, w: 30, h: 8 },
    knee: { x: 33, y: 98, w: 34, h: 9 },
    logo: { x: 38, y: 38, w: 24, h: 72 },
    assessment: { x: 33, y: 35, w: 34, h: 100 }
  };
  const h = highlights[region] || highlights.assessment;
  const componentCount = (muscleComponents[region] || []).length;
  return (
    <svg className={detailed ? 'body-icon detail' : 'body-icon'} viewBox="0 0 100 150" role="img" aria-label="Body area pictogram">
      <defs>
        <linearGradient id={`muscleGrad-${region}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(47,55,70,.22)" />
          <stop offset="100%" stopColor="rgba(255,255,255,.05)" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="13" r="8" className="outline-fill" />
      <path className="outline-fill" d="M41 25h18c3 8 6 20 7 34l-7 28 7 48H55l-5-39-5 39H34l7-48-7-28c1-14 4-26 7-34Z" />
      <path className="outline-line" d="M41 29 27 58 23 86M59 29l14 29 4 28M43 136h-9M57 136h9" />
      <rect x={h.x} y={h.y} width={h.w} height={h.h} rx="6" className="highlight" />
      {detailed && componentCount > 0 && Array.from({ length: componentCount }).map((_, i) => (
        <g key={i} className={selectedArea ? 'component-mark muted' : 'component-mark'}>
          <circle cx={h.x + h.w + 8} cy={h.y + 6 + i * 8} r="2.3" />
          <text x={h.x + h.w + 13} y={h.y + 8 + i * 8}>{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

function buildProfile(a) {
  const region = injuryRegions.find((r) => r.id === a.primaryRegion) || injuryRegions[0];
  const grade = grades.find((g) => g.id === a.grade) || grades[1];
  const exactArea = (muscleComponents[a.primaryRegion] || []).find((part) => part.id === a.exactArea);
  const isHighRisk = a.redFlags.length > 0 || a.grade === 'grade3' || a.symptoms.includes('Instability / giving way') || a.symptoms.includes('Locking / catching');
  const returnRange = region.returnRanges[a.grade] || region.returnRanges.unknown || 'varies';
  const plan = buildPlan(a, region, grade, isHighRisk);
  const progress = calculateProgress(plan);
  return {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    primaryRegion: a.primaryRegion,
    regionName: region.name,
    exactAreaName: exactArea?.name || 'General area',
    gradeName: grade.name,
    mechanism: a.mechanism,
    returnRange: isHighRisk ? `${returnRange} · review recommended` : returnRange,
    plan,
    progress,
    today: findToday(plan),
    aiStatus: isHighRisk ? 'Your answers include higher-risk signs. Use the early-care plan only and arrange medical review before harder loading.' : 'Start with controlled work. Progress only when pain stays low during the session and the next morning feels stable.',
    planNote: buildPlanNote(a, isHighRisk, exactArea)
  };
}

function buildPlan(a, region, grade, isHighRisk) {
  const lane = exerciseBank[a.primaryRegion] || exerciseBank.hamstring;
  const selectedPhases = isHighRisk ? phases.slice(0, 2) : phases;
  return selectedPhases.map((phase, pIndex) => {
    const weeksCount = Math.max(1, phase.baseWeeks[a.grade] || 1);
    const weeks = Array.from({ length: weeksCount }, (_, wIndex) => buildWeek(phase, lane, a, pIndex, wIndex, weeksCount, grade));
    return { ...phase, weeks };
  });
}

function buildWeek(phase, lane, a, pIndex, wIndex, weeksCount, grade) {
  const focus = weekFocus(phase.id, wIndex, weeksCount, a);
  const days = Array.from({ length: 7 }, (_, dIndex) => buildDay(phase, lane, a, pIndex, wIndex, dIndex, grade));
  return { title: `Week ${wIndex + 1}`, focus, days };
}

function buildDay(phase, lane, a, pIndex, wIndex, dIndex, grade) {
  const isFullRest = dIndex === 6;
  const isActiveRecovery = dIndex === 3;
  const pool = lane[phase.id] || lane.protect;
  const mobility = buildMobility(phase.id, a, dIndex);

  if (isFullRest) {
    return {
      title: `Day ${dIndex + 1}`,
      sessionTitle: 'Full rest day',
      summary: 'No structured rehab today. Let the tissue adapt.',
      load: 'Rest',
      mobility: [],
      exercises: [],
      recovery: ['Sleep, hydration, easy walking only if comfortable.', 'Do not test speed, stretching tolerance, or sport movements today.'],
      completed: false,
      rule: 'A full rest day is still part of the plan. Do not make up missed heavy work today.'
    };
  }

  if (isActiveRecovery) {
    return {
      title: `Day ${dIndex + 1}`,
      sessionTitle: 'Active recovery day',
      summary: activeRecoverySummary(a, phase.id),
      load: 'Active recovery',
      mobility,
      exercises: buildActiveRecovery(a, phase.id, dIndex).map((ex, idx) => adjustExercise(ex, phase, a, wIndex, dIndex, idx)),
      recovery: [],
      completed: false,
      rule: 'This day should make you feel better, not trained. Keep it easy and stop if symptoms rise.'
    };
  }

  const target = targetExerciseCount(phase.id, a.grade, wIndex, dIndex);
  const chosen = buildSessionExercises(pool, phase, a, wIndex, dIndex, target).map((ex, idx) => adjustExercise(ex, phase, a, wIndex, dIndex, idx));
  return {
    title: `Day ${dIndex + 1}`,
    sessionTitle: sessionTitle(phase.id, dIndex),
    summary: summaryFor(phase.id, a),
    load: `${phase.intensity} · ${estimateDuration(phase.id, chosen.length)}`,
    mobility,
    exercises: chosen.slice(0, 12),
    recovery: [],
    completed: false,
    rule: ruleFor(phase.id, a)
  };
}


function targetExerciseCount(phaseId, gradeId, weekIndex, dayIndex) {
  const base = {
    protect: [4, 4, 5, 4, 5, 5],
    restore: [6, 6, 7, 6, 7, 8],
    capacity: [8, 8, 9, 8, 10, 10],
    speed: [8, 9, 9, 8, 10, 11],
    return: [9, 10, 10, 9, 11, 12]
  }[phaseId] || [5, 5, 6, 5, 6, 6];
  let count = base[Math.min(dayIndex, base.length - 1)] + Math.min(weekIndex, 2);
  if (gradeId === 'overload') count -= phaseId === 'protect' ? 1 : 0;
  if (gradeId === 'grade2' || gradeId === 'unknown') count -= phaseId === 'speed' || phaseId === 'return' ? 2 : 1;
  if (gradeId === 'grade3') count = phaseId === 'protect' ? 4 : 5;
  return Math.max(3, Math.min(12, count));
}

function buildSessionExercises(pool, phase, a, wIndex, dIndex, target) {
  const regionAdds = regionalAddOns(a.primaryRegion, phase.id, a.exactArea);
  const phaseAdds = phaseAddOns(phase.id, a);
  const sportAdds = sportDemandAddOns(phase.id, a);
  const equipmentAdds = equipmentAddOns(phase.id, a);
  const combined = [...rotate(pool, dIndex + wIndex), ...rotate(regionAdds, dIndex), ...rotate(phaseAdds, wIndex + dIndex), ...rotate(sportAdds, dIndex), ...rotate(equipmentAdds, wIndex)];
  return uniqueByName(combined).slice(0, target);
}

function uniqueByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function buildMobility(phaseId, a, dIndex) {
  const general = [
    ex('Breathing reset', '2 x 5 slow breaths', 'Bodyweight', 'Easy', 'Ribs down, nasal inhale, long exhale.', 'Shorter breathing set', 'Do one set only.'),
    ex('Joint circles', '1–2 min', 'Bodyweight', 'Easy', 'Move nearby joints gently before loading.', 'Smaller circles', 'Reduce range.'),
    ex('Easy tissue flush', '3–5 min', 'Walk / bike', 'Very easy', 'Use this to increase warmth, not fatigue.', 'Gentle walking', 'Walk slowly indoors.')
  ];
  const regional = {
    hamstring: [ex('Dynamic leg swing, small range', '2 x 8/side', 'Bodyweight', 'Easy', 'Stay below stretch pain.', 'Marching', 'Replace swings with marches.')],
    quadriceps: [ex('Prone quad rock, small range', '2 x 8', 'Bodyweight', 'Easy', 'Move slowly without sharp front-thigh pain.', 'Heel slide', 'Use a smaller knee bend.')],
    calf_shin: [ex('Ankle mobility flow', '2 x 10', 'Bodyweight', 'Easy', 'Move ankle in all directions.', 'Ankle pumps', 'Up and down only.')],
    adductor_groin: [ex('Hip rock-back, narrow range', '2 x 8', 'Bodyweight', 'Easy', 'Do not chase groin stretch.', 'Pelvic tilts', 'Use floor control only.')],
    it_band: [ex('Hip controlled rotations', '2 x 5/side', 'Bodyweight', 'Easy', 'Slow hip motion, no lateral knee pain.', 'Clamshell without band', 'Keep it small.')],
    abdomen: [ex('Pelvic tilt flow', '2 x 8', 'Bodyweight', 'Easy', 'No breath holding.', 'Breathing reset', 'Use breathing only.')],
    ankle: [ex('Knee-to-wall prep', '2 x 8', 'Wall', 'Easy', 'Only in pain-free range.', 'Ankle pumps', 'Remove weightbearing.')],
    knee: [ex('Heel slide mobility', '2 x 10', 'Bodyweight', 'Easy', 'Restore comfortable bend and straighten.', 'Assisted heel slide', 'Use towel support.')]
  }[a.primaryRegion] || [];
  return uniqueByName([...general, ...regional]).slice(0, phaseId === 'protect' ? 3 : 4);
}

function buildActiveRecovery(a, phaseId, dayIndex) {
  const options = [];
  if (a.equipment.includes('Bike')) options.push(ex('Easy bike', '12–25 min', 'Bike', 'RPE 2–3', 'Comfortable cadence. No symptom build-up.', 'Easy walk', 'Walk 10–15 minutes.'));
  if (a.equipment.includes('Pool')) options.push(ex('Easy pool movement', '10–20 min', 'Pool', 'RPE 2–3', 'Swim or walk in water without hard kicking.', 'Easy walk', 'Stay on land with walking.'));
  if (a.equipment.includes('Treadmill') || a.sports.includes('Running')) options.push(ex('Easy walk or walk-jog', phaseId === 'speed' || phaseId === 'return' ? '15–25 min' : '10–15 min', 'Flat route / treadmill', 'RPE 2–4', 'Use jogging only if the current phase allows it and pain stays low.', 'Easy walk', 'Remove jogging.'));
  options.push(ex('Recovery mobility circuit', '8–12 min', 'Bodyweight', 'Very easy', 'Repeat gentle mobility from today, no forced stretching.', 'Breathing reset', 'Do breathing and walking only.'));
  options.push(ex('Light core control', '2 x 6/side', 'Bodyweight', 'Easy', 'Keep it low effort and clean.', 'Breathing only', 'Skip core if symptoms are reactive.'));
  return uniqueByName(rotate(options, dayIndex)).slice(0, 4);
}

function activeRecoverySummary(a, phaseId) {
  if (phaseId === 'protect') return 'Easy circulation, mobility, and symptom calming.';
  return 'Low-intensity movement to recover between harder rehab days.';
}

function estimateDuration(phaseId, count) {
  if (phaseId === 'protect') return '25–40 min';
  if (phaseId === 'restore') return '40–60 min';
  if (phaseId === 'capacity') return count >= 9 ? '60–90 min' : '50–75 min';
  if (phaseId === 'speed') return '60–100 min';
  return '75–120 min';
}

function regionalAddOns(region, phaseId, exactArea) {
  const tendonBias = /tendon|achilles|patellar|quad_tendon|proximal/i.test(exactArea || '');
  const map = {
    hamstring: {
      protect: [ex('Hamstring set at two angles', '4 x 15 sec each', 'Bodyweight', 'RPE 2–4', 'Use a bent-knee and mid-knee angle.', 'One-angle hamstring set', 'Use only the most comfortable angle.'), ex('Bridge march prep', '2 x 6/side', 'Bodyweight', 'RPE 3', 'Only lift one foot slightly.', 'Double-leg bridge', 'Keep both feet down.')],
      restore: [ex('Bridge walkout', '3 x 5', 'Bodyweight', 'RPE 4–5', 'Small steps out and back.', 'Long-lever bridge hold', 'Hold instead of walking.'), ex('Split-stance hinge', '3 x 8/side', 'DB optional', 'RPE 4–6', 'Bias the injured side lightly.', 'Wall hinge', 'No load.')],
      capacity: [ex('Single-leg RDL', '3 x 6/side', 'DB optional', 'RPE 6–8', 'Stay controlled; do not chase stretch.', 'Kickstand RDL', 'Keep back toes down.'), ex('Hamstring slider eccentric', '3 x 5', 'Sliders / towel', 'RPE 6–7', 'Slow out, assist back.', 'Bridge walkout', 'Lower demand.')],
      speed: [ex('Dribble runs', '4 x 20 m', 'Open space', 'RPE 6–7', 'Quick feet without maximal sprinting.', 'A-march', 'Remove speed.'), ex('Straight-line tempo runs', '6 x 60 m', 'Field', 'RPE 6–7', 'Smooth rhythm; no sudden max effort.', 'Bike intervals', 'No running.')],
      return: [ex('Flying build-up rehearsal', '4 x 20 m build + 20 m fast', 'Field', 'RPE 7–8', 'Only after repeated green days.', 'Build-up runs at 70%', 'Stay submax.')]
    },
    quadriceps: {
      protect: [ex('Quad set with towel', '5 x 10 sec', 'Bodyweight', 'Easy', 'Press knee down gently.', 'Shorter holds', 'Use 5 seconds.'), ex('Bent-knee hip flexion hold', '3 x 10 sec/side', 'Bodyweight', 'RPE 2–3', 'Good for rectus femoris without stretch.', 'Supine march', 'Move slowly.')],
      restore: [ex('Terminal knee extension', '3 x 12', 'Band', 'RPE 4–5', 'Lock out smoothly.', 'Quad set', 'Stay static.'), ex('Low step-up', '3 x 8/side', 'Step', 'RPE 4–6', 'No knee collapse.', 'Sit-to-stand', 'Use chair.')],
      capacity: [ex('Reverse Nordic regression', '3 x 4–6', 'Bodyweight', 'RPE 5–7', 'Short range first.', 'Tall-kneeling lean', 'Reduce range.'), ex('Leg extension slow tempo', '3 x 8', 'Machine / band', 'RPE 6–7', 'Three-second lower.', 'Banded knee extension', 'Use band.')],
      speed: [ex('High-knee mechanics', '3 x 15 m', 'Cones', 'RPE 5–6', 'Smooth hip flexion.', 'Marching', 'Walk it.'), ex('Submax kicking pattern', '3 x 8/side', 'Ball optional', 'RPE 5–6', 'No hard striking.', 'No-ball swing', 'Slow unloaded pattern.')],
      return: [ex('Progressive kicking volume', '3 blocks x 8 reps', 'Ball', 'RPE 7–8', 'Short passing before long shots.', 'Technical passing only', 'Reduce force.')]
    },
    calf_shin: {
      protect: [ex('Seated calf isometric', '5 x 20 sec', 'Chair', 'RPE 2–4', 'Gentle mid-range pressure.', 'Shorter holds', '10 seconds each.'), ex('Tibialis activation', '2 x 12', 'Wall / seated', 'Easy', 'Lift toes smoothly.', 'Ankle pumps', 'Simpler range.')],
      restore: [ex('Eccentric calf lower', '3 x 8', 'Step optional', 'RPE 4–6', 'Slow lower, support as needed.', 'Flat-ground calf raise', 'No step.'), ex('Foot intrinsic short-foot', '3 x 8', 'Bodyweight', 'Easy', 'Raise arch without toe gripping.', 'Toe yoga', 'Alternate toes.')],
      capacity: [ex('Loaded standing calf raise', '4 x 6–8', 'DB / machine', 'RPE 6–8', 'Full range and pause.', 'Bodyweight calf raise', 'No load.'), ex('Loaded soleus raise', '4 x 8', 'DB / machine', 'RPE 6–8', 'Knee bent, slow lower.', 'Seated bodyweight raise', 'Remove load.')],
      speed: [ex('Pogo progression', '4 x 20 sec', 'Bodyweight', 'RPE 6–7', 'Quiet springy contacts.', 'Fast calf raise', 'No jumping.'), ex('Run-walk build', '10–20 min', 'Flat route', 'RPE 5–6', 'Increase only if next day stays calm.', 'Walk intervals', 'Remove running.')],
      return: [ex('Repeated acceleration exposures', '6 x 20 m', 'Field', 'RPE 7–8', 'Smooth push-off; no grab.', 'Incline walk', 'Low impact.')]
    }
  };
  const generic = {
    protect: [ex('Pain-free activation hold', '4 x 15 sec', 'Bodyweight', 'Easy', 'Gentle contraction only.', 'Shorter hold', 'Do 8 seconds.')],
    restore: [ex('Controlled range strength', '3 x 8', 'Bodyweight / band', 'RPE 4–5', 'Slow and steady.', 'Isometric hold', 'Hold instead of reps.')],
    capacity: [ex('Progressive strength lift', '4 x 6', 'DB / gym optional', 'RPE 6–7', 'Add load only after green response.', 'Bodyweight version', 'No external load.')],
    speed: [ex('Low-level movement drill', '4 x 20 sec', 'Open space', 'RPE 5–6', 'Controlled speed only.', 'Marching drill', 'Remove impact.')],
    return: [ex('Sport-specific rehearsal', '4 x 30 sec', 'Sport setting', 'RPE 7', 'Submax before maximal.', 'Technical walk-through', 'Slow it down.')]
  };
  const regionSet = map[region] || generic;
  const items = regionSet[phaseId] || generic[phaseId] || [];
  return tendonBias && (phaseId === 'protect' || phaseId === 'restore') ? [ex('Pain-modulating isometric', '5 x 30 sec', 'Bodyweight / band', 'RPE 4–5', 'Tendon-style hold; pain should settle after, not spike.', 'Shorter isometric', '3 x 20 sec.'), ...items] : items;
}

function phaseAddOns(phaseId, a) {
  const map = {
    protect: [ex('Easy circulation walk', '5–10 min', 'Walking', 'Very easy', 'Walk only if gait is normal enough.', 'Short indoor walk', '2–5 minutes.'), ex('Gentle core brace', '3 x 6 breaths', 'Bodyweight', 'Easy', 'Brace without breath holding.', 'Breathing only', 'No brace.')],
    restore: [ex('Balance or weight-shift drill', '3 x 20 sec', 'Bodyweight', 'RPE 3–5', 'Find quiet control.', 'Supported balance', 'Hold support.'), ex('Tempo control squat pattern', '3 x 6', 'Bodyweight', 'RPE 4–6', 'Three-second lower.', 'Sit-to-stand', 'Use chair.')],
    capacity: [ex('Primary strength lift', '4 x 6', 'DB / gym optional', 'RPE 6–8', 'Heavy enough to build, not flare.', 'Bodyweight pattern', 'Remove load.'), ex('Accessory endurance set', '2 x 12', 'Band / bodyweight', 'RPE 5–6', 'Build tolerance after strength.', 'One set only', 'Reduce volume.'), ex('Trunk control finisher', '3 x 8/side', 'Bodyweight / band', 'RPE 5', 'Control pelvis and ribs.', 'Dead bug', 'Simpler core option.')],
    speed: [ex('Landing or braking mechanics', '3 x 5', 'Bodyweight / cones', 'RPE 5–6', 'Quality before intensity.', 'Step-stop drill', 'No jumping.'), ex('Low-impact conditioning', '10–18 min', 'Bike / pool / walk', 'RPE 4–5', 'Maintain fitness without chasing fatigue.', 'Easy walk', 'Lower impact.')],
    return: [ex('Maintenance strength pair', '2–3 x 5–8', 'Gym / DB / band', 'RPE 6–8', 'Keep strength work while sport returns.', 'Bodyweight pair', 'Reduce load.'), ex('Controlled sport block', '10–25 min', 'Sport setting', 'RPE 6–8', 'Controlled exposure, no surprise max effort.', 'Technical-only block', 'No speed or contact.')]
  };
  return map[phaseId] || [];
}

function sportDemandAddOns(phaseId, a) {
  const items = [];
  if (a.movements.includes('High-speed running') && (phaseId === 'speed' || phaseId === 'return')) items.push(ex('High-speed exposure ladder', '4–8 runs', 'Field / track', 'RPE 6–8', '70% before 80%, 80% before 90%.', 'Tempo runs', 'Stay at 60–70%.'));
  if (a.movements.includes('Cutting / change of direction') && (phaseId === 'speed' || phaseId === 'return')) items.push(ex('Planned change-of-direction ladder', '4 x 4 reps', 'Cones', 'RPE 6–8', 'Wide angles before sharp cuts.', 'Curved runs', 'No cuts.'));
  if (a.movements.includes('Jumping / landing') && (phaseId === 'speed' || phaseId === 'return')) items.push(ex('Jump-and-stick series', '3 x 5', 'Bodyweight', 'RPE 5–7', 'Land quietly and hold.', 'Squat to calf raise', 'No jump.'));
  if (a.movements.includes('Kicking') && (phaseId === 'speed' || phaseId === 'return')) items.push(ex('Kicking exposure ladder', '3 x 8', 'Ball optional', 'RPE 5–8', 'Short controlled passes before hard shots.', 'No-ball swing', 'Slow pattern.'));
  if (a.movements.includes('Long-duration running') && (phaseId === 'speed' || phaseId === 'return')) items.push(ex('Flat aerobic run build', '15–35 min', 'Flat route', 'RPE 5–7', 'Volume before speed and hills.', 'Bike endurance', 'Use bike.'));
  return items;
}

function equipmentAddOns(phaseId, a) {
  const items = [];
  if (a.equipment.includes('Bike') && (phaseId === 'protect' || phaseId === 'restore')) items.push(ex('Low-resistance bike', '8–15 min', 'Bike', 'RPE 2–4', 'Comfortable, no symptom rise.', 'Walk', 'Use easy walk.'));
  if (a.equipment.includes('Pool') && (phaseId === 'protect' || phaseId === 'restore')) items.push(ex('Pool recovery', '10–20 min', 'Pool', 'RPE 2–4', 'Easy swim or water walk.', 'Walk', 'Use land walking.'));
  if (a.equipment.includes('Resistance bands')) items.push(ex('Band accessory control', '2–3 x 12', 'Band', 'RPE 4–6', 'Slow, clean accessory work.', 'Bodyweight control', 'No band.'));
  if (a.equipment.includes('Dumbbells') || a.equipment.includes('Barbell') || a.equipment.includes('Gym machines')) items.push(ex('Loaded accessory lift', '3 x 6–8', 'Weights / machine', 'RPE 6–8', 'Load only if previous session was green.', 'Bodyweight variation', 'Remove load.'));
  return items;
}

function ex(name, prescription, equipment, intensity, cue, altName, altCue) {
  return { name, prescription, equipment, intensity, cue, video: 'Exercise video placeholder', alternative: { name: altName, cue: altCue, prescription: '2–3 sets at easier intensity' } };
}

function rotate(arr, n) {
  return arr.slice(n % arr.length).concat(arr.slice(0, n % arr.length));
}

function adjustExercise(ex, phase, a, wIndex, dIndex, idx) {
  const copy = structuredClone(ex);
  const gym = a.equipment.includes('Gym machines') || a.equipment.includes('Barbell') || a.equipment.includes('Dumbbells');
  if (!gym && /barbell|machine|cable|DB|Dumbbell|Gym/i.test(copy.equipment)) copy.equipment += ' · use listed easier option if unavailable';
  if (a.grade === 'grade2' || a.grade === 'unknown') copy.intensity = copy.intensity.replace('RPE 7–9', 'RPE 6–7').replace('RPE 6–8', 'RPE 5–7');
  if (a.grade === 'grade3') copy.intensity = 'RPE 2–4 only until cleared';
  if (phase.id === 'capacity' && wIndex > 0 && idx < 2) copy.prescription += ' · add small load if previous day was green';
  if ((phase.id === 'speed' || phase.id === 'return') && a.movements.includes('High-speed running')) copy.cue += ' Keep speed exposure gradual and never chase max speed on a sore day.';
  if (a.movements.includes('Kicking') && (a.primaryRegion === 'quadriceps' || a.primaryRegion === 'adductor_groin' || a.primaryRegion === 'abdomen')) copy.cue += ' Kicking stays submax until resisted tests are quiet.';
  return copy;
}

function calculateProgress(plan = []) {
  const totalPhases = plan.length;
  const completedPhases = plan.filter((p) => p.weeks.every((w) => w.days.every((d) => d.completed))).length;
  const allWeeks = plan.flatMap((p) => p.weeks);
  const totalWeeks = allWeeks.length;
  const completedWeeks = allWeeks.filter((w) => w.days.every((d) => d.completed)).length;
  const allDays = allWeeks.flatMap((w) => w.days);
  const totalDays = allDays.length || 1;
  const completedDays = allDays.filter((d) => d.completed).length;
  return { totalPhases, completedPhases, totalWeeks, completedWeeks, totalDays, completedDays, percent: Math.round((completedDays / totalDays) * 100) };
}

function findToday(plan) {
  for (const phase of plan) {
    for (const week of phase.weeks) {
      for (const day of week.days) {
        if (!day.completed) return { ...day, phaseLabel: phase.label };
      }
    }
  }
  return { title: 'Plan complete', summary: 'Keep maintenance work and gradually return to full performance.', phaseLabel: 'Maintenance' };
}

function getStatusMessage(status, profile) {
  if (status.pain > 5 || status.swelling === 'New swelling' || status.response === 'Worse than yesterday') return 'Today is a regression day. Repeat or reduce the previous session and avoid testing sport intensity.';
  if (status.pain <= 2 && status.confidence >= 70 && status.response !== 'Worse than yesterday') return 'This is a green response. You can progress one small variable next session, not everything at once.';
  return 'This is an amber response. Repeat the same level once more before progressing.';
}

function coachResponse(text, profile, assessment) {
  const lower = text.toLowerCase();
  if (!profile) return 'Complete the assessment first so I can answer based on your injury, grade, sport, and current phase.';
  if (/sprint|play|match|football|soccer|return|game|train/i.test(lower)) {
    return `Based on your ${profile.gradeName.toLowerCase()} ${profile.regionName.toLowerCase()} profile, do not jump straight to full sport. Your next step should match the current phase: ${profile.today?.phaseLabel}. You need low pain during the session, no next-day flare, no swelling, and clean movement before harder sport exposure.`;
  }
  if (/pain|worse|swelling|bruise|limp|sharp/i.test(lower)) {
    return 'That is a signal to hold or regress. Keep pain under 2–3/10, avoid movements that change your gait, and log a check-in. If swelling, instability, locking, severe bruising, calf warmth, or abdominal/groin bulge appears, seek medical review.';
  }
  if (/too easy|easy|progress|increase/i.test(lower)) {
    return 'Progress only one variable at a time: either range, load, reps, speed, or complexity. If tomorrow morning is still calm, the plan can move forward. If not, repeat the same level.';
  }
  return 'Keep the plan boring and consistent. The goal is not to prove you are healed today; it is to build enough capacity that the injury does not return when intensity rises.';
}

function buildPlanNote(a, highRisk, exactArea) {
  if (highRisk) return 'This plan is conservative because your answers include high-risk signs or a severe grade. Use it only as early guidance until reviewed.';
  const multiple = a.secondaryRegions.length ? ` It also accounts for secondary areas: ${a.secondaryRegions.join(', ')}.` : '';
  const area = exactArea ? ` Specific focus: ${exactArea.name}.` : '';
  return `Plan tailored to ${a.mechanism.toLowerCase()}, ${gradeLabels[a.grade].toLowerCase()}, selected equipment, pain levels, and sport demands.${area}${multiple}`;
}

function weekFocus(phaseId, weekIndex, weeksCount, a) {
  const base = {
    protect: 'Calm symptoms, restore walking, keep gentle activation.',
    restore: 'Increase range, control, and submax strength.',
    capacity: 'Build strength and tissue tolerance with progressive loading.',
    speed: 'Introduce impact, running, landing, and sport-specific speed carefully.',
    return: 'Rehearse sport demands and maintain strength while returning.'
  }[phaseId];
  return weeksCount > 1 ? `${base} Week ${weekIndex + 1} of ${weeksCount}: progress only after green check-ins.` : base;
}

function sessionTitle(phaseId, dayIndex) {
  const titles = {
    protect: ['Pain-free activation', 'Mobility and circulation', 'Isometric control'],
    restore: ['Control strength', 'Range and balance', 'Submax loading'],
    capacity: ['Strength capacity', 'Eccentric control', 'Single-leg strength'],
    speed: ['Running and impact prep', 'Landing and deceleration', 'Sport mechanics'],
    return: ['Controlled sport exposure', 'Return-to-training rehearsal', 'Performance maintenance']
  };
  return titles[phaseId][dayIndex % 3];
}

function summaryFor(phaseId, a) {
  const s = {
    protect: 'Short and controlled. Nothing should feel aggressive.',
    restore: 'Build confidence through smooth movement and light strength.',
    capacity: 'Strength work becomes more meaningful while staying controlled.',
    speed: 'Add speed or impact carefully, only if the previous day stayed calm.',
    return: 'Rehearse your sport in layers before full intensity.'
  };
  return s[phaseId];
}

function ruleFor(phaseId, a) {
  if (a.grade === 'grade3') return 'Stop and seek review if symptoms are severe, unstable, or worsening. Do not progress to speed or heavy loading without clearance.';
  if (phaseId === 'speed' || phaseId === 'return') return 'Progress only if pain stays 0–2/10, no swelling or limp appears, and tomorrow morning is not worse.';
  return 'Green: pain 0–2/10 and next morning stable. Amber: repeat. Red: regress or seek review.';
}
