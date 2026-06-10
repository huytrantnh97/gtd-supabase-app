import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './lib/supabaseClient'
import './styles.css'

const NAV = [
  ['inbox', 'Inbox'],
  ['today', 'Today'],
  ['waiting', 'Waiting'],
  ['projects', 'Projects'],
  ['reference', 'Reference'],
  ['someday', 'Someday'],
  ['settings', 'Settings'],
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

function isTodayOrEarlier(value) {
  if (!value) return false
  return value.slice(0, 10) <= todayISO()
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

  const [screen, setScreen] = useState('inbox')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const [items, setItems] = useState([])
  const [projects, setProjects] = useState([])
  const [references, setReferences] = useState([])

  const [captureOpen, setCaptureOpen] = useState(false)
  const [processingItem, setProcessingItem] = useState(null)
  const [projectToView, setProjectToView] = useState(null)
  const [newProjectActionOpen, setNewProjectActionOpen] = useState(null)

  async function loadAll() {
    setLoading(true)
    setNotice('')

    const [itemsRes, projectsRes, referencesRes] = await Promise.all([
      supabase.from('items').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('references').select('*').order('created_at', { ascending: false }),
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
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function createInboxItem({ title, notes, source }) {
    const { error } = await supabase.from('items').insert({
      user_id: user.id,
      title,
      notes: notes || null,
      source: source || null,
      status: 'inbox',
      case_type: null,
      area_type: null,
    })

    if (error) {
      alert(error.message)
      return
    }

    setCaptureOpen(false)
    await loadAll()
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
    await loadAll()
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
    await loadAll()
  }

  async function addProjectAction(project, data) {
    const { error } = await supabase.from('items').insert({
      user_id: user.id,
      title: data.title,
      notes: data.notes || null,
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
    await loadAll()
  }

  const projectById = useMemo(() => {
    return Object.fromEntries(projects.map((project) => [project.id, project]))
  }, [projects])

  const inboxItems = items.filter((item) => item.status === 'inbox')

  const todayItems = items.filter((item) => {
    if (item.status !== 'active') return false
    if (!['action', 'scheduled'].includes(item.case_type)) return false

    if (item.case_type === 'scheduled') {
      return isTodayOrEarlier(item.scheduled_at)
    }

    if (item.due_date) {
      return item.due_date <= todayISO()
    }

    return true
  })

  const waitingItems = items.filter((item) => {
    return item.status === 'active' && item.case_type === 'delegated'
  })

  const activeProjects = projects.filter((project) => project.status === 'active')

  const somedayItems = items.filter((item) => {
    return item.status === 'processed' && item.case_type === 'someday'
  })

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
        <button className="small" onClick={onSignOut}>Sign out</button>
      </header>

      <nav className="tabs">
        {NAV.map(([key, label]) => (
          <button
            key={key}
            className={screen === key ? 'active' : ''}
            onClick={() => setScreen(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {notice && <div className="notice">{notice}</div>}

      <main className="content">
        {loading && <p>Loading...</p>}

        {!loading && screen === 'inbox' && (
          <section>
            <ScreenTitle title="Inbox" subtitle={`${inboxItems.length} unprocessed item(s)`} />
            {inboxItems.length === 0 && <Empty text="Nothing in Inbox. Tap + to capture something." />}

            <div className="list">
              {inboxItems.map((item) => (
                <Card key={item.id}>
                  <h3>{item.title}</h3>
                  {item.notes && <p>{item.notes}</p>}
                  {item.source && <span className="pill">Source: {item.source}</span>}
                  <button onClick={() => setProcessingItem(item)}>Process</button>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'today' && (
          <section>
            <ScreenTitle title="Today / Do" subtitle="Actions and scheduled items to act on now" />
            {todayItems.length === 0 && <Empty text="No actions for today." />}

            <div className="list">
              {todayItems.map((item) => (
                <Card key={item.id}>
                  <h3>{item.title}</h3>
                  {item.notes && <p>{item.notes}</p>}
                  <Meta label="Area" value={item.area_type} />
                  <Meta label="Project" value={projectById[item.project_id]?.name} />
                  <Meta label="Priority" value={item.priority} />
                  <Meta label="Context" value={item.context} />
                  <Meta label="Due date" value={item.due_date} />
                  <Meta label="Scheduled" value={item.scheduled_at?.replace('T', ' ').slice(0, 16)} />
                  <button onClick={() => completeItem(item)}>Mark done</button>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'waiting' && (
          <section>
            <ScreenTitle title="Waiting / Delegated" subtitle="Check, communicate, and follow up" />
            {waitingItems.length === 0 && <Empty text="No delegated items." />}

            <div className="list">
              {waitingItems.map((item) => (
                <Card key={item.id}>
                  <h3>{item.waiting_for || item.title}</h3>
                  <Meta label="Person responsible" value={item.person_responsible} />
                  <Meta label="Follow-up date" value={item.review_date} />
                  <Meta label="Area" value={item.area_type} />
                  {item.communication_notes && <p>{item.communication_notes}</p>}
                  <button onClick={() => completeItem(item)}>Resolved</button>
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'projects' && (
          <section>
            <ScreenTitle title="Projects" subtitle="Multi-step outcomes. Next actions are items." />
            {activeProjects.length === 0 && <Empty text="No active projects." />}

            <div className="list">
              {activeProjects.map((project) => {
                const actions = projectActions(project.id)
                return (
                  <Card key={project.id}>
                    <h3>{project.name}</h3>
                    <p>{project.desired_outcome}</p>
                    <Meta label="Area" value={project.area_type} />
                    <Meta label="Due date" value={project.due_date} />
                    <Meta label="Active actions" value={actions.length} />

                    {actions.slice(0, 3).map((action) => (
                      <div className="mini-action" key={action.id}>
                        <span>{action.title}</span>
                        <button className="tiny" onClick={() => completeItem(action)}>Done</button>
                      </div>
                    ))}

                    <div className="button-row">
                      <button onClick={() => setProjectToView(project)}>View</button>
                      <button className="secondary" onClick={() => setNewProjectActionOpen(project)}>Add action</button>
                      <button className="secondary" onClick={() => completeProject(project)}>Complete</button>
                    </div>
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
                  <h3>{reference.title}</h3>
                  {reference.content && <p>{reference.content}</p>}
                  <Meta label="Category" value={reference.category} />
                  <Meta label="Tags" value={Array.isArray(reference.tags) ? reference.tags.join(', ') : reference.tags} />
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
                  <h3>{item.title}</h3>
                  {item.notes && <p>{item.notes}</p>}
                  <Meta label="Area" value={item.area_type} />
                  <Meta label="Review date" value={item.review_date} />
                </Card>
              ))}
            </div>
          </section>
        )}

        {!loading && screen === 'settings' && (
          <section>
            <ScreenTitle title="Settings" subtitle="Basic account settings" />
            <Card>
              <Meta label="Signed in as" value={user.email} />
              <button onClick={onSignOut}>Sign out</button>
            </Card>
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
          projects={activeProjects}
          onClose={() => setProcessingItem(null)}
          onDone={async () => {
            setProcessingItem(null)
            await loadAll()
          }}
        />
      )}

      {projectToView && (
        <ProjectModal
          project={projectToView}
          actions={projectActions(projectToView.id)}
          onClose={() => setProjectToView(null)}
          onCompleteAction={completeItem}
        />
      )}

      {newProjectActionOpen && (
        <ProjectActionModal
          project={newProjectActionOpen}
          onClose={() => setNewProjectActionOpen(null)}
          onSubmit={(data) => addProjectAction(newProjectActionOpen, data)}
        />
      )}
    </div>
  )
}

function CaptureModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState('')

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

      <button
        disabled={!title.trim()}
        onClick={() => onSubmit({ title: title.trim(), notes, source })}
      >
        Capture
      </button>
    </Modal>
  )
}

function ProcessModal({ item, userId, projects, onClose, onDone }) {
  const [caseType, setCaseType] = useState('')
  const [areaType, setAreaType] = useState('')
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function validate() {
    if (!caseType) return 'Choose one case.'

    if (['action', 'delegated', 'project'].includes(caseType) && !areaType) {
      return 'Choose Work or Personal.'
    }

    if (caseType === 'action' && !form.next_action) {
      return 'Next action is required.'
    }

    if (caseType === 'delegated' && (!form.person_responsible || !form.waiting_for)) {
      return 'Person responsible and waiting-for description are required.'
    }

    if (caseType === 'scheduled' && !form.scheduled_date) {
      return 'Scheduled date is required.'
    }

    if (caseType === 'project' && (!form.project_name || !form.desired_outcome || !form.next_action)) {
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

    if (caseType === 'trash') {
      const { error } = await supabase
        .from('items')
        .update({
          status: 'archived',
          case_type: 'trash',
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
          scheduled_at: toScheduledAt(form.scheduled_date, form.scheduled_time),
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
          <input placeholder="Reference title" onChange={(event) => update('reference_title', event.target.value)} />
          <textarea placeholder="Reference content / notes" defaultValue={item.notes || ''} onChange={(event) => update('content', event.target.value)} />
          <input placeholder="Area or category" onChange={(event) => update('category', event.target.value)} />
          <input placeholder="Tags, comma separated" onChange={(event) => update('tags', event.target.value)} />
        </>
      )}

      {caseType === 'someday' && (
        <>
          <label>Review date</label>
          <input type="date" onChange={(event) => update('review_date', event.target.value)} />
          <textarea placeholder="Notes" defaultValue={item.notes || ''} onChange={(event) => update('notes', event.target.value)} />
        </>
      )}

      {caseType === 'action' && (
        <>
          <input placeholder="Next action *" onChange={(event) => update('next_action', event.target.value)} />

          {projects.length > 0 && (
            <>
              <label>Linked project, optional</label>
              <select onChange={(event) => update('project_id', event.target.value)}>
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
          <label>Due date</label>
          <input type="date" onChange={(event) => update('due_date', event.target.value)} />
          <textarea placeholder="Notes" defaultValue={item.notes || ''} onChange={(event) => update('notes', event.target.value)} />
        </>
      )}

      {caseType === 'delegated' && (
        <>
          <input placeholder="Person responsible *" onChange={(event) => update('person_responsible', event.target.value)} />
          <input placeholder="Waiting-for description *" onChange={(event) => update('waiting_for', event.target.value)} />
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
          <input placeholder="Action to do at that time" onChange={(event) => update('action_to_do', event.target.value)} />
          <textarea placeholder="Notes" defaultValue={item.notes || ''} onChange={(event) => update('notes', event.target.value)} />
        </>
      )}

      {caseType === 'project' && (
        <>
          <input placeholder="Project name *" onChange={(event) => update('project_name', event.target.value)} />
          <textarea placeholder="Desired outcome *" onChange={(event) => update('desired_outcome', event.target.value)} />
          <input placeholder="First next action *" onChange={(event) => update('next_action', event.target.value)} />
          <label>Due date</label>
          <input type="date" onChange={(event) => update('due_date', event.target.value)} />
          <textarea placeholder="Notes for first action" defaultValue={item.notes || ''} onChange={(event) => update('notes', event.target.value)} />
        </>
      )}

      <button disabled={saving} onClick={save}>
        {saving ? 'Saving...' : 'Finish processing'}
      </button>
    </Modal>
  )
}

function ProjectModal({ project, actions, onClose, onCompleteAction }) {
  return (
    <Modal title={project.name} onClose={onClose}>
      <p>{project.desired_outcome}</p>
      <Meta label="Area" value={project.area_type} />
      <Meta label="Due date" value={project.due_date} />

      <h3>Active project actions</h3>
      {actions.length === 0 && <Empty text="No active actions for this project." />}

      <div className="list">
        {actions.map((action) => (
          <Card key={action.id}>
            <h3>{action.title}</h3>
            {action.notes && <p>{action.notes}</p>}
            <Meta label="Due date" value={action.due_date} />
            <Meta label="Context" value={action.context} />
            <button onClick={() => onCompleteAction(action)}>Mark done</button>
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

  return (
    <Modal title={`Add action to ${project.name}`} onClose={onClose}>
      <input autoFocus placeholder="Action title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <input placeholder="Priority" value={priority} onChange={(event) => setPriority(event.target.value)} />
      <input placeholder="Context" value={context} onChange={(event) => setContext(event.target.value)} />
      <label>Due date</label>
      <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      <button
        disabled={!title.trim()}
        onClick={() => onSubmit({
          title: title.trim(),
          notes,
          priority,
          context,
          due_date: dueDate,
        })}
      >
        Add action
      </button>
    </Modal>
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

function Empty({ text }) {
  return <div className="empty">{text}</div>
}

function Meta({ label, value }) {
  if (!value) return null

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
