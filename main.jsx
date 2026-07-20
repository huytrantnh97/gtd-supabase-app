import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './lib/supabaseClient'
import './styles.css'

/* ─── Constants ──────────────────────────────── */
const CASES = [
  { value: 'trash',     label: '🗑 Discard' },
  { value: 'reference', label: '📚 Save as reference' },
  { value: 'someday',   label: '🌱 Someday / Maybe' },
  { value: 'action',    label: '✅ Do it myself' },
  { value: 'delegated', label: '👤 Delegate to someone' },
  { value: 'scheduled', label: '🗓 Schedule it' },
  { value: 'project',   label: '📁 Multi-step project' },
]

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

/* Google Calendar OAuth — replace with your own Client ID from Google Cloud Console */
const GOOGLE_CLIENT_ID = '294844057556-p42qhekdimblr3t33uulf2r65oj81a4v.apps.googleusercontent.com'
const GOOGLE_REDIRECT_URI = 'https://huytrantnh97.github.io/gtd-supabase-app/'
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

/* Audio played by the "Play audio" button on the Focus task card.
   Replace with the path/URL to your own file, e.g. './focus-bell.mp3'
   after adding it to your GitHub repo. */
const FOCUS_AUDIO_URL = './focus-bell.mp3'

function buildGoogleAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/* ─── Helpers ─────────────────────────────────── */
function todayISO()  { return new Date().toISOString().slice(0,10) }
function nowISO()    { return new Date().toISOString() }
function toScheduledAt(d,t) { if(!d) return null; return t?`${d}T${t}:00`:`${d}T00:00:00` }
function datePart(v) { return v?v.slice(0,10):'' }
function timePart(v) { return v&&v.includes('T')?v.slice(11,16):'' }
function isTodayOrEarlier(v) { return v?v.slice(0,10)<=todayISO():false }
function formatDateTime(v)   { return v?v.replace('T',' ').slice(0,16):'' }
function normalizeUrl(url) {
  const c=(url||'').trim(); if(!c) return ''
  return c.startsWith('http://')||c.startsWith('https://')?c:`https://${c}`
}
function matchesArea(rec,f) { return f==='All'||rec.area_type===f }
function parseEmailList(v) {
  return (v||'').split(/[;,\n]/).map(e=>e.trim().toLowerCase()).filter(Boolean)
    .filter((e,i,a)=>a.indexOf(e)===i)
}
function emailListToText(v) { return Array.isArray(v)?v.join(', '):'' }
function greetingWord() {
  const h=new Date().getHours()
  return h<12?'Good morning':h<18?'Good afternoon':'Good evening'
}
function firstName(email) { return (email||'').split('@')[0].split(/[._-]/)[0] }

/* ─── App root ────────────────────────────────── */
function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({data,error}) => {
      if(error) setAuthMessage(error.message)
      setSession(data?.session??null); setAuthLoading(false)
    })
    const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>l.subscription.unsubscribe()
  },[])

  async function handleSignIn() {
    setAuthMessage('Signing in...')
    const {error}=await supabase.auth.signInWithPassword({email,password})
    if(error){const m=error.message||JSON.stringify(error)||'Unknown error';setAuthMessage(m);alert(m);return}
    setAuthMessage('')
  }
  async function handleSignUp() {
    setAuthMessage('Creating account...')
    const {error}=await supabase.auth.signUp({email,password})
    if(error){const m=error.message||JSON.stringify(error)||'Unknown error';setAuthMessage(m);alert(m);return}
    setAuthMessage('Account created! You can now sign in.')
  }
  async function handleSignOut(){await supabase.auth.signOut()}

  if(authLoading) return <div className="center-page"><div style={{color:'var(--text-4)',fontSize:14}}>Loading...</div></div>

  if(!session) return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-logo">GTD App</p>
        <h1>Welcome 👋</h1>
        <p>Personal task management with the GTD method.</p>
        <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSignIn()} />
        <button onClick={handleSignIn}>Sign in</button>
        <button className="secondary" onClick={handleSignUp}>Create account</button>
        {authMessage&&<div className="message">{authMessage}</div>}
      </div>
    </div>
  )

  return <GTDApp session={session} onSignOut={handleSignOut}/>
}

/* ─── Main GTD App ────────────────────────────── */
function GTDApp({session,onSignOut}) {
  const user=session.user
  const [screen,setScreen]=useState('home')
  const [loading,setLoading]=useState(true)
  const [refreshing,setRefreshing]=useState(false)
  const [notice,setNotice]=useState('')
  const [menuOpen,setMenuOpen]=useState(false)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [todayAreaFilter,setTodayAreaFilter]=useState('All')
  const [waitingAreaFilter,setWaitingAreaFilter]=useState('All')
  const [projectsAreaFilter,setProjectsAreaFilter]=useState('All')
  const [items,setItems]=useState([])
  const [projects,setProjects]=useState([])
  const [references,setReferences]=useState([])
  const [habits,setHabits]=useState([])
  const [habitLogs,setHabitLogs]=useState([])
  const [captureOpen,setCaptureOpen]=useState(false)
  const [processingItem,setProcessingItem]=useState(null)
  const [projectToView,setProjectToView]=useState(null)
  const [newProjectActionOpen,setNewProjectActionOpen]=useState(null)
  const [editItem,setEditItem]=useState(null)
  const [editProject,setEditProject]=useState(null)
  const [editReference,setEditReference]=useState(null)
  const [addHabitOpen,setAddHabitOpen]=useState(false)
  const focusAudioRef=useRef(null)
  function playFocusAudio() {
    const el=focusAudioRef.current
    if(!el)return
    el.currentTime=0
    el.play().catch(()=>{alert('Could not play the audio file. Make sure FOCUS_AUDIO_URL points to a valid file in your repo.')})
  }
  const [calendarEvents,setCalendarEvents]=useState([])
  const [calendarConnected,setCalendarConnected]=useState(false)
  const [calendarLoading,setCalendarLoading]=useState(true)

  async function loadAll({quiet=false}={}) {
    if(!quiet)setLoading(true)
    setRefreshing(true);setNotice('')
    const [ir,pr,rr,hr,hlr]=await Promise.all([
      supabase.from('items').select('*').order('created_at',{ascending:true}),
      supabase.from('projects').select('*').order('created_at',{ascending:true}),
      supabase.from('references').select('*').order('created_at',{ascending:true}),
      supabase.from('habits').select('*').eq('user_id',user.id).order('created_at',{ascending:true}),
      supabase.from('habit_logs').select('*').eq('user_id',user.id).gte('log_date',new Date(Date.now()-7*86400000).toISOString().slice(0,10)),
    ])
    const err=ir.error||pr.error||rr.error
    if(err){setNotice(err.message);alert(err.message)}
    else{setItems(ir.data||[]);setProjects(pr.data||[]);setReferences(rr.data||[])}
    if(!hr.error)setHabits(hr.data||[])
    if(!hlr.error)setHabitLogs(hlr.data||[])
    setLoading(false);setRefreshing(false)
  }

  useEffect(()=>{loadAll();handleGoogleOAuthRedirect()},[])

  async function loadCalendarEvents() {
    setCalendarLoading(true)
    try {
      const {data,error}=await supabase.functions.invoke('google-calendar-events')
      if(error){setCalendarConnected(false);setCalendarEvents([]);setCalendarLoading(false);return}
      setCalendarConnected(!!data.connected)
      setCalendarEvents(data.events||[])
    } catch(e) {
      setCalendarConnected(false);setCalendarEvents([])
    }
    setCalendarLoading(false)
  }

  async function handleGoogleOAuthRedirect() {
    const params=new URLSearchParams(window.location.search)
    const code=params.get('code')
    if(!code){await loadCalendarEvents();return}
    window.history.replaceState({},'',window.location.pathname)
    setCalendarLoading(true)
    const {data,error}=await supabase.functions.invoke('google-oauth-exchange',{body:{code}})
    if(error||data?.error){alert('Failed to connect Google Calendar: '+(data?.error||error?.message||'Unknown error'))}
    await loadCalendarEvents()
  }

  async function disconnectGoogleCalendar() {
    if(!window.confirm('Disconnect Google Calendar?'))return
    const {error}=await supabase.from('google_tokens').delete().eq('user_id',user.id)
    if(error){alert(error.message);return}
    setCalendarConnected(false);setCalendarEvents([])
  }

  async function createInboxItem({title,notes,source,linkUrl}) {
    const {error}=await supabase.from('items').insert({
      user_id:user.id,title,notes:notes||null,source:source||null,
      link_url:normalizeUrl(linkUrl)||null,shared_with_emails:[],
      status:'inbox',case_type:null,area_type:null,
    })
    if(error){alert(error.message);return}
    setCaptureOpen(false);await loadAll({quiet:true})
  }

  async function completeItem(item) {
    const {error}=await supabase.from('items').update({status:'completed',completed_at:nowISO()}).eq('id',item.id)
    if(error)alert(error.message)
    await loadAll({quiet:true})
  }

  async function completeProject(project) {
    const {error}=await supabase.from('projects').update({status:'completed',completed_at:nowISO()}).eq('id',project.id)
    if(error)alert(error.message)
    await loadAll({quiet:true})
  }

  async function deleteAllDone() {
    if(!window.confirm('Permanently delete all completed tasks and projects? This cannot be undone.'))return
    const itemIds=items.filter(i=>i.status==='completed').map(i=>i.id)
    const projIds=projects.filter(p=>p.status==='completed').map(p=>p.id)
    const ops=[]
    if(itemIds.length>0)ops.push(supabase.from('items').delete().in('id',itemIds))
    if(projIds.length>0)ops.push(supabase.from('projects').delete().in('id',projIds))
    if(ops.length===0)return
    const results=await Promise.all(ops)
    const err=results.find(r=>r.error)?.error
    if(err){alert(err.message);return}
    await loadAll({quiet:true})
  }

  async function addProjectAction(project,data) {
    const {error}=await supabase.from('items').insert({
      user_id:user.id,title:data.title,notes:data.notes||null,
      link_url:normalizeUrl(data.link_url)||null,
      shared_with_emails:project.shared_with_emails||[],
      status:'active',case_type:'action',area_type:project.area_type,
      project_id:project.id,priority:data.priority||null,
      context:data.context||null,due_date:data.due_date||null,
    })
    if(error){alert(error.message);return}
    setNewProjectActionOpen(null);await loadAll({quiet:true})
  }

  async function updateItem(id,data) {
    const {error}=await supabase.from('items').update({
      title:data.title,notes:data.notes||null,source:data.source||null,
      link_url:normalizeUrl(data.link_url)||null,
      shared_with_emails:parseEmailList(data.shared_with_emails),
      status:data.status,case_type:data.case_type||null,
      area_type:data.area_type||null,project_id:data.project_id||null,
      person_responsible:data.person_responsible||null,
      waiting_for:data.waiting_for||null,
      communication_notes:data.communication_notes||null,
      priority:data.priority||null,context:data.context||null,
      due_date:data.due_date||null,review_date:data.review_date||null,
      scheduled_at:data.scheduled_date?toScheduledAt(data.scheduled_date,data.scheduled_time):null,
    }).eq('id',id)
    if(error){alert(error.message);return}
    setEditItem(null);await loadAll({quiet:true})
  }

  async function updateProject(id,data) {
    const shared=parseEmailList(data.shared_with_emails)
    const {error}=await supabase.from('projects').update({
      name:data.name,desired_outcome:data.desired_outcome,
      status:data.status,area_type:data.area_type,
      due_date:data.due_date||null,
      link_url:normalizeUrl(data.link_url)||null,
      shared_with_emails:shared,
    }).eq('id',id)
    if(error){alert(error.message);return}
    const su=await supabase.from('items').update({shared_with_emails:shared}).eq('project_id',id)
    if(su.error){alert(su.error.message);return}
    setEditProject(null);await loadAll({quiet:true})
  }

  async function updateReference(id,data) {
    const {error}=await supabase.from('references').update({
      title:data.title,content:data.content||null,category:data.category||null,
      tags:data.tags?data.tags.split(',').map(t=>t.trim()).filter(Boolean):[],
      link_url:normalizeUrl(data.link_url)||null,
      shared_with_emails:parseEmailList(data.shared_with_emails),
    }).eq('id',id)
    if(error){alert(error.message);return}
    setEditReference(null);await loadAll({quiet:true})
  }

  async function addHabit(data) {
    const {error}=await supabase.from('habits').insert({
      user_id:user.id,name:data.name,emoji:data.emoji||'✅',
      frequency:data.frequency||'daily',
      days_of_week:data.days_of_week||null,
    })
    if(error){alert(error.message);return}
    setAddHabitOpen(false);await loadAll({quiet:true})
  }

  async function toggleHabitLog(habitId,date) {
    const existing=habitLogs.find(l=>l.habit_id===habitId&&l.log_date===date)
    if(existing){
      const {error}=await supabase.from('habit_logs').delete().eq('id',existing.id)
      if(error){alert(error.message);return}
      setHabitLogs(prev=>prev.filter(l=>l.id!==existing.id))
    } else {
      const {data,error}=await supabase.from('habit_logs').insert({
        user_id:user.id,habit_id:habitId,log_date:date,
      }).select().single()
      if(error){alert(error.message);return}
      setHabitLogs(prev=>[...prev,data])
    }
  }

  /* ─── Derived data ─────────────── */
  const projectById=useMemo(()=>Object.fromEntries(projects.map(p=>[p.id,p])),[projects])
  const inboxItems=items.filter(i=>i.status==='inbox')
  const today=todayISO()

  const todayItems=items.filter(i=>{
    if(i.status!=='active')return false
    if(!matchesArea(i,todayAreaFilter))return false
    if(i.case_type==='action')return true
    if(i.case_type==='scheduled')return isTodayOrEarlier(i.scheduled_at)
    return false
  }).slice().sort((a,b)=>{
    const far='9999-99-99'
    const ad=a.due_date||far,bd=b.due_date||far
    if(ad!==bd)return ad.localeCompare(bd)
    const as_=a.scheduled_at||far,bs=b.scheduled_at||far
    if(as_!==bs)return as_.localeCompare(bs)
    return (a.created_at||'').localeCompare(b.created_at||'')
  })

  const scheduledItems=items.filter(i=>i.status==='active'&&i.case_type==='scheduled')
    .slice().sort((a,b)=>(a.scheduled_at||'').localeCompare(b.scheduled_at||''))

  const waitingItems=items.filter(i=>i.status==='active'&&i.case_type==='delegated'&&matchesArea(i,waitingAreaFilter))
  const activeProjects=projects.filter(p=>p.status==='active'&&matchesArea(p,projectsAreaFilter))
  const allActiveProjects=projects.filter(p=>p.status==='active')
  const somedayItems=items.filter(i=>i.status==='processed'&&i.case_type==='someday')
  const doneItems=items.filter(i=>i.status==='completed').slice().sort((a,b)=>(b.completed_at||'').localeCompare(a.completed_at||''))
  const doneProjects=projects.filter(p=>p.status==='completed').slice().sort((a,b)=>(b.completed_at||'').localeCompare(a.completed_at||''))

  const counts={
    inbox:inboxItems.length,
    today:items.filter(i=>{if(i.status!=='active')return false;if(i.case_type==='action')return true;if(i.case_type==='scheduled')return isTodayOrEarlier(i.scheduled_at);return false}).length,
    waiting:items.filter(i=>i.status==='active'&&i.case_type==='delegated').length,
    projects:projects.filter(p=>p.status==='active').length,
    schedule:items.filter(i=>i.status==='active'&&i.case_type==='scheduled').length,
    someday:items.filter(i=>i.status==='processed'&&i.case_type==='someday').length,
    reference:references.length,
    done:doneItems.length+doneProjects.length,
  }

  const projectActions=pid=>items.filter(i=>i.project_id===pid&&i.status==='active')

  // Focus task: overdue first, then due today, then active actions
  const focusTask=useMemo(()=>{
    const active=items.filter(i=>i.status==='active'&&(i.case_type==='action'||(i.case_type==='scheduled'&&isTodayOrEarlier(i.scheduled_at))))
    const overdue=active.filter(i=>i.due_date&&i.due_date<today)
    if(overdue.length>0)return overdue.sort((a,b)=>a.due_date.localeCompare(b.due_date))[0]
    const dueToday=active.filter(i=>i.due_date===today)
    if(dueToday.length>0)return dueToday[0]
    return active[0]||null
  },[items,today])

  // Last 3 days for habit tracking
  const last3=useMemo(()=>{
    const days=[]
    for(let i=2;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i)
      days.push(d.toISOString().slice(0,10))
    }
    return days
  },[])

  const habitsDoneToday=habits.filter(h=>habitLogs.some(l=>l.habit_id===h.id&&l.log_date===today)).length

  const navigateTo=(s)=>setScreen(s)

  return (
    <div className="app" onClick={()=>menuOpen&&setMenuOpen(false)}>
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand" style={{cursor:'pointer'}} onClick={()=>setScreen('home')}>
          <div className="header-brand-icon">G</div>
          <div>
            <div className="header-brand-name">GTD App</div>
            <div className="header-brand-sub">{user.email}</div>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={e=>{e.stopPropagation();loadAll({quiet:true})}} disabled={refreshing} title="Refresh" aria-label="Refresh">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {refreshing?<circle cx="12" cy="12" r="9" strokeDasharray="28" strokeDashoffset="10"/>:<><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></>}
            </svg>
          </button>
          <div className="header-menu" onClick={e=>e.stopPropagation()}>
            <button className="icon-btn" onClick={()=>setMenuOpen(o=>!o)} aria-label="Menu">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/>
              </svg>
            </button>
            {menuOpen&&(
              <div className="menu-popover">
                <button className="menu-item" onClick={()=>{setSettingsOpen(true);setMenuOpen(false)}}>⚙️ Settings</button>
                <button className="menu-item danger" onClick={onSignOut}>→ Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {notice&&<div className="notice" style={{margin:'8px 14px'}}>{notice}</div>}

      {loading&&<div style={{color:'var(--text-4)',textAlign:'center',padding:'60px 0',fontSize:14}}>Loading...</div>}

      {/* ── HOME ── */}
      {!loading&&screen==='home'&&(
        <div className="home">
          <div className="home-greeting">
            <div className="home-date-solo">{new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
          </div>

          {/* Summary folder */}
          <FolderCard colorClass="folder-summary" icon="📊" title="Summary"
            subtitle={`${counts.today} tasks · ${counts.inbox} in inbox`}
            defaultOpen={true}>
            <div className="summary-grid">
              {[
                ['inbox','📥','Inbox',counts.inbox],
                ['today','✅','Today',counts.today],
                ['waiting','⏳','Waiting',counts.waiting],
                ['projects','📁','Projects',counts.projects],
                ['schedule','🗓','Scheduled',counts.schedule],
                ['someday','🌱','Someday',counts.someday],
                ['reference','📚','Reference',counts.reference],
                ['done','🏁','Done',counts.done],
              ].map(([key,icon,label,val])=>(
                <button key={key} className="summary-tile" onClick={()=>navigateTo(key)}>
                  <div className="summary-tile-val">{val}</div>
                  <div className="summary-tile-lbl">{icon} {label}</div>
                </button>
              ))}
            </div>
          </FolderCard>

          {/* Events folder */}
          <FolderCard colorClass="folder-events" icon="🗓" title="Next events"
            subtitle={calendarLoading?'Loading...':calendarConnected?`${calendarEvents.length} events today`:'Not connected'}
            defaultOpen={true}>
            {calendarLoading?(
              <div className="ev-empty">Loading events...</div>
            ):!calendarConnected?(
              <>
                <div className="ev-empty">Connect your Google Calendar to see today's events here.</div>
                <button className="ev-connect-btn" onClick={()=>window.location.href=buildGoogleAuthUrl()}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Connect Google Calendar
                </button>
              </>
            ):calendarEvents.length===0?(
              <div className="ev-empty">No events today.</div>
            ):(
              calendarEvents.map(ev=>(
                <div className="ev-row" key={ev.id}>
                  <div className="ev-time">{ev.allDay?'All day':new Date(ev.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                  <div className="ev-dot" style={{background:'#6C4FC4'}}></div>
                  <div><div className="ev-name">{ev.title}</div><div className="ev-cal">Google Calendar</div></div>
                </div>
              ))
            )}
            {calendarConnected&&(
              <div className="ev-note" style={{cursor:'pointer'}} onClick={disconnectGoogleCalendar}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Disconnect Google Calendar
              </div>
            )}
          </FolderCard>

          {/* Focus task folder */}
          <FolderCard colorClass="folder-focus" icon="🎯" title="Focus task"
            expandable={false} onClick={()=>navigateTo('today')}>
            {focusTask?(
              <>
                <div className="focus-inner" onClick={e=>{e.stopPropagation();setEditItem(focusTask)}}>
                  <div className="focus-eyebrow">⭐ Priority #1</div>
                  <div className="focus-task-title">{focusTask.title}</div>
                  <div className="focus-tags">
                    {focusTask.due_date&&<span className="focus-tag">📅 {focusTask.due_date===today?'Due today':focusTask.due_date}</span>}
                    {projectById[focusTask.project_id]&&<span className="focus-tag">📁 {projectById[focusTask.project_id].name}</span>}
                    {focusTask.area_type&&<span className="focus-tag">{focusTask.area_type}</span>}
                  </div>
                </div>
                <div className="focus-actions">
                  <button className="focus-action-btn" onClick={e=>{e.stopPropagation();completeItem(focusTask)}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                    Mark done
                  </button>
                  <button className="focus-action-btn" onClick={e=>{e.stopPropagation();playFocusAudio()}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Play audio
                  </button>
                </div>
              </>
            ):(
              <div className="focus-empty">No urgent tasks right now. 🎉</div>
            )}
          </FolderCard>
          <audio ref={focusAudioRef} src={FOCUS_AUDIO_URL} preload="none"/>

          {/* Habits folder */}
          <FolderCard colorClass="folder-habits" icon="🔥" title="Habits"
            subtitle={`${habitsDoneToday} of ${habits.length} done today`}
            defaultOpen={true}>
            {habits.map(habit=>(
              <div className="habit-row" key={habit.id}>
                <div className="habit-left">
                  <div className="habit-emoji">{habit.emoji||'✅'}</div>
                  <div>
                    <div className="habit-name">{habit.name}</div>
                    <div className="habit-freq">{habit.frequency==='daily'?'Daily':habit.frequency==='weekly'?'Weekly':'Custom'}</div>
                  </div>
                </div>
                <div className="habit-dots">
                  {last3.map(date=>{
                    const done=habitLogs.some(l=>l.habit_id===habit.id&&l.log_date===date)
                    return (
                      <button key={date} className={`habit-dot${done?' done':''}`}
                        onClick={()=>toggleHabitLog(habit.id,date)}
                        title={date} aria-label={`${habit.name} on ${date}`}>
                        {done&&'✓'}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {habits.length===0&&<div style={{fontSize:13,color:'rgba(26,46,20,.45)',textAlign:'center',padding:'10px 0'}}>No habits yet. Add one below.</div>}
            <button className="habit-add-btn" onClick={()=>setAddHabitOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add new habit
            </button>
          </FolderCard>
        </div>
      )}

      {/* ── DETAIL SCREENS ── */}
      {!loading&&screen!=='home'&&(
        <div className="screen">
          <div className="screen-header">
            <button className="screen-back" onClick={()=>setScreen('home')} aria-label="Back to home">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="screen-title-wrap">
              <h2>{{inbox:'Inbox',today:'Today',waiting:'Waiting',projects:'Projects',schedule:'Schedule',reference:'Reference',someday:'Someday',done:'Done'}[screen]}</h2>
              <p>{{inbox:`${counts.inbox} items`,today:`${counts.today} tasks`,waiting:`${counts.waiting} items`,projects:`${counts.projects} active`,schedule:`${counts.schedule} scheduled`,reference:`${counts.reference} items`,someday:`${counts.someday} items`,done:`${counts.done} completed`}[screen]}</p>
            </div>
          </div>

          <div className="content">
            {/* INBOX */}
            {screen==='inbox'&&(
              <section>
                {inboxItems.length===0?<Empty text="Inbox is clear. Hit + to capture something."/>:
                  <div className="list">{inboxItems.map(item=>(
                    <Card key={item.id} stripe="accent">
                      <CardBody><h3>{item.title}</h3>{item.notes&&<p className="card-notes">{item.notes}</p>}
                        <CardTags><CardTag label="Source" value={item.source}/>{item.link_url&&<TagLink url={item.link_url}/>}</CardTags>
                      </CardBody>
                      <CardFooter>
                        <CardAction label="⚡ Process" onClick={()=>setProcessingItem(item)} variant="primary"/>
                        <CardAction label="Edit" onClick={()=>setEditItem(item)}/>
                      </CardFooter>
                    </Card>
                  ))}</div>
                }
              </section>
            )}

            {/* TODAY */}
            {screen==='today'&&(
              <section>
                <AreaSwitcher value={todayAreaFilter} onChange={setTodayAreaFilter}/>
                {todayItems.length===0?<Empty text="Nothing due. Great job! 🎉"/>:
                  <div className="list">{todayItems.map(item=>{
                    const overdue=item.due_date&&item.due_date<today
                    const stripe=overdue?'urgent':item.case_type==='scheduled'?'ok':undefined
                    return (
                      <Card key={item.id} stripe={stripe}>
                        <CardBody><h3>{item.title}</h3>{item.notes&&<p className="card-notes">{item.notes}</p>}
                          <CardTags>
                            {item.due_date&&<CardTag value={item.due_date} variant="urgent" icon="📅"/>}
                            {item.scheduled_at&&item.case_type==='scheduled'&&<CardTag value={formatDateTime(item.scheduled_at)} variant="scheduled-tag" icon="🕐"/>}
                            <CardTag value={projectById[item.project_id]?.name} variant="project-tag"/>
                            <CardTag value={item.priority}/><CardTag label="@" value={item.context}/>
                            <CardTag value={item.area_type}/>{item.link_url&&<TagLink url={item.link_url}/>}
                          </CardTags>
                        </CardBody>
                        <CardFooter>
                          <CardAction label="✓ Done" onClick={()=>completeItem(item)} variant="primary"/>
                          <CardAction label="Edit" onClick={()=>setEditItem(item)}/>
                        </CardFooter>
                      </Card>
                    )
                  })}</div>
                }
              </section>
            )}

            {/* SCHEDULE */}
            {screen==='schedule'&&(
              <section>
                {scheduledItems.length===0?<Empty text="No scheduled items."/>:
                  <div className="list">{scheduledItems.map(item=>(
                    <Card key={item.id} stripe="ok">
                      <CardBody><h3>{item.title}</h3>{item.notes&&<p className="card-notes">{item.notes}</p>}
                        <CardTags>
                          {item.scheduled_at&&<CardTag value={formatDateTime(item.scheduled_at)} variant="scheduled-tag" icon="🕐"/>}
                          <CardTag value={item.area_type}/>{item.link_url&&<TagLink url={item.link_url}/>}
                        </CardTags>
                      </CardBody>
                      <CardFooter>
                        <CardAction label="✓ Done" onClick={()=>completeItem(item)} variant="primary"/>
                        <CardAction label="Edit" onClick={()=>setEditItem(item)}/>
                      </CardFooter>
                    </Card>
                  ))}</div>
                }
              </section>
            )}

            {/* WAITING */}
            {screen==='waiting'&&(
              <section>
                <AreaSwitcher value={waitingAreaFilter} onChange={setWaitingAreaFilter}/>
                {waitingItems.length===0?<Empty text="Nothing waiting."/>:
                  <div className="list">{waitingItems.map(item=>(
                    <Card key={item.id} stripe="accent">
                      <CardBody><h3>{item.waiting_for||item.title}</h3>
                        {item.communication_notes&&<p className="card-notes">{item.communication_notes}</p>}
                        <CardTags>
                          <CardTag label="👤" value={item.person_responsible}/>
                          {item.review_date&&<CardTag value={`Follow-up ${item.review_date}`} variant="urgent" icon="📅"/>}
                          <CardTag value={item.area_type}/>{item.link_url&&<TagLink url={item.link_url}/>}
                        </CardTags>
                      </CardBody>
                      <CardFooter>
                        <CardAction label="✓ Resolved" onClick={()=>completeItem(item)} variant="primary"/>
                        <CardAction label="Edit" onClick={()=>setEditItem(item)}/>
                      </CardFooter>
                    </Card>
                  ))}</div>
                }
              </section>
            )}

            {/* PROJECTS */}
            {screen==='projects'&&(
              <section>
                <AreaSwitcher value={projectsAreaFilter} onChange={setProjectsAreaFilter}/>
                {activeProjects.length===0?<Empty text="No active projects."/>:
                  <div className="list">{activeProjects.map(project=>{
                    const actions=projectActions(project.id)
                    return (
                      <Card key={project.id} stripe="accent">
                        <CardBody><h3>{project.name}</h3><p className="card-notes">{project.desired_outcome}</p>
                          <CardTags>
                            {project.due_date&&<CardTag value={project.due_date} variant="urgent" icon="📅"/>}
                            <CardTag value={project.area_type}/><CardTag value={`${actions.length} actions`}/>
                            {project.link_url&&<TagLink url={project.link_url}/>}
                          </CardTags>
                          {actions.slice(0,3).map(a=>(
                            <div className="mini-action" key={a.id}>
                              <span>{a.title}</span>
                              <button onClick={()=>completeItem(a)}>✓ Done</button>
                            </div>
                          ))}
                        </CardBody>
                        <CardFooter>
                          <CardAction label="View" onClick={()=>setProjectToView(project)} variant="primary"/>
                          <CardAction label="+ Action" onClick={()=>setNewProjectActionOpen(project)}/>
                          <CardAction label="Edit" onClick={()=>setEditProject(project)}/>
                          <CardAction label="Complete" onClick={()=>completeProject(project)}/>
                        </CardFooter>
                      </Card>
                    )
                  })}</div>
                }
              </section>
            )}

            {/* REFERENCE */}
            {screen==='reference'&&(
              <section>
                {references.length===0?<Empty text="No reference items yet."/>:
                  <div className="list">{references.map(ref=>(
                    <Card key={ref.id}>
                      <CardBody><h3>{ref.title}</h3>{ref.content&&<p className="card-notes">{ref.content}</p>}
                        <CardTags>
                          <CardTag value={ref.category}/>
                          {(Array.isArray(ref.tags)?ref.tags:[]).map(tag=><CardTag key={tag} value={tag}/>)}
                          {ref.link_url&&<TagLink url={ref.link_url}/>}
                        </CardTags>
                      </CardBody>
                      <CardFooter><CardAction label="Edit" onClick={()=>setEditReference(ref)}/></CardFooter>
                    </Card>
                  ))}</div>
                }
              </section>
            )}

            {/* SOMEDAY */}
            {screen==='someday'&&(
              <section>
                {somedayItems.length===0?<Empty text="Nothing in Someday."/>:
                  <div className="list">{somedayItems.map(item=>(
                    <Card key={item.id}>
                      <CardBody><h3>{item.title}</h3>{item.notes&&<p className="card-notes">{item.notes}</p>}
                        <CardTags>
                          {item.review_date&&<CardTag value={`Review ${item.review_date}`} icon="🔁"/>}
                          <CardTag value={item.area_type}/>{item.link_url&&<TagLink url={item.link_url}/>}
                        </CardTags>
                      </CardBody>
                      <CardFooter><CardAction label="Edit" onClick={()=>setEditItem(item)}/></CardFooter>
                    </Card>
                  ))}</div>
                }
              </section>
            )}

            {/* DONE */}
            {screen==='done'&&(
              <section>
                {(doneItems.length>0||doneProjects.length>0)&&(
                  <button className="secondary small" style={{marginBottom:12}} onClick={deleteAllDone}>🗑 Delete all</button>
                )}
                {doneItems.length===0&&doneProjects.length===0&&<Empty text="Nothing completed yet."/>}
                {doneProjects.length>0&&<>
                  <p className="section-label">Completed projects</p>
                  <div className="list" style={{marginBottom:14}}>
                    {doneProjects.map(p=>(
                      <Card key={p.id}><CardBody><h3>{p.name}</h3>
                        {p.desired_outcome&&<p className="card-notes">{p.desired_outcome}</p>}
                        <CardTags><CardTag value={p.area_type}/>{p.completed_at&&<CardTag value={formatDateTime(p.completed_at)} icon="✓"/>}</CardTags>
                      </CardBody></Card>
                    ))}
                  </div>
                </>}
                {doneItems.length>0&&<>
                  <p className="section-label">Completed tasks</p>
                  <div className="list">
                    {doneItems.map(item=>(
                      <Card key={item.id}><CardBody><h3>{item.title}</h3>
                        <CardTags>
                          <CardTag value={projectById[item.project_id]?.name} variant="project-tag"/>
                          <CardTag value={item.area_type}/>
                          {item.completed_at&&<CardTag value={formatDateTime(item.completed_at)} icon="✓"/>}
                        </CardTags>
                      </CardBody></Card>
                    ))}
                  </div>
                </>}
              </section>
            )}
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button className="fab" onClick={()=>setCaptureOpen(true)} aria-label="Add new">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>

      {/* ── Modals ── */}
      {captureOpen&&<CaptureModal onClose={()=>setCaptureOpen(false)} onSubmit={createInboxItem}/>}
      {processingItem&&<ProcessModal item={processingItem} userId={user.id} projects={allActiveProjects} onClose={()=>setProcessingItem(null)} onDone={async()=>{setProcessingItem(null);await loadAll({quiet:true})}}/>}
      {projectToView&&<ProjectModal project={projectToView} actions={projectActions(projectToView.id)} onClose={()=>setProjectToView(null)} onCompleteAction={completeItem} onEditAction={item=>setEditItem(item)}/>}
      {newProjectActionOpen&&<ProjectActionModal project={newProjectActionOpen} onClose={()=>setNewProjectActionOpen(null)} onSubmit={data=>addProjectAction(newProjectActionOpen,data)}/>}
      {settingsOpen&&<SettingsModal email={user.email} onClose={()=>setSettingsOpen(false)} onSignOut={onSignOut} onRefresh={()=>loadAll({quiet:true})} refreshing={refreshing}/>}
      {editItem&&<EditItemModal item={editItem} projects={allActiveProjects} onClose={()=>setEditItem(null)} onSubmit={data=>updateItem(editItem.id,data)}/>}
      {editProject&&<EditProjectModal project={editProject} onClose={()=>setEditProject(null)} onSubmit={data=>updateProject(editProject.id,data)}/>}
      {editReference&&<EditReferenceModal reference={editReference} onClose={()=>setEditReference(null)} onSubmit={data=>updateReference(editReference.id,data)}/>}
      {addHabitOpen&&<AddHabitModal onClose={()=>setAddHabitOpen(false)} onSubmit={addHabit}/>}
    </div>
  )
}

/* ─── Folder Card Component ──────────────────── */
function FolderCard({colorClass,icon,title,subtitle,defaultOpen=false,expandable=true,onClick,children}) {
  const [open,setOpen]=useState(defaultOpen)
  if(!expandable) {
    return (
      <div className={`folder-card ${colorClass} folder-card-clickable`} onClick={onClick}>
        <div className="folder-head">
          <div className="folder-head-left">
            <div className="folder-head-icon">{icon}</div>
            <div>
              <div className="folder-head-title">{title}</div>
              {subtitle&&<div className="folder-head-sub">{subtitle}</div>}
            </div>
          </div>
        </div>
        {children&&<><div className="folder-divider"/><div className="folder-body open">{children}</div></>}
      </div>
    )
  }
  return (
    <div className={`folder-card ${colorClass}`}>
      <div className="folder-head" onClick={()=>setOpen(o=>!o)}>
        <div className="folder-head-left">
          <div className="folder-head-icon">{icon}</div>
          <div>
            <div className="folder-head-title">{title}</div>
            <div className="folder-head-sub">{subtitle}</div>
          </div>
        </div>
        <span className={`folder-chevron${open?' open':''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </div>
      <div className="folder-divider"/>
      <div className={`folder-body${open?' open':''}`}>{children}</div>
    </div>
  )
}

/* ─── Modals ─────────────────────────────────── */
function Modal({title,onClose,children}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="bottom-sheet" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function CaptureModal({onClose,onSubmit}) {
  const [title,setTitle]=useState('')
  const [notes,setNotes]=useState('')
  const [source,setSource]=useState('')
  const [linkUrl,setLinkUrl]=useState('')
  return (
    <Modal title="✏️ Quick capture" onClose={onClose}>
      <Fld label="Title *"><input autoFocus placeholder="Task, idea, info..." value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&title.trim()&&onSubmit({title:title.trim(),notes,source,linkUrl})}/></Fld>
      <Fld label="Notes"><textarea placeholder="Details, context..." value={notes} onChange={e=>setNotes(e.target.value)}/></Fld>
      <Fld label="Source"><input placeholder="Email, meeting, idea..." value={source} onChange={e=>setSource(e.target.value)}/></Fld>
      <Fld label="Link"><input placeholder="https://..." value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}/></Fld>
      <button disabled={!title.trim()} onClick={()=>onSubmit({title:title.trim(),notes,source,linkUrl})}>Save to Inbox</button>
    </Modal>
  )
}

function AddHabitModal({onClose,onSubmit}) {
  const [name,setName]=useState('')
  const [emoji,setEmoji]=useState('✅')
  const [frequency,setFrequency]=useState('daily')
  return (
    <Modal title="🔥 New habit" onClose={onClose}>
      <Fld label="Habit name *"><input autoFocus placeholder="e.g. Workout, Read, Meditate..." value={name} onChange={e=>setName(e.target.value)}/></Fld>
      <Fld label="Emoji icon"><input placeholder="✅" value={emoji} onChange={e=>setEmoji(e.target.value)} style={{width:80}}/></Fld>
      <Fld label="Frequency">
        <select value={frequency} onChange={e=>setFrequency(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </Fld>
      <button disabled={!name.trim()} onClick={()=>onSubmit({name:name.trim(),emoji,frequency})}>Add habit</button>
    </Modal>
  )
}

function ProcessModal({item,userId,projects,onClose,onDone}) {
  const [caseType,setCaseType]=useState('')
  const [areaType,setAreaType]=useState('')
  const [form,setForm]=useState({
    reference_title:item.title,content:item.notes||'',notes:item.notes||'',
    link_url:item.link_url||'',shared_with_emails:emailListToText(item.shared_with_emails),
    next_action:item.title,action_to_do:item.title,project_name:item.title,
    desired_outcome:'',waiting_for:item.title,
  })
  const [saving,setSaving]=useState(false)
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}))

  function validate() {
    if(!caseType)return'Select a type.'
    if(['action','delegated','project'].includes(caseType)&&!areaType)return'Select Work or Personal.'
    if(caseType==='action'&&!form.next_action.trim())return'Next action is required.'
    if(caseType==='delegated'&&(!form.person_responsible||!form.waiting_for))return'Person and description required.'
    if(caseType==='scheduled'&&!form.scheduled_date)return'Schedule date is required.'
    if(caseType==='project'&&(!form.project_name.trim()||!form.desired_outcome.trim()||!form.next_action.trim()))return'Project name, outcome, and first action are required.'
    return''
  }

  async function save() {
    const msg=validate(); if(msg){alert(msg);return}
    setSaving(true)
    const pAt=nowISO(), lu=normalizeUrl(form.link_url)||null, sw=parseEmailList(form.shared_with_emails)
    let error=null
    if(caseType==='trash'){({error}=await supabase.from('items').update({status:'archived',case_type:'trash',link_url:lu,shared_with_emails:sw,processed_at:pAt,archived_at:pAt}).eq('id',item.id))}
    else if(caseType==='reference'){
      const r1=await supabase.from('items').update({status:'processed',case_type:'reference',link_url:lu,shared_with_emails:sw,processed_at:pAt}).eq('id',item.id)
      if(r1.error){setSaving(false);alert(r1.error.message);return}
      const r2=await supabase.from('references').insert({user_id:userId,item_id:item.id,title:form.reference_title||item.title,content:form.content||item.notes||null,category:form.category||null,tags:form.tags?form.tags.split(',').map(t=>t.trim()).filter(Boolean):[],link_url:lu,shared_with_emails:sw})
      error=r2.error
    }
    else if(caseType==='someday'){({error}=await supabase.from('items').update({status:'processed',case_type:'someday',area_type:areaType||null,review_date:form.review_date||null,notes:form.notes||item.notes||null,link_url:lu,shared_with_emails:sw,processed_at:pAt}).eq('id',item.id))}
    else if(caseType==='action'){({error}=await supabase.from('items').update({title:form.next_action,notes:form.notes||item.notes||null,status:'active',case_type:'action',area_type:areaType,project_id:form.project_id||null,priority:form.priority||null,context:form.context||null,due_date:form.due_date||null,scheduled_at:null,link_url:lu,shared_with_emails:sw,processed_at:pAt}).eq('id',item.id))}
    else if(caseType==='delegated'){({error}=await supabase.from('items').update({title:form.waiting_for,status:'active',case_type:'delegated',area_type:areaType,person_responsible:form.person_responsible,waiting_for:form.waiting_for,communication_notes:form.communication_notes||null,review_date:form.follow_up_date||null,link_url:lu,shared_with_emails:sw,processed_at:pAt}).eq('id',item.id))}
    else if(caseType==='scheduled'){({error}=await supabase.from('items').update({title:form.action_to_do||item.title,notes:form.notes||item.notes||null,status:'active',case_type:'scheduled',area_type:areaType||null,due_date:null,scheduled_at:toScheduledAt(form.scheduled_date,form.scheduled_time),link_url:lu,shared_with_emails:sw,processed_at:pAt}).eq('id',item.id))}
    else if(caseType==='project'){
      const pRes=await supabase.from('projects').insert({user_id:userId,name:form.project_name,desired_outcome:form.desired_outcome,status:'active',area_type:areaType,due_date:form.due_date||null,link_url:lu,shared_with_emails:sw}).select().single()
      if(pRes.error){setSaving(false);alert(pRes.error.message);return}
      ;({error}=await supabase.from('items').update({title:form.next_action,notes:form.notes||item.notes||null,status:'active',case_type:'action',area_type:areaType,project_id:pRes.data.id,due_date:form.due_date||null,scheduled_at:null,link_url:lu,shared_with_emails:sw,processed_at:pAt}).eq('id',item.id))
    }
    setSaving(false)
    if(error){alert(error.message);return}
    onDone()
  }

  return (
    <Modal title="⚡ Process item" onClose={onClose}>
      <div className="process-item"><h3>{item.title}</h3>{item.notes&&<p>{item.notes}</p>}</div>
      <Fld label="What is this?">
        <select value={caseType} onChange={e=>setCaseType(e.target.value)}>
          <option value="">Choose type...</option>
          {CASES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Fld>
      <Fld label="Link"><input placeholder="https://..." value={form.link_url} onChange={e=>upd('link_url',e.target.value)}/></Fld>
      <Fld label="Share with (email)"><input placeholder="email1, email2..." value={form.shared_with_emails} onChange={e=>upd('shared_with_emails',e.target.value)}/></Fld>
      {['action','delegated','project'].includes(caseType)&&<Fld label="Area *"><select value={areaType} onChange={e=>setAreaType(e.target.value)}><option value="">Choose...</option><option value="Work">💼 Work</option><option value="Personal">🏠 Personal</option></select></Fld>}
      {caseType==='reference'&&<><Fld label="Title"><input value={form.reference_title} onChange={e=>upd('reference_title',e.target.value)}/></Fld><Fld label="Content"><textarea value={form.content} onChange={e=>upd('content',e.target.value)}/></Fld><Fld label="Category"><input placeholder="Tech, Legal..." onChange={e=>upd('category',e.target.value)}/></Fld><Fld label="Tags"><input placeholder="tag1, tag2..." onChange={e=>upd('tags',e.target.value)}/></Fld></>}
      {caseType==='someday'&&<><Fld label="Review date"><input type="date" onChange={e=>upd('review_date',e.target.value)}/></Fld><Fld label="Notes"><textarea value={form.notes} onChange={e=>upd('notes',e.target.value)}/></Fld></>}
      {caseType==='action'&&<><Fld label="Next action *"><input value={form.next_action} onChange={e=>upd('next_action',e.target.value)}/></Fld>{projects.length>0&&<Fld label="Project"><select value={form.project_id||''} onChange={e=>upd('project_id',e.target.value)}><option value="">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Fld>}<Fld label="Priority"><input placeholder="High / Normal..." onChange={e=>upd('priority',e.target.value)}/></Fld><Fld label="Context @"><input placeholder="@Office, @Phone..." onChange={e=>upd('context',e.target.value)}/></Fld><Fld label="Due date"><input type="date" onChange={e=>upd('due_date',e.target.value)}/></Fld><Fld label="Notes"><textarea value={form.notes} onChange={e=>upd('notes',e.target.value)}/></Fld></>}
      {caseType==='delegated'&&<><Fld label="Person *"><input placeholder="Name..." onChange={e=>upd('person_responsible',e.target.value)}/></Fld><Fld label="Waiting for *"><input value={form.waiting_for} onChange={e=>upd('waiting_for',e.target.value)}/></Fld><Fld label="Follow-up date"><input type="date" onChange={e=>upd('follow_up_date',e.target.value)}/></Fld><Fld label="Notes"><textarea placeholder="Communication notes..." onChange={e=>upd('communication_notes',e.target.value)}/></Fld></>}
      {caseType==='scheduled'&&<><Fld label="Date *"><input type="date" onChange={e=>upd('scheduled_date',e.target.value)}/></Fld><Fld label="Time"><input type="time" onChange={e=>upd('scheduled_time',e.target.value)}/></Fld><Fld label="What to do"><input value={form.action_to_do} onChange={e=>upd('action_to_do',e.target.value)}/></Fld><Fld label="Notes"><textarea value={form.notes} onChange={e=>upd('notes',e.target.value)}/></Fld></>}
      {caseType==='project'&&<><Fld label="Project name *"><input value={form.project_name} onChange={e=>upd('project_name',e.target.value)}/></Fld><Fld label="Desired outcome *"><textarea value={form.desired_outcome} onChange={e=>upd('desired_outcome',e.target.value)}/></Fld><Fld label="First action *"><input value={form.next_action} onChange={e=>upd('next_action',e.target.value)}/></Fld><Fld label="Deadline"><input type="date" onChange={e=>upd('due_date',e.target.value)}/></Fld><Fld label="Notes"><textarea value={form.notes} onChange={e=>upd('notes',e.target.value)}/></Fld></>}
      <button disabled={saving} onClick={save}>{saving?'Saving...':'Complete processing'}</button>
    </Modal>
  )
}

function ProjectModal({project,actions,onClose,onCompleteAction,onEditAction}) {
  return (
    <Modal title={project.name} onClose={onClose}>
      <div className="process-item"><p>{project.desired_outcome}</p>{project.due_date&&<p style={{fontSize:12,color:'var(--red-text)',marginTop:4}}>📅 Deadline: {project.due_date}</p>}</div>
      {project.link_url&&<a className="link-button" href={normalizeUrl(project.link_url)} target="_blank" rel="noreferrer">🔗 Open link</a>}
      <p className="section-label">{actions.length} open actions</p>
      {actions.length===0?<Empty text="No actions yet."/>:
        <div className="list">{actions.map(a=>(
          <Card key={a.id} stripe="ok">
            <CardBody><h3>{a.title}</h3>{a.notes&&<p className="card-notes">{a.notes}</p>}
              <CardTags>{a.due_date&&<CardTag value={a.due_date} variant="urgent" icon="📅"/>}<CardTag label="@" value={a.context}/>{a.link_url&&<TagLink url={a.link_url}/>}</CardTags>
            </CardBody>
            <CardFooter><CardAction label="✓ Done" onClick={()=>onCompleteAction(a)} variant="primary"/><CardAction label="Edit" onClick={()=>onEditAction(a)}/></CardFooter>
          </Card>
        ))}</div>
      }
    </Modal>
  )
}

function ProjectActionModal({project,onClose,onSubmit}) {
  const [title,setTitle]=useState('')
  const [notes,setNotes]=useState('')
  const [priority,setPriority]=useState('')
  const [context,setContext]=useState('')
  const [dueDate,setDueDate]=useState('')
  const [linkUrl,setLinkUrl]=useState('')
  return (
    <Modal title={`+ Action for: ${project.name}`} onClose={onClose}>
      <Fld label="Title *"><input autoFocus placeholder="Specific action..." value={title} onChange={e=>setTitle(e.target.value)}/></Fld>
      <Fld label="Notes"><textarea value={notes} onChange={e=>setNotes(e.target.value)}/></Fld>
      <Fld label="Link"><input placeholder="https://..." value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}/></Fld>
      <Fld label="Priority"><input value={priority} onChange={e=>setPriority(e.target.value)}/></Fld>
      <Fld label="Context @"><input placeholder="@Office..." value={context} onChange={e=>setContext(e.target.value)}/></Fld>
      <Fld label="Due date"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></Fld>
      <button disabled={!title.trim()} onClick={()=>onSubmit({title:title.trim(),notes,priority,context,due_date:dueDate,link_url:linkUrl})}>Add action</button>
    </Modal>
  )
}

function EditItemModal({item,projects,onClose,onSubmit}) {
  const [form,setForm]=useState({
    title:item.title||'',notes:item.notes||'',source:item.source||'',
    link_url:item.link_url||'',shared_with_emails:emailListToText(item.shared_with_emails),
    status:item.status||'inbox',case_type:item.case_type||'',area_type:item.area_type||'',
    project_id:item.project_id||'',person_responsible:item.person_responsible||'',
    waiting_for:item.waiting_for||'',communication_notes:item.communication_notes||'',
    priority:item.priority||'',context:item.context||'',due_date:item.due_date||'',
    review_date:item.review_date||'',scheduled_date:datePart(item.scheduled_at),
    scheduled_time:timePart(item.scheduled_at),
  })
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}))
  return (
    <Modal title="✏️ Edit item" onClose={onClose}>
      <Fld label="Title *"><input value={form.title} onChange={e=>upd('title',e.target.value)}/></Fld>
      <Fld label="Notes"><textarea value={form.notes} onChange={e=>upd('notes',e.target.value)}/></Fld>
      <Fld label="Link"><input value={form.link_url} onChange={e=>upd('link_url',e.target.value)}/></Fld>
      <Fld label="Source"><input value={form.source} onChange={e=>upd('source',e.target.value)}/></Fld>
      <Fld label="Share (email)"><input value={form.shared_with_emails} onChange={e=>upd('shared_with_emails',e.target.value)}/></Fld>
      <Fld label="Status"><select value={form.status} onChange={e=>upd('status',e.target.value)}><option value="inbox">Inbox</option><option value="active">Active</option><option value="processed">Processed</option><option value="completed">Completed</option><option value="archived">Archived</option></select></Fld>
      <Fld label="Type"><select value={form.case_type} onChange={e=>upd('case_type',e.target.value)}><option value="">—</option><option value="action">Action</option><option value="delegated">Delegated</option><option value="scheduled">Scheduled</option><option value="someday">Someday</option><option value="reference">Reference</option><option value="trash">Trash</option></select></Fld>
      <Fld label="Area"><select value={form.area_type} onChange={e=>upd('area_type',e.target.value)}><option value="">—</option><option value="Work">💼 Work</option><option value="Personal">🏠 Personal</option></select></Fld>
      {projects.length>0&&<Fld label="Project"><select value={form.project_id} onChange={e=>upd('project_id',e.target.value)}><option value="">None</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Fld>}
      <Fld label="Priority"><input value={form.priority} onChange={e=>upd('priority',e.target.value)}/></Fld>
      <Fld label="Context @"><input value={form.context} onChange={e=>upd('context',e.target.value)}/></Fld>
      <Fld label="Due date"><input type="date" value={form.due_date} onChange={e=>upd('due_date',e.target.value)}/></Fld>
      <Fld label="Review date"><input type="date" value={form.review_date} onChange={e=>upd('review_date',e.target.value)}/></Fld>
      <Fld label="Scheduled date"><input type="date" value={form.scheduled_date} onChange={e=>upd('scheduled_date',e.target.value)}/></Fld>
      <Fld label="Scheduled time"><input type="time" value={form.scheduled_time} onChange={e=>upd('scheduled_time',e.target.value)}/></Fld>
      <Fld label="Person responsible"><input value={form.person_responsible} onChange={e=>upd('person_responsible',e.target.value)}/></Fld>
      <Fld label="Waiting for"><input value={form.waiting_for} onChange={e=>upd('waiting_for',e.target.value)}/></Fld>
      <Fld label="Communication notes"><textarea value={form.communication_notes} onChange={e=>upd('communication_notes',e.target.value)}/></Fld>
      <button disabled={!form.title.trim()} onClick={()=>onSubmit(form)}>Save</button>
    </Modal>
  )
}

function EditProjectModal({project,onClose,onSubmit}) {
  const [form,setForm]=useState({name:project.name||'',desired_outcome:project.desired_outcome||'',status:project.status||'active',area_type:project.area_type||'Personal',due_date:project.due_date||'',link_url:project.link_url||'',shared_with_emails:emailListToText(project.shared_with_emails)})
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}))
  return (
    <Modal title="✏️ Edit project" onClose={onClose}>
      <Fld label="Name *"><input value={form.name} onChange={e=>upd('name',e.target.value)}/></Fld>
      <Fld label="Desired outcome *"><textarea value={form.desired_outcome} onChange={e=>upd('desired_outcome',e.target.value)}/></Fld>
      <Fld label="Link"><input value={form.link_url} onChange={e=>upd('link_url',e.target.value)}/></Fld>
      <Fld label="Share (email)"><input value={form.shared_with_emails} onChange={e=>upd('shared_with_emails',e.target.value)}/></Fld>
      <Fld label="Status"><select value={form.status} onChange={e=>upd('status',e.target.value)}><option value="active">Active</option><option value="completed">Completed</option><option value="paused">Paused</option></select></Fld>
      <Fld label="Area"><select value={form.area_type} onChange={e=>upd('area_type',e.target.value)}><option value="Work">💼 Work</option><option value="Personal">🏠 Personal</option></select></Fld>
      <Fld label="Due date"><input type="date" value={form.due_date} onChange={e=>upd('due_date',e.target.value)}/></Fld>
      <button disabled={!form.name.trim()||!form.desired_outcome.trim()} onClick={()=>onSubmit(form)}>Save project</button>
    </Modal>
  )
}

function EditReferenceModal({reference,onClose,onSubmit}) {
  const [form,setForm]=useState({title:reference.title||'',content:reference.content||'',category:reference.category||'',tags:Array.isArray(reference.tags)?reference.tags.join(', '):'',link_url:reference.link_url||'',shared_with_emails:emailListToText(reference.shared_with_emails)})
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}))
  return (
    <Modal title="✏️ Edit reference" onClose={onClose}>
      <Fld label="Title *"><input value={form.title} onChange={e=>upd('title',e.target.value)}/></Fld>
      <Fld label="Content"><textarea value={form.content} onChange={e=>upd('content',e.target.value)}/></Fld>
      <Fld label="Link"><input value={form.link_url} onChange={e=>upd('link_url',e.target.value)}/></Fld>
      <Fld label="Share (email)"><input value={form.shared_with_emails} onChange={e=>upd('shared_with_emails',e.target.value)}/></Fld>
      <Fld label="Category"><input value={form.category} onChange={e=>upd('category',e.target.value)}/></Fld>
      <Fld label="Tags"><input placeholder="tag1, tag2..." value={form.tags} onChange={e=>upd('tags',e.target.value)}/></Fld>
      <button disabled={!form.title.trim()} onClick={()=>onSubmit(form)}>Save reference</button>
    </Modal>
  )
}

function SettingsModal({email,onClose,onSignOut,onRefresh,refreshing}) {
  return (
    <Modal title="⚙️ Settings" onClose={onClose}>
      <div className="settings-card">
        <div className="form-label">Signed in as</div>
        <div className="settings-email">{email}</div>
        <p className="settings-note">Data is secured by Supabase Auth and Row Level Security.</p>
        <div className="button-row two">
          <button onClick={onRefresh} disabled={refreshing}>{refreshing?'Loading...':'↻ Refresh'}</button>
          <button className="secondary" onClick={onSignOut}>→ Sign out</button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── UI Atoms ────────────────────────────────── */
function AreaSwitcher({value,onChange}) {
  return (
    <div className="area-switcher">
      {[['All','All'],['Work','Work'],['Personal','Personal']].map(([v,l])=>(
        <button key={v} className={value===v?'active':''} onClick={()=>onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

function Card({children,stripe}) {
  return (
    <article className="card">
      <div className={`card-stripe${stripe?` ${stripe}`:''}`}/>
      <div className="card-inner">{children}</div>
    </article>
  )
}
function CardBody({children})  { return <div className="card-body">{children}</div> }
function CardTags({children})  {
  const valid=React.Children.toArray(children).filter(Boolean)
  return valid.length?<div className="card-tags">{valid}</div>:null
}
function CardTag({label,value,variant,icon}) {
  if(!value&&value!==0)return null
  return (
    <span className={`card-tag${variant?` ${variant}`:''}`}>
      {icon&&<span aria-hidden="true">{icon} </span>}
      {label&&<span className="card-tag-label">{label} </span>}
      {value}
    </span>
  )
}
function TagLink({url}) {
  return <a className="card-tag" href={normalizeUrl(url)} target="_blank" rel="noreferrer">🔗 Link</a>
}
function CardFooter({children}) {
  const valid=React.Children.toArray(children).filter(Boolean)
  if(!valid.length)return null
  const rows=[]
  valid.forEach((c,i)=>{rows.push(c);if(i<valid.length-1)rows.push(<span key={`s${i}`} className="card-action-sep" aria-hidden="true"/>)})
  return <div className="card-footer">{rows}</div>
}
function CardAction({label,onClick,variant}) {
  return <button className={`card-action${variant?` ${variant}`:''}`} onClick={onClick}>{label}</button>
}
function Empty({text}) { return <div className="empty">{text}</div> }
function Fld({label,children}) {
  return (
    <div className="form-group">
      {label&&<div className="form-label">{label}</div>}
      {children}
    </div>
  )
}
function Meta({label,value}) {
  if(!value&&value!==0)return null
  return <p className="meta"><strong>{label}:</strong> {value}</p>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App/></React.StrictMode>
)
