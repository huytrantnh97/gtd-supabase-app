import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './lib/supabaseClient'
import './styles.css'

const NAV = [
  ['inbox', '📥', 'Inbox'],
  ['today', '✅', 'Today'],
  ['waiting', '⏳', 'Waiting'],
  ['projects', '📁', 'Projects'],
  ['schedule', '🗓️', 'Schedule'],
  ['reference', '📚', 'Reference'],
  ['someday', '🌱', 'Someday'],
  ['done', '🏁', 'Done'],
]

const CASES = [
  { value: 'trash', label: 'Trash' },
  { value: 'reference', label: 'Reference' },
  { value: 'someday', label: 'Someday' },
  { value: 'action', label: 'I Do It' },
  { value: 'delegated', label: 'Delegate' },
  { value: 'scheduled', label: 'Schedule' },
  { value: 'project', label: 'Multi-Step / Project' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function nowISO() {
  return new Date().toISOString()
}

function toScheduledAt(date, time) {
  if (!date) return null
  return time ? `${date}T${time}:00` : `${date}T00:00:00`
}

function datePart(value) {
  if (!value) return ''
  return value.slice(0, 10)
}

function timePart(value) {
  if (!value || !value.includes('T')) return ''
  return value.slice(11, 16)
}

function isTodayOrEarlier(value) {
  if (!value) return false
  return value.slice(0, 10) <= todayISO()
}

function formatDateTime(value) {
  if (!value) return ''
  return value.replace('T', ' ').slice(0, 16)
}

function normalizeUrl(url) {
  const clean = (url || '').trim()
  if (!clean) return ''
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean
  return `https://${clean}`
}

function matchesArea(record, areaFilter) {
  if (areaFilter === 'All') return true
  return record.area_type === areaFilter
}

function parseEmailList(value) {
  return (value || '')
    .split(/[;,\n]/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .filter((email, index, array) => array.indexOf(email) === index)
}

function emailListToText(value) {
  if (!Array.isArray(value)) return ''
  return value.join(', ')
}

function sharedLabel(value) {
  if (!Array.isArray(value) || value.length === 0) return ''
  return value.join(', ')
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthMessage(error.message)
      setSession(data?.session ?? null)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  async function handleSignUp() {
    setAuthMessage('Creating account...')
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setAuthMessage(error.message)
      alert(error.message)
      return
    }

    setAuthMessage('Account created. Check your email if confirmation is enabled, then sign in.')
  }

  async function handleSignIn() {
    setAuthMessage('Signing in...')
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setAuthMessage(error.message)
      alert(error.message)
      return
    }

    setAuthMessage('')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (authLoading) return <div className="center-page">Loading...</div>

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>GTD App</h1>
          <p>Private task and knowledge processing.</p>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button onClick={handleSignIn}>Sign in</button>
          <button className="secondary" onClick={handleSignUp}>Create account</button>

          {authMessage && <div className="message">{authMessage}</div>}
        </div>
      </div>
    )
  }

  return <GTDApp session={session} onSignOut={handleSignOut} />
}

function GTDApp({ session, onSignOut }) {
  const user = session.user

  const [screen, setScreen] = useState('today')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')

  const [todayAreaFilter, setTodayAreaFilter] = useState('All')
  const [waitingAreaFilter, setWaitingAreaFilter] = useState('All')
  const [projectsAreaFilter, setProjectsAreaFilter] = useState('All')

  const [items, setItems] = useState([])
  const [projects, setProjects] = useState([])
  const [references, setReferences] = useState([])

  const [captureOpen, setCaptureOpen] = useState(false)
  const [processingItem, setProcessingItem] = useState(null)
  const [projectToView, setProjectToView] = useState(null)
  const [newProjectActionOpen, setNewProjectActionOpen] = useState(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [editItem, setEditItem] = useState(null)
  const [editProject, setEditProject] = useState(null)
  const [editReference, setEditReference] = useState(null)

  async function loadAll({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    setRefreshing(true)
    setNotice('')

    const [itemsRes, projectsRes, referencesRes] = await Promise.all([
      supabase.from('items').select('*').order('created_at', { ascending: true }),
      supabase.from('projects').select('*').order('created_at', { ascending: true }),
      supabase.from('references').select('*').order('created_at', { ascending: true }),
    ])

    const error = itemsRes.error || projectsRes.error || referencesRes.error

    if (error) {
      setNotice(error.message)
      alert(error.message)
    } else {
      setItems(itemsRes.data || [])
      setProjects(projectsRes.data || [])
      setReferences(referencesRes.data || [])
    }

    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function createInboxItem({ title, notes, source, linkUrl }) {
    const { error } = await supabase.from('items').insert({
      user_id: user.id,
      title,
      notes: notes || null,
      source: source || null,
      link_url: normalizeUrl(linkUrl) || null,
      shared_with_emails: [],
      status: 'inbox',
      case_type: null,
      area_type: null,
    })

    if (error) {
      alert(error.message)
      return
    }

    setCaptureOpen(false)
    await loadAll({ quiet: true })
  }

  async function completeItem(item) {
    const { error } = await supabase
      .from('items')
      .update({
        status: 'completed',
        completed_at: nowISO(),
      })
      .eq('id', item.id)

    if (error) alert(error.message)
    await loadAll({ quiet: true })
  }

  async function completeProject(project) {
    const { error } = await supabase
      .from('projects')
      .update({
        status: 'completed',
        completed_at: nowISO(),
      })
      .eq('id', project.id)

    if (error) alert(error.message)
    await loadAll({ quiet: true })
  }

  async function deleteAllDone() {
    if (!window.confirm('Delete all completed tasks and projects permanently? This cannot be undone.')) return

    const completedItemIds = items
      .filter((item) => item.status === 'completed')
      .map((item) => item.id)

    const completedProjectIds = projects
      .filter((project) => project.status === 'completed')
      .map((project) => project.id)

    const ops = []

    if (completedItemIds.length > 0) {
      ops.push(supabase.from('items').delete().in('id', completedItemIds))
    }

    if (completedProjectIds.length > 0) {
      ops.push(supabase.from('projects').delete().in('id', completedProjectIds))
    }

    if (ops.length === 0) return

    const results = await Promise.all(ops)
    const err = results.find((r) => r.error)?.error

    if (err) {
      alert(err.message)
      return
    }

    await loadAll({ quiet: true })
  }

  async function addProjectAction(project, data) {
    const { error } = await supabase.from('items').insert({
      user_id: user.id,
      title: data.title,
      notes: data.notes || null,
      link_url: normalizeUrl(data.link_url) || null,
      shared_with_emails: project.shared_with_emails || [],
      status: 'active',
      case_type: 'action',
      area_type: project.area_type,
      project_id: project.id,
      priority: data.priority || null,
      context: data.context || null,
      due_date: data.due_date || null,
    })

    if (error) {
      alert(error.message)
      return
    }

    setNewProjectActionOpen(null)
    await loadAll({ quiet: true })
  }

  async function updateItem(id, data) {
    const payload = {
      title: data.title,
      notes: data.notes || null,
      source: data.source || null,
      link_url: normalizeUrl(data.link_url) || null,
      shared_with_emails: parseEmailList(data.shared_with_emails),
      status: data.status,
      case_type: data.case_type || null,
      area_type: data.area_type || null,
      project_id: data.project_id || null,
      person_responsible: data.person_responsible || null,
      waiting_for: data.waiting_for || null,
      communication_notes: data.communication_notes || null,
      priority: data.priority || null,
      context: data.context || null,
      due_date: data.due_date || null,
      review_date: data.review_date || null,
      scheduled_at: data.scheduled_date ? toScheduledAt(data.scheduled_date, data.scheduled_time) : null,
    }

    const { error } = await supabase.from('items').update(payload).eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    setEditItem(null)
    await loadAll({ quiet: true })
  }

  async function updateProject(id, data) {
    const sharedWithEmails = parseEmailList(data.shared_with_emails)

    const { error } = await supabase
      .from('projects')
      .update({
        name: data.name,
        desired_outcome: data.desired_outcome,
        status: data.status,
        area_type: data.area_type,
        due_date: data.due_date || null,
        link_url: normalizeUrl(data.link_url) || null,
        shared_with_emails: sharedWithEmails,
      })
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    // Keep existing project actions visible to the same shared users.
    const itemShareUpdate = await supabase
      .from('items')
      .update({ shared_with_emails: sharedWithEmails })
      .eq('project_id', id)

    if (itemShareUpdate.error) {
      alert(itemShareUpdate.error.message)
      return
    }

    setEditProject(null)
    await loadAll({ quiet: true })
  }

  async function updateReference(id, data) {
    const { error } = await supabase
      .from('references')
      .update({
        title: data.title,
        content: data.content || null,
        category: data.category || null,
        tags: data.tags ? data.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
        link_url: normalizeUrl(data.link_url) || null,
        shared_with_emails: parseEmailList(data.shared_with_emails),
      })
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    setEditReference(null)
    await loadAll({ quiet: true })
  }

  const projectById = useMemo(() => {
    return Object.fromEntries(projects.map((project) => [project.id, project]))
  }, [projects])

  const inboxItems = items.filter((item) => item.status === 'inbox')

  const todayItems = items
    .filter((item) => {
      if (item.status !== 'active') return false
      if (!matchesArea(item, todayAreaFilter)) return false
      if (item.case_type === 'action') return true
      if (item.case_type === 'scheduled') return isTodayOrEarlier(item.scheduled_at)
      return false
    })
    .slice()
    .sort((a, b) => {
      const far = '9999-99-99'
      const aDue = a.due_date || far
      const bDue = b.due_date || far
      if (aDue !== bDue) return aDue.localeCompare(bDue)
      const aSched = a.scheduled_at || far
      const bSched = b.scheduled_at || far
      if (aSched !== bSched) return aSched.localeCompare(bSched)
      return (a.created_at || '').localeCompare(b.created_at || '')
    })

  const scheduledItems = items
    .filter((item) => item.status === 'active' && item.case_type === 'scheduled')
    .slice()
    .sort((a, b) => {
      const left = a.scheduled_at || ''
      const right = b.scheduled_at || ''
      return left.localeCompare(right)
    })

  const waitingItems = items.filter((item) => {
    return item.status === 'active'
      && item.case_type === 'delegated'
      && matchesArea(item, waitingAreaFilter)
  })

  const activeProjects = projects.filter((project) => {
    return project.status === 'active' && matchesArea(project, projectsAreaFilter)
  })

  const allActiveProjects = projects.filter((project) => project.status === 'active')

  const somedayItems = items.filter((item) => {
    return item.status === 'processed' && item.case_type === 'someday'
  })

  const doneItems = items
    .filter((item) => item.status === 'completed')
    .slice()
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))

  const doneProjects = projects
    .filter((project) => project.status === 'completed')
    .slice()
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))

  // Unfiltered counts for tab badges (ignore area filters so badges reflect full totals)
  const tabCounts = {
    inbox: items.filter((i) => i.status === 'inbox').length,
    today: items.filter((i) => {
      if (i.status !== 'active') return false
      if (i.case_type === 'action') return true
      if (i.case_type === 'scheduled') return isTodayOrEarlier(i.scheduled_at)
      return false
    }).length,
    waiting: items.filter((i) => i.status === 'active' && i.case_type === 'delegated').length,
    projects: projects.filter((p) => p.status === 'active').length,
    schedule: items.filter((i) => i.status === 'active' && i.case_type === 'scheduled').length,
    someday: items.filter((i) => i.status === 'processed' && i.case_type === 'someday').length,
  }

  const projectActions = (projectId) => {
    return items.filter((item) => {
      return item.project_id === projectId && item.status === 'active'
    })
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>GTD App</h1>
          <p>{user.email}</p>
        </div>

        <div className="header-actions">
          <button
            className="refresh-button"
            onClick={() => loadAll({ quiet: true })}
            disabled={refreshing}
            aria-label="Refresh data"
            title="Refresh data"
          >
            {refreshing ? '…' : '↻'}
          </button>

          <div className="header-menu">
            <button
              className="menu-button"
              onClick={() => setMenuOpen((current) => !current)}
              aria-label="Open menu"
              title="Settings"
            >
              ⚙
            </button>

            {menuOpen && (
              <div className="menu-popover">
                <button
                  className="menu-item"
                  onClick={() => {
                    setSettingsOpen(true)
                    setMenuOpen(false)
                  }}
                >
                  Settings
                </button>
                <button className="menu-item danger" onClick={onSignOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="tabs">
        {NAV.map(([key, icon, label]) => {
          const count = tabCounts[key]
          return (
            <button
              key={key}
              className={screen === key ? 'active' : ''}
              onClick={() => setScreen(key)}
              aria-label={`${label}${count ? ` (${count})` : ''}`}
              title={label}
            >
              <span className="tab-icon" aria-hidden="true">{icon}</span>
              {count > 0 && <span className="tab-badge">{count > 99 ? '99+' : count}</span>}
            </button>
          )
        })}
      </nav>

      {notice && <div className="notice">{notice}</div>}

      <main className="content">
        {loading && <p>Loading...</p>}

        {!loading && screen === 'inbox' && (
          <section>
            <ScreenTitle title="Inbox" subtitle={`${inboxItems.length} unprocessed item(s). Newest items are at the bottom.`} />
            {inboxItems.length === 0 && <Empty text="Nothing in Inbox. Tap + to capture something." />}

            <div className="list">
              {inboxItems.map((item) => (
                <Card key={item.id}>
                  <CardBody>
                    <h3>{item.title}</h3>
                    {item.notes && <p className="card-notes">{item.notes}</p>}
                    <CardTags>
                      <CardTag label="Source" value={item.source} />
                      <CardTag label="Shared" value={sharedLabel(item.shared_with_emails)} />
                      {item.link_url && (
                        <a className="card-tag" href={normalizeUrl(item.link_url)} target="_blank" rel="noreferrer">🔗 Link</a>
                      )}
                    </CardTags>
                  </CardBody>
                  <CardFooter>
                    <CardAction label="Process" onClick={() => setProcessingItem(item)} variant="primary" />
                    <CardAction label="Edit" onClick={() => setEditItem(item)} />
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'today' && (
          <section>
            <ScreenTitle
              title="Today / Do"
              subtitle="All active next actions, plus scheduled items that are due to appear today or earlier."
            />
            <AreaSwitcher value={todayAreaFilter} onChange={setTodayAreaFilter} />
            {todayItems.length === 0 && <Empty text="No actions to show for this area." />}

            <div className="list">
              {todayItems.map((item) => (
                <Card key={item.id}>
                  <CardBody>
                    <h3>{item.title}</h3>
                    {item.notes && <p className="card-notes">{item.notes}</p>}
                    <CardTags>
                      {item.due_date && <CardTag value={`📅 ${item.due_date}`} variant="urgent" />}
                      {item.scheduled_at && item.case_type === 'scheduled' && (
                        <CardTag value={`🕐 ${formatDateTime(item.scheduled_at)}`} variant="scheduled-tag" />
                      )}
                      <CardTag value={projectById[item.project_id]?.name} variant="project-tag" />
                      <CardTag label="Priority" value={item.priority} />
                      <CardTag label="@" value={item.context} />
                      <CardTag value={item.area_type} />
                      {item.link_url && (
                        <a className="card-tag" href={normalizeUrl(item.link_url)} target="_blank" rel="noreferrer">🔗 Link</a>
                      )}
                    </CardTags>
                  </CardBody>
                  <CardFooter>
                    <CardAction label="✓ Mark done" onClick={() => completeItem(item)} variant="primary" />
                    <CardAction label="Edit" onClick={() => setEditItem(item)} />
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'schedule' && (
          <section>
            <ScreenTitle
              title="Schedule"
              subtitle="All active scheduled items. This is separate from due dates."
            />
            {scheduledItems.length === 0 && <Empty text="No scheduled items." />}

            <div className="list">
              {scheduledItems.map((item) => (
                <Card key={item.id}>
                  <CardBody>
                    <h3>{item.title}</h3>
                    {item.notes && <p className="card-notes">{item.notes}</p>}
                    <CardTags>
                      {item.scheduled_at && <CardTag value={`🕐 ${formatDateTime(item.scheduled_at)}`} variant="scheduled-tag" />}
                      <CardTag value={item.area_type} />
                      <CardTag label="Shared" value={sharedLabel(item.shared_with_emails)} />
                      {item.link_url && (
                        <a className="card-tag" href={normalizeUrl(item.link_url)} target="_blank" rel="noreferrer">🔗 Link</a>
                      )}
                    </CardTags>
                  </CardBody>
                  <CardFooter>
                    <CardAction label="✓ Mark done" onClick={() => completeItem(item)} variant="primary" />
                    <CardAction label="Edit" onClick={() => setEditItem(item)} />
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'waiting' && (
          <section>
            <ScreenTitle title="Waiting / Delegated" subtitle="Check, communicate, and follow up" />
            <AreaSwitcher value={waitingAreaFilter} onChange={setWaitingAreaFilter} />
            {waitingItems.length === 0 && <Empty text="No delegated items for this area." />}

            <div className="list">
              {waitingItems.map((item) => (
                <Card key={item.id}>
                  <CardBody>
                    <h3>{item.waiting_for || item.title}</h3>
                    {item.communication_notes && <p className="card-notes">{item.communication_notes}</p>}
                    <CardTags>
                      <CardTag label="👤" value={item.person_responsible} />
                      {item.review_date && <CardTag value={`📅 Follow-up ${item.review_date}`} variant="urgent" />}
                      <CardTag value={item.area_type} />
                      {item.link_url && (
                        <a className="card-tag" href={normalizeUrl(item.link_url)} target="_blank" rel="noreferrer">🔗 Link</a>
                      )}
                    </CardTags>
                  </CardBody>
                  <CardFooter>
                    <CardAction label="✓ Resolved" onClick={() => completeItem(item)} variant="primary" />
                    <CardAction label="Edit" onClick={() => setEditItem(item)} />
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'projects' && (
          <section>
            <ScreenTitle title="Projects" subtitle="Multi-step outcomes. Next actions are items." />
            <AreaSwitcher value={projectsAreaFilter} onChange={setProjectsAreaFilter} />
            {activeProjects.length === 0 && <Empty text="No active projects for this area." />}

            <div className="list">
              {activeProjects.map((project) => {
                const actions = projectActions(project.id)
                return (
                  <Card key={project.id}>
                    <CardBody>
                      <h3>{project.name}</h3>
                      <p className="card-notes">{project.desired_outcome}</p>
                      <CardTags>
                        {project.due_date && <CardTag value={`📅 ${project.due_date}`} variant="urgent" />}
                        <CardTag value={project.area_type} />
                        <CardTag label={actions.length === 1 ? 'action' : 'actions'} value={actions.length} />
                        {project.link_url && (
                          <a className="card-tag" href={normalizeUrl(project.link_url)} target="_blank" rel="noreferrer">🔗 Link</a>
                        )}
                      </CardTags>

                      {actions.slice(0, 3).map((action) => (
                        <div className="mini-action" key={action.id}>
                          <span>{action.title}</span>
                          <button onClick={() => completeItem(action)}>✓ Done</button>
                        </div>
                      ))}
                    </CardBody>
                    <CardFooter>
                      <CardAction label="View" onClick={() => setProjectToView(project)} variant="primary" />
                      <CardAction label="+ Action" onClick={() => setNewProjectActionOpen(project)} />
                      <CardAction label="Edit" onClick={() => setEditProject(project)} />
                      <CardAction label="Complete" onClick={() => completeProject(project)} />
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        {!loading && screen === 'reference' && (
          <section>
            <ScreenTitle title="Reference" subtitle="Knowledge and information to keep" />
            {references.length === 0 && <Empty text="No reference notes." />}

            <div className="list">
              {references.map((reference) => (
                <Card key={reference.id}>
                  <CardBody>
                    <h3>{reference.title}</h3>
                    {reference.content && <p className="card-notes">{reference.content}</p>}
                    <CardTags>
                      <CardTag value={reference.category} />
                      {(Array.isArray(reference.tags) ? reference.tags : []).map((tag) => (
                        <CardTag key={tag} value={tag} />
                      ))}
                      {reference.link_url && (
                        <a className="card-tag" href={normalizeUrl(reference.link_url)} target="_blank" rel="noreferrer">🔗 Link</a>
                      )}
                    </CardTags>
                  </CardBody>
                  <CardFooter>
                    <CardAction label="Edit" onClick={() => setEditReference(reference)} />
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'someday' && (
          <section>
            <ScreenTitle title="Someday" subtitle="Maybe later, no commitment now" />
            {somedayItems.length === 0 && <Empty text="No someday items." />}

            <div className="list">
              {somedayItems.map((item) => (
                <Card key={item.id}>
                  <CardBody>
                    <h3>{item.title}</h3>
                    {item.notes && <p className="card-notes">{item.notes}</p>}
                    <CardTags>
                      {item.review_date && <CardTag value={`🔁 Review ${item.review_date}`} />}
                      <CardTag value={item.area_type} />
                      {item.link_url && (
                        <a className="card-tag" href={normalizeUrl(item.link_url)} target="_blank" rel="noreferrer">🔗 Link</a>
                      )}
                    </CardTags>
                  </CardBody>
                  <CardFooter>
                    <CardAction label="Edit" onClick={() => setEditItem(item)} />
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'done' && (
          <section>
            <ScreenTitle
              title="Done"
              subtitle={`${doneItems.length} completed task(s), ${doneProjects.length} completed project(s).`}
            />

            {(doneItems.length > 0 || doneProjects.length > 0) && (
              <button
                className="secondary small"
                style={{ marginBottom: '14px' }}
                onClick={deleteAllDone}
              >
                🗑 Delete all done
              </button>
            )}

            {doneProjects.length > 0 && (
              <>
                <h3 style={{ margin: '0 0 10px', fontSize: '18px', color: '#555' }}>Completed Projects</h3>
                <div className="list" style={{ marginBottom: '20px' }}>
                  {doneProjects.map((project) => (
                    <Card key={project.id}>
                      <CardBody>
                        <h3>{project.name}</h3>
                        <p className="card-notes">{project.desired_outcome}</p>
                        <CardTags>
                          <CardTag value={project.area_type} />
                          {project.completed_at && <CardTag value={`✓ ${formatDateTime(project.completed_at)}`} />}
                        </CardTags>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {doneItems.length === 0 && doneProjects.length === 0 && (
              <Empty text="No completed tasks or projects yet." />
            )}

            {doneItems.length > 0 && (
              <>
                <h3 style={{ margin: '0 0 10px', fontSize: '18px', color: '#555' }}>Completed Tasks</h3>
                <div className="list">
                  {doneItems.map((item) => (
                    <Card key={item.id}>
                      <CardBody>
                        <h3>{item.title}</h3>
                        {item.notes && <p className="card-notes">{item.notes}</p>}
                        <CardTags>
                          <CardTag value={projectById[item.project_id]?.name} variant="project-tag" />
                          <CardTag value={item.area_type} />
                          {item.completed_at && <CardTag value={`✓ ${formatDateTime(item.completed_at)}`} />}
                        </CardTags>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </main>

      <button className="fab" onClick={() => setCaptureOpen(true)}>+</button>

      {captureOpen && (
        <CaptureModal
          onClose={() => setCaptureOpen(false)}
          onSubmit={createInboxItem}
        />
      )}

      {processingItem && (
        <ProcessModal
          item={processingItem}
          userId={user.id}
          projects={allActiveProjects}
          onClose={() => setProcessingItem(null)}
          onDone={async () => {
            setProcessingItem(null)
            await loadAll({ quiet: true })
          }}
        />
      )}

      {projectToView && (
        <ProjectModal
          project={projectToView}
          actions={projectActions(projectToView.id)}
          onClose={() => setProjectToView(null)}
          onCompleteAction={completeItem}
          onEditAction={(item) => setEditItem(item)}
        />
      )}

      {newProjectActionOpen && (
        <ProjectActionModal
          project={newProjectActionOpen}
          onClose={() => setNewProjectActionOpen(null)}
          onSubmit={(data) => addProjectAction(newProjectActionOpen, data)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          email={user.email}
          onClose={() => setSettingsOpen(false)}
          onSignOut={onSignOut}
          onRefresh={() => loadAll({ quiet: true })}
          refreshing={refreshing}
        />
      )}

      {editItem && (
        <EditItemModal
          item={editItem}
          projects={allActiveProjects}
          onClose={() => setEditItem(null)}
          onSubmit={(data) => updateItem(editItem.id, data)}
        />
      )}

      {editProject && (
        <EditProjectModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onSubmit={(data) => updateProject(editProject.id, data)}
        />
      )}

      {editReference && (
        <EditReferenceModal
          reference={editReference}
          onClose={() => setEditReference(null)}
          onSubmit={(data) => updateReference(editReference.id, data)}
        />
      )}
    </div>
  )
}

function CaptureModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  return (
    <Modal title="Quick Capture" onClose={onClose}>
      <input
        autoFocus
        placeholder="Title / short description"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <textarea
        placeholder="Notes / details, optional"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />

      <input
        placeholder="Source, optional"
        value={source}
        onChange={(event) => setSource(event.target.value)}
      />

      <input
        placeholder="Link, optional"
        value={linkUrl}
        onChange={(event) => setLinkUrl(event.target.value)}
      />

      <button
        disabled={!title.trim()}
        onClick={() => onSubmit({ title: title.trim(), notes, source, linkUrl })}
      >
        Capture
      </button>
    </Modal>
  )
}

function ProcessModal({ item, userId, projects, onClose, onDone }) {
  const [caseType, setCaseType] = useState('')
  const [areaType, setAreaType] = useState('')
  const [form, setForm] = useState({
    reference_title: item.title,
    content: item.notes || '',
    notes: item.notes || '',
    link_url: item.link_url || '',
    shared_with_emails: emailListToText(item.shared_with_emails),
    next_action: item.title,
    action_to_do: item.title,
    project_name: item.title,
    desired_outcome: '',
    waiting_for: item.title,
  })
  const [saving, setSaving] = useState(false)

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function validate() {
    if (!caseType) return 'Choose one case.'

    if (['action', 'delegated', 'project'].includes(caseType) && !areaType) {
      return 'Choose Work or Personal.'
    }

    if (caseType === 'action' && !form.next_action.trim()) {
      return 'Next action is required.'
    }

    if (caseType === 'delegated' && (!form.person_responsible || !form.waiting_for)) {
      return 'Person responsible and waiting-for description are required.'
    }

    if (caseType === 'scheduled' && !form.scheduled_date) {
      return 'Scheduled date is required.'
    }

    if (caseType === 'project' && (!form.project_name.trim() || !form.desired_outcome.trim() || !form.next_action.trim())) {
      return 'Project name, desired outcome, and next action are required.'
    }

    return ''
  }

  async function save() {
    const validationMessage = validate()
    if (validationMessage) {
      alert(validationMessage)
      return
    }

    setSaving(true)
    const processedAt = nowISO()
    const linkUrl = normalizeUrl(form.link_url) || null
    const sharedWithEmails = parseEmailList(form.shared_with_emails)

    if (caseType === 'trash') {
      const { error } = await supabase
        .from('items')
        .update({
          status: 'archived',
          case_type: 'trash',
          link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
          processed_at: processedAt,
          archived_at: processedAt,
        })
        .eq('id', item.id)

      return finish(error)
    }

    if (caseType === 'reference') {
      const itemUpdate = await supabase
        .from('items')
        .update({
          status: 'processed',
          case_type: 'reference',
          link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
          processed_at: processedAt,
        })
        .eq('id', item.id)

      if (itemUpdate.error) return finish(itemUpdate.error)

      const referenceInsert = await supabase.from('references').insert({
        user_id: userId,
        item_id: item.id,
        title: form.reference_title || item.title,
        content: form.content || item.notes || null,
        category: form.category || null,
        tags: form.tags ? form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
        link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
      })

      return finish(referenceInsert.error)
    }

    if (caseType === 'someday') {
      const { error } = await supabase
        .from('items')
        .update({
          status: 'processed',
          case_type: 'someday',
          area_type: areaType || null,
          review_date: form.review_date || null,
          notes: form.notes || item.notes || null,
          link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
          processed_at: processedAt,
        })
        .eq('id', item.id)

      return finish(error)
    }

    if (caseType === 'action') {
      const { error } = await supabase
        .from('items')
        .update({
          title: form.next_action,
          notes: form.notes || item.notes || null,
          status: 'active',
          case_type: 'action',
          area_type: areaType,
          project_id: form.project_id || null,
          priority: form.priority || null,
          context: form.context || null,
          due_date: form.due_date || null,
          scheduled_at: null,
          link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
          processed_at: processedAt,
        })
        .eq('id', item.id)

      return finish(error)
    }

    if (caseType === 'delegated') {
      const { error } = await supabase
        .from('items')
        .update({
          title: form.waiting_for,
          status: 'active',
          case_type: 'delegated',
          area_type: areaType,
          person_responsible: form.person_responsible,
          waiting_for: form.waiting_for,
          communication_notes: form.communication_notes || null,
          review_date: form.follow_up_date || null,
          link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
          processed_at: processedAt,
        })
        .eq('id', item.id)

      return finish(error)
    }

    if (caseType === 'scheduled') {
      const { error } = await supabase
        .from('items')
        .update({
          title: form.action_to_do || item.title,
          notes: form.notes || item.notes || null,
          status: 'active',
          case_type: 'scheduled',
          area_type: areaType || null,
          due_date: null,
          scheduled_at: toScheduledAt(form.scheduled_date, form.scheduled_time),
          link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
          processed_at: processedAt,
        })
        .eq('id', item.id)

      return finish(error)
    }

    if (caseType === 'project') {
      const projectRes = await supabase
        .from('projects')
        .insert({
          user_id: userId,
          name: form.project_name,
          desired_outcome: form.desired_outcome,
          status: 'active',
          area_type: areaType,
          due_date: form.due_date || null,
          link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
        })
        .select()
        .single()

      if (projectRes.error) return finish(projectRes.error)

      const project = projectRes.data

      const { error } = await supabase
        .from('items')
        .update({
          title: form.next_action,
          notes: form.notes || item.notes || null,
          status: 'active',
          case_type: 'action',
          area_type: areaType,
          project_id: project.id,
          due_date: form.due_date || null,
          scheduled_at: null,
          link_url: linkUrl,
          shared_with_emails: sharedWithEmails,
          processed_at: processedAt,
        })
        .eq('id', item.id)

      return finish(error)
    }
  }

  function finish(error) {
    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    onDone()
  }

  return (
    <Modal title="Process Item" onClose={onClose}>
      <div className="process-item">
        <h3>{item.title}</h3>
        {item.notes && <p>{item.notes}</p>}
      </div>

      <label>What is this?</label>
      <select value={caseType} onChange={(event) => setCaseType(event.target.value)}>
        <option value="">Choose a case</option>
        {CASES.map((caseOption) => (
          <option key={caseOption.value} value={caseOption.value}>
            {caseOption.label}
          </option>
        ))}
      </select>

      <input
        placeholder="Link, optional"
        value={form.link_url}
        onChange={(event) => update('link_url', event.target.value)}
      />

      <input
        placeholder="Share with emails, optional"
        value={form.shared_with_emails}
        onChange={(event) => update('shared_with_emails', event.target.value)}
      />

      {['action', 'delegated', 'project'].includes(caseType) && (
        <>
          <label>Work or Personal *</label>
          <select value={areaType} onChange={(event) => setAreaType(event.target.value)}>
            <option value="">Choose</option>
            <option value="Work">Work</option>
            <option value="Personal">Personal</option>
          </select>
        </>
      )}

      {caseType === 'reference' && (
        <>
          <input
            placeholder="Reference title"
            value={form.reference_title}
            onChange={(event) => update('reference_title', event.target.value)}
          />
          <textarea
            placeholder="Reference content / notes"
            value={form.content}
            onChange={(event) => update('content', event.target.value)}
          />
          <input placeholder="Area or category" onChange={(event) => update('category', event.target.value)} />
          <input placeholder="Tags, comma separated" onChange={(event) => update('tags', event.target.value)} />
        </>
      )}

      {caseType === 'someday' && (
        <>
          <label>Review date</label>
          <input type="date" onChange={(event) => update('review_date', event.target.value)} />
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
          />
        </>
      )}

      {caseType === 'action' && (
        <>
          <input
            placeholder="Next action *"
            value={form.next_action}
            onChange={(event) => update('next_action', event.target.value)}
          />

          {projects.length > 0 && (
            <>
              <label>Linked project, optional</label>
              <select value={form.project_id || ''} onChange={(event) => update('project_id', event.target.value)}>
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <input placeholder="Priority, optional" onChange={(event) => update('priority', event.target.value)} />
          <input placeholder="Context, optional" onChange={(event) => update('context', event.target.value)} />
          <label>Due date / deadline, optional</label>
          <input type="date" onChange={(event) => update('due_date', event.target.value)} />
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
          />
        </>
      )}

      {caseType === 'delegated' && (
        <>
          <input placeholder="Person responsible *" onChange={(event) => update('person_responsible', event.target.value)} />
          <input
            placeholder="Waiting-for description *"
            value={form.waiting_for}
            onChange={(event) => update('waiting_for', event.target.value)}
          />
          <label>Follow-up date</label>
          <input type="date" onChange={(event) => update('follow_up_date', event.target.value)} />
          <textarea placeholder="Communication notes" onChange={(event) => update('communication_notes', event.target.value)} />
        </>
      )}

      {caseType === 'scheduled' && (
        <>
          <label>Scheduled date *</label>
          <input type="date" onChange={(event) => update('scheduled_date', event.target.value)} />
          <label>Scheduled time</label>
          <input type="time" onChange={(event) => update('scheduled_time', event.target.value)} />
          <input
            placeholder="Action to do at that time"
            value={form.action_to_do}
            onChange={(event) => update('action_to_do', event.target.value)}
          />
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
          />
        </>
      )}

      {caseType === 'project' && (
        <>
          <input
            placeholder="Project name *"
            value={form.project_name}
            onChange={(event) => update('project_name', event.target.value)}
          />
          <textarea
            placeholder="Desired outcome *"
            value={form.desired_outcome}
            onChange={(event) => update('desired_outcome', event.target.value)}
          />
          <input
            placeholder="First next action *"
            value={form.next_action}
            onChange={(event) => update('next_action', event.target.value)}
          />
          <label>Project due date / deadline, optional</label>
          <input type="date" onChange={(event) => update('due_date', event.target.value)} />
          <textarea
            placeholder="Notes for first action"
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
          />
        </>
      )}

      <button disabled={saving} onClick={save}>
        {saving ? 'Saving...' : 'Finish processing'}
      </button>
    </Modal>
  )
}

function ProjectModal({ project, actions, onClose, onCompleteAction, onEditAction }) {
  return (
    <Modal title={project.name} onClose={onClose}>
      <p>{project.desired_outcome}</p>
      <Meta label="Area" value={project.area_type} />
      <Meta label="Due date" value={project.due_date} />
      <Meta label="Shared with" value={sharedLabel(project.shared_with_emails)} />
      <LinkButton url={project.link_url} />

      <h3>Active project actions</h3>
      {actions.length === 0 && <Empty text="No active actions for this project." />}

      <div className="list">
        {actions.map((action) => (
          <Card key={action.id}>
            <CardBody>
              <h3>{action.title}</h3>
              {action.notes && <p className="card-notes">{action.notes}</p>}
              <CardTags>
                {action.due_date && <CardTag value={`📅 ${action.due_date}`} variant="urgent" />}
                <CardTag label="@" value={action.context} />
                {action.link_url && (
                  <a className="card-tag" href={normalizeUrl(action.link_url)} target="_blank" rel="noreferrer">🔗 Link</a>
                )}
              </CardTags>
            </CardBody>
            <CardFooter>
              <CardAction label="✓ Mark done" onClick={() => onCompleteAction(action)} variant="primary" />
              <CardAction label="Edit" onClick={() => onEditAction(action)} />
            </CardFooter>
          </Card>
        ))}
      </div>
    </Modal>
  )
}

function ProjectActionModal({ project, onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState('')
  const [context, setContext] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  return (
    <Modal title={`Add action to ${project.name}`} onClose={onClose}>
      <input autoFocus placeholder="Action title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <input placeholder="Link, optional" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} />
      <input placeholder="Priority" value={priority} onChange={(event) => setPriority(event.target.value)} />
      <input placeholder="Context" value={context} onChange={(event) => setContext(event.target.value)} />
      <label>Due date / deadline</label>
      <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      <button
        disabled={!title.trim()}
        onClick={() => onSubmit({
          title: title.trim(),
          notes,
          priority,
          context,
          due_date: dueDate,
          link_url: linkUrl,
        })}
      >
        Add action
      </button>
    </Modal>
  )
}

function EditItemModal({ item, projects, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: item.title || '',
    notes: item.notes || '',
    source: item.source || '',
    link_url: item.link_url || '',
    shared_with_emails: emailListToText(item.shared_with_emails),
    status: item.status || 'inbox',
    case_type: item.case_type || '',
    area_type: item.area_type || '',
    project_id: item.project_id || '',
    person_responsible: item.person_responsible || '',
    waiting_for: item.waiting_for || '',
    communication_notes: item.communication_notes || '',
    priority: item.priority || '',
    context: item.context || '',
    due_date: item.due_date || '',
    review_date: item.review_date || '',
    scheduled_date: datePart(item.scheduled_at),
    scheduled_time: timePart(item.scheduled_at),
  })

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <Modal title="Edit Item" onClose={onClose}>
      <input placeholder="Title" value={form.title} onChange={(event) => update('title', event.target.value)} />
      <textarea placeholder="Notes" value={form.notes} onChange={(event) => update('notes', event.target.value)} />
      <input placeholder="Source" value={form.source} onChange={(event) => update('source', event.target.value)} />
      <input placeholder="Link" value={form.link_url} onChange={(event) => update('link_url', event.target.value)} />
      <input placeholder="Share with emails, comma separated" value={form.shared_with_emails} onChange={(event) => update('shared_with_emails', event.target.value)} />

      <label>Status</label>
      <select value={form.status} onChange={(event) => update('status', event.target.value)}>
        <option value="inbox">inbox</option>
        <option value="active">active</option>
        <option value="processed">processed</option>
        <option value="completed">completed</option>
        <option value="archived">archived</option>
      </select>

      <label>Case type</label>
      <select value={form.case_type} onChange={(event) => update('case_type', event.target.value)}>
        <option value="">None</option>
        {CASES.map((caseOption) => (
          <option key={caseOption.value} value={caseOption.value}>
            {caseOption.label}
          </option>
        ))}
      </select>

      <label>Work or Personal</label>
      <select value={form.area_type} onChange={(event) => update('area_type', event.target.value)}>
        <option value="">None</option>
        <option value="Work">Work</option>
        <option value="Personal">Personal</option>
      </select>

      {projects.length > 0 && (
        <>
          <label>Project</label>
          <select value={form.project_id} onChange={(event) => update('project_id', event.target.value)}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </>
      )}

      <input placeholder="Priority" value={form.priority} onChange={(event) => update('priority', event.target.value)} />
      <input placeholder="Context" value={form.context} onChange={(event) => update('context', event.target.value)} />

      <label>Due date / deadline</label>
      <input type="date" value={form.due_date} onChange={(event) => update('due_date', event.target.value)} />

      <label>Scheduled date</label>
      <input type="date" value={form.scheduled_date} onChange={(event) => update('scheduled_date', event.target.value)} />

      <label>Scheduled time</label>
      <input type="time" value={form.scheduled_time} onChange={(event) => update('scheduled_time', event.target.value)} />

      <label>Review / follow-up date</label>
      <input type="date" value={form.review_date} onChange={(event) => update('review_date', event.target.value)} />

      <input placeholder="Person responsible" value={form.person_responsible} onChange={(event) => update('person_responsible', event.target.value)} />
      <input placeholder="Waiting for" value={form.waiting_for} onChange={(event) => update('waiting_for', event.target.value)} />
      <textarea placeholder="Communication notes" value={form.communication_notes} onChange={(event) => update('communication_notes', event.target.value)} />

      <button disabled={!form.title.trim()} onClick={() => onSubmit(form)}>Save item</button>
    </Modal>
  )
}

function EditProjectModal({ project, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: project.name || '',
    desired_outcome: project.desired_outcome || '',
    status: project.status || 'active',
    area_type: project.area_type || 'Personal',
    due_date: project.due_date || '',
    link_url: project.link_url || '',
    shared_with_emails: emailListToText(project.shared_with_emails),
  })

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <Modal title="Edit Project" onClose={onClose}>
      <input placeholder="Project name" value={form.name} onChange={(event) => update('name', event.target.value)} />
      <textarea placeholder="Desired outcome" value={form.desired_outcome} onChange={(event) => update('desired_outcome', event.target.value)} />
      <input placeholder="Link" value={form.link_url} onChange={(event) => update('link_url', event.target.value)} />
      <input placeholder="Share with emails, comma separated" value={form.shared_with_emails} onChange={(event) => update('shared_with_emails', event.target.value)} />

      <label>Status</label>
      <select value={form.status} onChange={(event) => update('status', event.target.value)}>
        <option value="active">active</option>
        <option value="completed">completed</option>
        <option value="paused">paused</option>
      </select>

      <label>Work or Personal</label>
      <select value={form.area_type} onChange={(event) => update('area_type', event.target.value)}>
        <option value="Work">Work</option>
        <option value="Personal">Personal</option>
      </select>

      <label>Due date / deadline</label>
      <input type="date" value={form.due_date} onChange={(event) => update('due_date', event.target.value)} />

      <button disabled={!form.name.trim() || !form.desired_outcome.trim()} onClick={() => onSubmit(form)}>
        Save project
      </button>
    </Modal>
  )
}

function EditReferenceModal({ reference, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: reference.title || '',
    content: reference.content || '',
    category: reference.category || '',
    tags: Array.isArray(reference.tags) ? reference.tags.join(', ') : '',
    link_url: reference.link_url || '',
    shared_with_emails: emailListToText(reference.shared_with_emails),
  })

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <Modal title="Edit Reference" onClose={onClose}>
      <input placeholder="Title" value={form.title} onChange={(event) => update('title', event.target.value)} />
      <textarea placeholder="Content" value={form.content} onChange={(event) => update('content', event.target.value)} />
      <input placeholder="Link" value={form.link_url} onChange={(event) => update('link_url', event.target.value)} />
      <input placeholder="Share with emails, comma separated" value={form.shared_with_emails} onChange={(event) => update('shared_with_emails', event.target.value)} />
      <input placeholder="Category" value={form.category} onChange={(event) => update('category', event.target.value)} />
      <input placeholder="Tags, comma separated" value={form.tags} onChange={(event) => update('tags', event.target.value)} />
      <button disabled={!form.title.trim()} onClick={() => onSubmit(form)}>Save reference</button>
    </Modal>
  )
}

function AreaSwitcher({ value, onChange }) {
  return (
    <div className="area-switcher" aria-label="Area filter">
      {['All', 'Work', 'Personal'].map((area) => (
        <button
          key={area}
          className={value === area ? 'active' : ''}
          onClick={() => onChange(area)}
        >
          {area}
        </button>
      ))}
    </div>
  )
}

function SettingsModal({ email, onClose, onSignOut, onRefresh, refreshing }) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <Card>
        <Meta label="Signed in as" value={email} />
        <p className="muted">Your data is protected by Supabase Auth and Row Level Security.</p>
        <div className="button-row two">
          <button onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
          <button className="secondary" onClick={onSignOut}>Sign out</button>
        </div>
      </Card>
    </Modal>
  )
}

function LinkButton({ url }) {
  if (!url) return null

  return (
    <a className="link-button" href={normalizeUrl(url)} target="_blank" rel="noreferrer">
      Open link
    </a>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="bottom-sheet">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function ScreenTitle({ title, subtitle }) {
  return (
    <div className="screen-title">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  )
}

function Card({ children }) {
  return <article className="card">{children}</article>
}

function CardBody({ children }) {
  return <div className="card-body">{children}</div>
}

function CardTags({ children }) {
  const validChildren = React.Children.toArray(children).filter(Boolean)
  if (validChildren.length === 0) return null
  return <div className="card-tags">{validChildren}</div>
}

function CardTag({ label, value, variant }) {
  if (!value && value !== 0) return null
  return (
    <span className={`card-tag${variant ? ` ${variant}` : ''}`}>
      {label && <span className="card-tag-label">{label} </span>}
      {value}
    </span>
  )
}

function CardFooter({ children }) {
  const validChildren = React.Children.toArray(children).filter(Boolean)
  if (validChildren.length === 0) return null
  const interleaved = []
  validChildren.forEach((child, i) => {
    interleaved.push(child)
    if (i < validChildren.length - 1) {
      interleaved.push(<span key={`sep-${i}`} className="card-action-sep" aria-hidden="true" />)
    }
  })
  return <div className="card-footer">{interleaved}</div>
}

function CardAction({ label, onClick, variant }) {
  return (
    <button
      className={`card-action${variant ? ` ${variant}` : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function Empty({ text }) {
  return <div className="empty">{text}</div>
}

function Meta({ label, value }) {
  if (!value && value !== 0) return null

  return (
    <p className="meta">
      <strong>{label}:</strong> {value}
    </p>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
