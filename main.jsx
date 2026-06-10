import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Inbox, CalendarDays, Clock, FolderKanban, BookOpen, Sparkles, Settings, LogOut } from 'lucide-react'
import { supabase } from './lib/supabaseClient'
import './styles.css'

const CASES = [
  { key: 'trash', label: 'Trash' },
  { key: 'reference', label: 'Reference' },
  { key: 'someday', label: 'Someday' },
  { key: 'i_do_it', label: 'I Do It' },
  { key: 'delegate', label: 'Delegate' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'project', label: 'Multi-Step / Project' },
]
const tabs = [
  ['inbox', 'Inbox', Inbox],
  ['today', 'Today', CalendarDays],
  ['waiting', 'Waiting', Clock],
  ['projects', 'Projects', FolderKanban],
  ['reference', 'Reference', BookOpen],
  ['someday', 'Someday', Sparkles],
  ['settings', 'Settings', Settings],
]

function todayISO() { return new Date().toISOString().slice(0, 10) }
function dateTimeFromDateTime(date, time) { return date ? `${date}T${time || '09:00'}:00` : null }

function App() {
  const [session, setSession] = useState(null)
  const [tab, setTab] = useState(location.hash?.replace('#', '') || 'inbox')
  const [captureOpen, setCaptureOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    const onHash = () => setTab(location.hash?.replace('#', '') || 'inbox')
    addEventListener('hashchange', onHash)
    return () => { sub.subscription.unsubscribe(); removeEventListener('hashchange', onHash) }
  }, [])

  if (!session) return <Auth />

  return <DataProvider user={session.user}>
    <div className="app">
      <header className="topbar">
        <div><b>GTD</b><span>Capture → Process → Do</span></div>
        <button className="ghost" onClick={() => supabase.auth.signOut()}><LogOut size={18}/>Logout</button>
      </header>
      <main>
        {tab === 'inbox' && <InboxScreen />}
        {tab === 'today' && <TodayScreen />}
        {tab === 'waiting' && <WaitingScreen />}
        {tab === 'projects' && <ProjectsScreen />}
        {tab === 'reference' && <ReferenceScreen />}
        {tab === 'someday' && <SomedayScreen />}
        {tab === 'settings' && <SettingsScreen user={session.user} />}
      </main>
      <nav className="bottomnav">{tabs.map(([key, label, Icon]) => <a key={key} className={tab===key?'active':''} href={`#${key}`}><Icon size={18}/><span>{label}</span></a>)}</nav>
      {tab !== 'settings' && <button className="fab" onClick={() => setCaptureOpen(true)}><Plus/></button>}
      {captureOpen && <CaptureSheet onClose={() => setCaptureOpen(false)} />}
    </div>
  </DataProvider>
}

const DataContext = React.createContext(null)
function useData() { return React.useContext(DataContext) }

function DataProvider({ user, children }) {
  const [items, setItems] = useState([]), [actions, setActions] = useState([]), [delegated, setDelegated] = useState([]), [projects, setProjects] = useState([]), [references, setReferences] = useState([]), [someday, setSomeday] = useState([]), [loading, setLoading] = useState(true)
  async function refresh() {
    setLoading(true)
    const [i, a, d, p, r, s] = await Promise.all([
      supabase.from('items').select('*').order('created_at', { ascending: false }),
      supabase.from('actions').select('*, items(title, notes, case_type)').is('completed_at', null).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('delegated_items').select('*, items(title, notes)').is('completed_at', null).order('follow_up_date', { ascending: true, nullsFirst: false }),
      supabase.from('projects').select('*, items(title, notes, area_type)').is('completed_at', null).order('created_at', { ascending: false }),
      supabase.from('reference_items').select('*, items(title, notes, source)').order('created_at', { ascending: false }),
      supabase.from('someday_items').select('*, items(title, notes)').order('review_date', { ascending: true, nullsFirst: false }),
    ])
    setItems(i.data || []); setActions(a.data || []); setDelegated(d.data || []); setProjects(p.data || []); setReferences(r.data || []); setSomeday(s.data || [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])
  const value = useMemo(() => ({ user, items, actions, delegated, projects, references, someday, loading, refresh }), [user, items, actions, delegated, projects, references, someday, loading])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

function Auth() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [mode, setMode] = useState('signin'), [msg, setMsg] = useState('')
  async function submit(e) {
    e.preventDefault(); setMsg('')
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp
    const { error } = await fn({ email, password })
    setMsg(error ? error.message : mode === 'signin' ? 'Signed in.' : 'Account created. Check email if confirmation is enabled.')
  }
  return <div className="auth"><form onSubmit={submit} className="card narrow"><h1>GTD App</h1><p>Private task and knowledge processing.</p><input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} /><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} /><button>{mode==='signin'?'Sign in':'Create account'}</button><button type="button" className="ghost" onClick={()=>setMode(mode==='signin'?'signup':'signin')}>{mode==='signin'?'Create account':'Back to sign in'}</button>{msg && <p className="muted">{msg}</p>}</form></div>
}

function CaptureSheet({ onClose }) {
  const { user, refresh } = useData(); const [title, setTitle] = useState(''), [notes, setNotes] = useState(''), [source, setSource] = useState('')
  async function submit(e) {
    e.preventDefault(); if (!title.trim()) return
    await supabase.from('items').insert({ user_id: user.id, title, notes, source, status: 'unprocessed' })
    await refresh(); onClose()
  }
  return <div className="overlay" onClick={onClose}><form className="sheet" onClick={e=>e.stopPropagation()} onSubmit={submit}><h2>Quick capture</h2><input autoFocus placeholder="Title / short description" value={title} onChange={e=>setTitle(e.target.value)} /><textarea placeholder="Notes, optional" value={notes} onChange={e=>setNotes(e.target.value)} /><input placeholder="Source, optional" value={source} onChange={e=>setSource(e.target.value)} /><div className="row"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button>Capture</button></div></form></div>
}

function InboxScreen() {
  const { items, loading } = useData(); const inbox = items.filter(i => i.status === 'unprocessed')
  const [processing, setProcessing] = useState(null)
  if (processing) return <ProcessScreen item={processing} onBack={() => setProcessing(null)} />
  return <Screen title="Inbox" subtitle="Unprocessed stuff waiting for a decision.">{loading && <p>Loading...</p>}{inbox.length===0 && <Empty text="Inbox is clear."/>}{inbox.map(item => <ItemCard key={item.id} item={item} actionLabel="Process" onAction={() => setProcessing(item)} />)}</Screen>
}

function ProcessScreen({ item, onBack }) {
  const { user, refresh } = useData(); const [caseType, setCaseType] = useState(''); const [f, setF] = useState({ area_type: '', priority: '', context: '', due_date: '', scheduled_date: '', scheduled_time: '', project_status: 'Active' }); const [error, setError] = useState('')
  const set = (k,v) => setF(x => ({...x, [k]: v}))
  function validate() {
    if (['i_do_it','delegate','project'].includes(caseType) && !f.area_type) return 'Choose Work or Personal.'
    if (caseType === 'i_do_it' && !f.next_action) return 'Next action is required.'
    if (caseType === 'delegate' && (!f.person_responsible || !f.waiting_for)) return 'Person responsible and waiting-for are required.'
    if (caseType === 'schedule' && !f.scheduled_date) return 'Scheduled date is required.'
    if (caseType === 'project' && (!f.project_name || !f.desired_outcome || !f.next_action)) return 'Project name, desired outcome, and next action are required.'
    return ''
  }
  async function complete() {
    const v = validate(); if (v) return setError(v)
    const base = { status: caseType === 'trash' ? 'archived' : 'processed', case_type: caseType, area_type: f.area_type || null, processed_at: new Date().toISOString(), archived_at: caseType === 'trash' ? new Date().toISOString() : null }
    await supabase.from('items').update(base).eq('id', item.id)
    if (caseType === 'reference') await supabase.from('reference_items').insert({ user_id: user.id, item_id: item.id, category: f.category || null, tags: f.tags ? f.tags.split(',').map(t=>t.trim()).filter(Boolean) : [] })
    if (caseType === 'someday') await supabase.from('someday_items').insert({ user_id: user.id, item_id: item.id, category: f.category || null, review_date: f.review_date || null })
    if (caseType === 'i_do_it') await supabase.from('actions').insert({ user_id: user.id, item_id: item.id, action_title: f.next_action, action_notes: f.notes || null, priority: f.priority || null, context: f.context || null, due_date: f.due_date || null })
    if (caseType === 'delegate') await supabase.from('delegated_items').insert({ user_id: user.id, item_id: item.id, person_responsible: f.person_responsible, waiting_for: f.waiting_for, follow_up_date: f.follow_up_date || null, communication_notes: f.communication_notes || null })
    if (caseType === 'schedule') await supabase.from('actions').insert({ user_id: user.id, item_id: item.id, action_title: f.action_to_do, action_notes: f.notes || null, scheduled_at: dateTimeFromDateTime(f.scheduled_date, f.scheduled_time) })
    if (caseType === 'project') await supabase.from('projects').insert({ user_id: user.id, item_id: item.id, project_name: f.project_name, desired_outcome: f.desired_outcome, next_action: f.next_action, status: f.project_status || 'Active', due_date: f.due_date || null })
    await refresh(); onBack()
  }
  return <Screen title="Process" subtitle="Decide what this item means."><button className="ghost" onClick={onBack}>← Back</button><div className="card"><h2>{item.title}</h2>{item.notes && <p>{item.notes}</p>}<label>What is this?</label><div className="chips">{CASES.map(c => <button key={c.key} className={caseType===c.key?'selected':''} onClick={()=>setCaseType(c.key)}>{c.label}</button>)}</div></div>{caseType && <div className="card form"><DynamicFields caseType={caseType} f={f} set={set}/>{error && <p className="error">{error}</p>}<button onClick={complete}>Finish processing</button></div>}</Screen>
}

function AreaField({ f, set }) { return <><label>Work or Personal *</label><select value={f.area_type} onChange={e=>set('area_type', e.target.value)}><option value="">Choose</option><option>Work</option><option>Personal</option></select></> }
function DynamicFields({ caseType, f, set }) {
  if (caseType === 'trash') return <p>No extra fields. This will be archived.</p>
  if (caseType === 'reference') return <><input placeholder="Area / category" value={f.category||''} onChange={e=>set('category', e.target.value)} /><input placeholder="Tags, comma separated" value={f.tags||''} onChange={e=>set('tags', e.target.value)} /><textarea placeholder="Notes" value={f.notes||''} onChange={e=>set('notes', e.target.value)} /></>
  if (caseType === 'someday') return <><input placeholder="Area / category" value={f.category||''} onChange={e=>set('category', e.target.value)} /><label>Review date</label><input type="date" value={f.review_date||''} onChange={e=>set('review_date', e.target.value)} /><textarea placeholder="Notes" value={f.notes||''} onChange={e=>set('notes', e.target.value)} /></>
  if (caseType === 'i_do_it') return <><AreaField f={f} set={set}/><input placeholder="Next action *" value={f.next_action||''} onChange={e=>set('next_action', e.target.value)} /><select value={f.priority} onChange={e=>set('priority', e.target.value)}><option value="">Priority</option><option>High</option><option>Medium</option><option>Low</option></select><input type="date" value={f.due_date} onChange={e=>set('due_date', e.target.value)} /><input placeholder="Context, e.g. office, home, computer" value={f.context} onChange={e=>set('context', e.target.value)} /><textarea placeholder="Notes" value={f.notes||''} onChange={e=>set('notes', e.target.value)} /></>
  if (caseType === 'delegate') return <><AreaField f={f} set={set}/><input placeholder="Person responsible *" value={f.person_responsible||''} onChange={e=>set('person_responsible', e.target.value)} /><input placeholder="Waiting for *" value={f.waiting_for||''} onChange={e=>set('waiting_for', e.target.value)} /><label>Follow-up date</label><input type="date" value={f.follow_up_date||''} onChange={e=>set('follow_up_date', e.target.value)} /><textarea placeholder="Communication notes" value={f.communication_notes||''} onChange={e=>set('communication_notes', e.target.value)} /></>
  if (caseType === 'schedule') return <><label>Scheduled date *</label><input type="date" value={f.scheduled_date||''} onChange={e=>set('scheduled_date', e.target.value)} /><label>Scheduled time</label><input type="time" value={f.scheduled_time||''} onChange={e=>set('scheduled_time', e.target.value)} /><input placeholder="Action to do at that time *" value={f.action_to_do||''} onChange={e=>set('action_to_do', e.target.value)} /><select value={f.area_type} onChange={e=>set('area_type', e.target.value)}><option value="">Work / Personal optional</option><option>Work</option><option>Personal</option></select><textarea placeholder="Notes" value={f.notes||''} onChange={e=>set('notes', e.target.value)} /></>
  if (caseType === 'project') return <><AreaField f={f} set={set}/><input placeholder="Project name *" value={f.project_name||''} onChange={e=>set('project_name', e.target.value)} /><textarea placeholder="Desired outcome *" value={f.desired_outcome||''} onChange={e=>set('desired_outcome', e.target.value)} /><input placeholder="Next action *" value={f.next_action||''} onChange={e=>set('next_action', e.target.value)} /><select value={f.project_status} onChange={e=>set('project_status', e.target.value)}><option>Active</option><option>Paused</option></select><input type="date" value={f.due_date||''} onChange={e=>set('due_date', e.target.value)} /><textarea placeholder="Notes" value={f.notes||''} onChange={e=>set('notes', e.target.value)} /></>
}

function TodayScreen() {
  const { actions, refresh } = useData(); const [area, setArea] = useState(''), [context, setContext] = useState('')
  const list = actions.filter(a => (a.items?.case_type === 'i_do_it' || (a.scheduled_at && a.scheduled_at.slice(0,10) <= todayISO())) && (!area || a.items?.area_type === area) && (!context || a.context === context))
  return <Screen title="Today / Do" subtitle="Actions to do now."><Filters area={area} setArea={setArea} context={context} setContext={setContext}/>{list.length===0 && <Empty text="No actions for now."/>}{list.map(a => <ActionCard key={a.id} a={a} onDone={async()=>{await supabase.from('actions').update({ completed_at: new Date().toISOString() }).eq('id', a.id); refresh()}} />)}</Screen>
}
function WaitingScreen() { const { delegated, refresh } = useData(); return <Screen title="Waiting" subtitle="Check, communicate, follow up.">{delegated.length===0 && <Empty text="Nothing delegated."/>}{delegated.map(d => <div className="card" key={d.id}><h3>{d.items?.title}</h3><p><b>{d.person_responsible}</b> — {d.waiting_for}</p>{d.follow_up_date && <p>Follow up: {d.follow_up_date}</p>}<textarea defaultValue={d.communication_notes || ''} onBlur={e=>supabase.from('delegated_items').update({ communication_notes: e.target.value }).eq('id', d.id)} /><button onClick={async()=>{await supabase.from('delegated_items').update({completed_at:new Date().toISOString()}).eq('id', d.id); refresh()}}>Resolved</button></div>)}</Screen> }
function ProjectsScreen() { const { projects, refresh } = useData(); return <Screen title="Projects" subtitle="Plan, define next action, track progress.">{projects.length===0 && <Empty text="No active projects."/>}{projects.map(p => <div className="card" key={p.id}><h3>{p.project_name}</h3><p>{p.desired_outcome}</p><p><b>Next:</b> {p.next_action}</p><p>{p.status} {p.due_date ? `• Due ${p.due_date}` : ''}</p><button onClick={async()=>{await supabase.from('projects').update({completed_at:new Date().toISOString(), status:'Completed'}).eq('id', p.id); refresh()}}>Complete project</button></div>)}</Screen> }
function ReferenceScreen() { const { references } = useData(); return <Screen title="Reference" subtitle="Useful information, not actions.">{references.length===0 && <Empty text="No reference items."/>}{references.map(r => <div className="card" key={r.id}><h3>{r.items?.title}</h3><p>{r.items?.notes}</p>{r.category && <small>{r.category}</small>}{r.tags?.length ? <div className="chips">{r.tags.map(t=><span key={t} className="tag">{t}</span>)}</div> : null}</div>)}</Screen> }
function SomedayScreen() { const { someday } = useData(); return <Screen title="Someday" subtitle="Maybe later, no commitment now.">{someday.length===0 && <Empty text="No someday items."/>}{someday.map(s => <div className="card" key={s.id}><h3>{s.items?.title}</h3><p>{s.items?.notes}</p>{s.review_date && <small>Review: {s.review_date}</small>}</div>)}</Screen> }
function SettingsScreen({ user }) { return <Screen title="Settings" subtitle="Account and safety."><div className="card"><p><b>Email:</b> {user.email}</p><p className="muted">Frontend uses only Supabase URL and anon/public key. Private keys must stay out of GitHub.</p></div></Screen> }

function Screen({ title, subtitle, children }) { return <section className="screen"><h1>{title}</h1><p className="subtitle">{subtitle}</p>{children}</section> }
function Empty({ text }) { return <div className="empty">{text}</div> }
function ItemCard({ item, actionLabel, onAction }) { return <div className="card"><h3>{item.title}</h3>{item.notes && <p>{item.notes}</p>}<small>{new Date(item.created_at).toLocaleString()}</small><button onClick={onAction}>{actionLabel}</button></div> }
function ActionCard({ a, onDone }) { return <div className="card"><h3>{a.action_title}</h3><p>{a.items?.title}</p><div className="meta">{a.items?.area_type && <span>{a.items.area_type}</span>}{a.priority && <span>{a.priority}</span>}{a.context && <span>{a.context}</span>}{a.due_date && <span>Due {a.due_date}</span>}{a.scheduled_at && <span>At {new Date(a.scheduled_at).toLocaleString()}</span>}</div><button onClick={onDone}>Done</button></div> }
function Filters({ area, setArea, context, setContext }) { return <div className="filters"><select value={area} onChange={e=>setArea(e.target.value)}><option value="">All areas</option><option>Work</option><option>Personal</option></select><input placeholder="Context filter" value={context} onChange={e=>setContext(e.target.value)} /></div> }

createRoot(document.getElementById('root')).render(<App />)
