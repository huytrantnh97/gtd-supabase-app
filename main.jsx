import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './lib/supabaseClient'
import './styles.css'

const NAV = [
  ['inbox',    '📥', 'Inbox'],
  ['today',    '✅', 'Hôm nay'],
  ['waiting',  '⏳', 'Chờ'],
  ['projects', '📁', 'Dự án'],
  ['schedule', '🗓️', 'Lịch'],
  ['reference','📚', 'Tài liệu'],
  ['someday',  '🌱', 'Someday'],
  ['done',     '🏁', 'Xong'],
]

const CASES = [
  { value: 'trash',     label: '🗑 Xóa bỏ' },
  { value: 'reference', label: '📚 Lưu tham khảo' },
  { value: 'someday',   label: '🌱 Someday / Maybe' },
  { value: 'action',    label: '✅ Tôi tự làm' },
  { value: 'delegated', label: '👤 Giao cho người khác' },
  { value: 'scheduled', label: '🗓 Lên lịch' },
  { value: 'project',   label: '📁 Dự án nhiều bước' },
]

function todayISO() { return new Date().toISOString().slice(0, 10) }
function nowISO()   { return new Date().toISOString() }

function toScheduledAt(date, time) {
  if (!date) return null
  return time ? `${date}T${time}:00` : `${date}T00:00:00`
}
function datePart(v) { return v ? v.slice(0, 10) : '' }
function timePart(v) { return v && v.includes('T') ? v.slice(11, 16) : '' }
function isTodayOrEarlier(v) { return v ? v.slice(0, 10) <= todayISO() : false }
function formatDateTime(v) { return v ? v.replace('T', ' ').slice(0, 16) : '' }
function normalizeUrl(url) {
  const c = (url || '').trim()
  if (!c) return ''
  return c.startsWith('http://') || c.startsWith('https://') ? c : `https://${c}`
}
function matchesArea(rec, f) { return f === 'All' || rec.area_type === f }
function parseEmailList(v) {
  return (v || '').split(/[;,\n]/).map(e => e.trim().toLowerCase()).filter(Boolean)
    .filter((e, i, a) => a.indexOf(e) === i)
}
function emailListToText(v) { return Array.isArray(v) ? v.join(', ') : '' }
function sharedLabel(v) { return Array.isArray(v) && v.length ? v.join(', ') : '' }

/* ─── App root ─────────────────────────────── */
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
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSignIn() {
    setAuthMessage('Đang đăng nhập...')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const msg = error.message || JSON.stringify(error) || 'Lỗi không xác định'
      setAuthMessage(msg); alert(msg); return
    }
    setAuthMessage('')
  }

  async function handleSignUp() {
    setAuthMessage('Đang tạo tài khoản...')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      const msg = error.message || JSON.stringify(error) || 'Lỗi không xác định'
      setAuthMessage(msg); alert(msg); return
    }
    setAuthMessage('Tài khoản đã được tạo! Bạn có thể đăng nhập.')
  }

  async function handleSignOut() { await supabase.auth.signOut() }

  if (authLoading) return (
    <div className="center-page">
      <div style={{ color: 'var(--text-4)', fontSize: 14 }}>Đang tải...</div>
    </div>
  )

  if (!session) return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-logo">GTD App</p>
        <h1>Xin chào 👋</h1>
        <p>Quản lý công việc cá nhân theo phương pháp GTD.</p>
        <input type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Mật khẩu" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSignIn()} />
        <button onClick={handleSignIn}>Đăng nhập</button>
        <button className="secondary" onClick={handleSignUp}>Tạo tài khoản</button>
        {authMessage && <div className="message">{authMessage}</div>}
      </div>
    </div>
  )

  return <GTDApp session={session} onSignOut={handleSignOut} />
}

/* ─── Main GTD app ──────────────────────────── */
function GTDApp({ session, onSignOut }) {
  const user = session.user
  const [screen, setScreen] = useState('today')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
  const [editItem, setEditItem] = useState(null)
  const [editProject, setEditProject] = useState(null)
  const [editReference, setEditReference] = useState(null)

  async function loadAll({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    setRefreshing(true); setNotice('')
    const [ir, pr, rr] = await Promise.all([
      supabase.from('items').select('*').order('created_at', { ascending: true }),
      supabase.from('projects').select('*').order('created_at', { ascending: true }),
      supabase.from('references').select('*').order('created_at', { ascending: true }),
    ])
    const err = ir.error || pr.error || rr.error
    if (err) { setNotice(err.message); alert(err.message) }
    else { setItems(ir.data || []); setProjects(pr.data || []); setReferences(rr.data || []) }
    setLoading(false); setRefreshing(false)
  }

  useEffect(() => { loadAll() }, [])

  async function createInboxItem({ title, notes, source, linkUrl }) {
    const { error } = await supabase.from('items').insert({
      user_id: user.id, title, notes: notes || null, source: source || null,
      link_url: normalizeUrl(linkUrl) || null, shared_with_emails: [],
      status: 'inbox', case_type: null, area_type: null,
    })
    if (error) { alert(error.message); return }
    setCaptureOpen(false); await loadAll({ quiet: true })
  }

  async function completeItem(item) {
    const { error } = await supabase.from('items')
      .update({ status: 'completed', completed_at: nowISO() }).eq('id', item.id)
    if (error) alert(error.message)
    await loadAll({ quiet: true })
  }

  async function completeProject(project) {
    const { error } = await supabase.from('projects')
      .update({ status: 'completed', completed_at: nowISO() }).eq('id', project.id)
    if (error) alert(error.message)
    await loadAll({ quiet: true })
  }

  async function deleteAllDone() {
    if (!window.confirm('Xóa vĩnh viễn tất cả task và dự án đã hoàn thành? Không thể hoàn tác.')) return
    const itemIds = items.filter(i => i.status === 'completed').map(i => i.id)
    const projIds = projects.filter(p => p.status === 'completed').map(p => p.id)
    const ops = []
    if (itemIds.length > 0) ops.push(supabase.from('items').delete().in('id', itemIds))
    if (projIds.length > 0) ops.push(supabase.from('projects').delete().in('id', projIds))
    if (ops.length === 0) return
    const results = await Promise.all(ops)
    const err = results.find(r => r.error)?.error
    if (err) { alert(err.message); return }
    await loadAll({ quiet: true })
  }

  async function addProjectAction(project, data) {
    const { error } = await supabase.from('items').insert({
      user_id: user.id, title: data.title, notes: data.notes || null,
      link_url: normalizeUrl(data.link_url) || null,
      shared_with_emails: project.shared_with_emails || [],
      status: 'active', case_type: 'action', area_type: project.area_type,
      project_id: project.id, priority: data.priority || null,
      context: data.context || null, due_date: data.due_date || null,
    })
    if (error) { alert(error.message); return }
    setNewProjectActionOpen(null); await loadAll({ quiet: true })
  }

  async function updateItem(id, data) {
    const { error } = await supabase.from('items').update({
      title: data.title, notes: data.notes || null, source: data.source || null,
      link_url: normalizeUrl(data.link_url) || null,
      shared_with_emails: parseEmailList(data.shared_with_emails),
      status: data.status, case_type: data.case_type || null,
      area_type: data.area_type || null, project_id: data.project_id || null,
      person_responsible: data.person_responsible || null,
      waiting_for: data.waiting_for || null,
      communication_notes: data.communication_notes || null,
      priority: data.priority || null, context: data.context || null,
      due_date: data.due_date || null, review_date: data.review_date || null,
      scheduled_at: data.scheduled_date ? toScheduledAt(data.scheduled_date, data.scheduled_time) : null,
    }).eq('id', id)
    if (error) { alert(error.message); return }
    setEditItem(null); await loadAll({ quiet: true })
  }

  async function updateProject(id, data) {
    const shared = parseEmailList(data.shared_with_emails)
    const { error } = await supabase.from('projects').update({
      name: data.name, desired_outcome: data.desired_outcome,
      status: data.status, area_type: data.area_type,
      due_date: data.due_date || null,
      link_url: normalizeUrl(data.link_url) || null,
      shared_with_emails: shared,
    }).eq('id', id)
    if (error) { alert(error.message); return }
    const su = await supabase.from('items').update({ shared_with_emails: shared }).eq('project_id', id)
    if (su.error) { alert(su.error.message); return }
    setEditProject(null); await loadAll({ quiet: true })
  }

  async function updateReference(id, data) {
    const { error } = await supabase.from('references').update({
      title: data.title, content: data.content || null,
      category: data.category || null,
      tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      link_url: normalizeUrl(data.link_url) || null,
      shared_with_emails: parseEmailList(data.shared_with_emails),
    }).eq('id', id)
    if (error) { alert(error.message); return }
    setEditReference(null); await loadAll({ quiet: true })
  }

  const projectById = useMemo(() =>
    Object.fromEntries(projects.map(p => [p.id, p])), [projects])

  const inboxItems = items.filter(i => i.status === 'inbox')

  const todayItems = items.filter(i => {
    if (i.status !== 'active') return false
    if (!matchesArea(i, todayAreaFilter)) return false
    if (i.case_type === 'action') return true
    if (i.case_type === 'scheduled') return isTodayOrEarlier(i.scheduled_at)
    return false
  }).slice().sort((a, b) => {
    const far = '9999-99-99'
    const ad = a.due_date || far, bd = b.due_date || far
    if (ad !== bd) return ad.localeCompare(bd)
    const as_ = a.scheduled_at || far, bs = b.scheduled_at || far
    if (as_ !== bs) return as_.localeCompare(bs)
    return (a.created_at || '').localeCompare(b.created_at || '')
  })

  const scheduledItems = items
    .filter(i => i.status === 'active' && i.case_type === 'scheduled')
    .slice().sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''))

  const waitingItems = items.filter(i =>
    i.status === 'active' && i.case_type === 'delegated' && matchesArea(i, waitingAreaFilter))

  const activeProjects = projects.filter(p =>
    p.status === 'active' && matchesArea(p, projectsAreaFilter))

  const allActiveProjects = projects.filter(p => p.status === 'active')

  const somedayItems = items.filter(i =>
    i.status === 'processed' && i.case_type === 'someday')

  const doneItems = items.filter(i => i.status === 'completed')
    .slice().sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))

  const doneProjects = projects.filter(p => p.status === 'completed')
    .slice().sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))

  const tabCounts = {
    inbox:    items.filter(i => i.status === 'inbox').length,
    today:    items.filter(i => {
      if (i.status !== 'active') return false
      if (i.case_type === 'action') return true
      if (i.case_type === 'scheduled') return isTodayOrEarlier(i.scheduled_at)
      return false
    }).length,
    waiting:  items.filter(i => i.status === 'active' && i.case_type === 'delegated').length,
    projects: projects.filter(p => p.status === 'active').length,
    schedule: items.filter(i => i.status === 'active' && i.case_type === 'scheduled').length,
    someday:  items.filter(i => i.status === 'processed' && i.case_type === 'someday').length,
  }

  const projectActions = pid =>
    items.filter(i => i.project_id === pid && i.status === 'active')

  const today = todayISO()

  return (
    <div className="app" onClick={() => menuOpen && setMenuOpen(false)}>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-brand-icon">G</div>
          <div>
            <div className="header-brand-name">GTD App</div>
            <div className="header-brand-sub">{user.email}</div>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="btn-icon refresh-button"
            onClick={e => { e.stopPropagation(); loadAll({ quiet: true }) }}
            disabled={refreshing}
            title="Làm mới dữ liệu"
            aria-label="Refresh"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {refreshing
                ? <circle cx="12" cy="12" r="9" strokeDasharray="28" strokeDashoffset="10" />
                : <><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></>
              }
            </svg>
          </button>

          <div className="header-menu" onClick={e => e.stopPropagation()}>
            <button
              className="btn-icon menu-button"
              onClick={() => setMenuOpen(o => !o)}
              title="Menu"
              aria-label="Menu"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5"  r="1" fill="currentColor"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
                <circle cx="12" cy="19" r="1" fill="currentColor"/>
              </svg>
            </button>

            {menuOpen && (
              <div className="menu-popover">
                <button className="menu-item" onClick={() => { setSettingsOpen(true); setMenuOpen(false) }}>
                  ⚙️ Cài đặt
                </button>
                <button className="menu-item danger" onClick={onSignOut}>
                  → Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
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
              {count > 0
                ? <span className="tab-badge">{count > 99 ? '99+' : count}</span>
                : <span className="tab-badge" style={{ opacity: 0 }}>·</span>
              }
            </button>
          )
        })}
      </nav>

      {notice && <div className="notice">{notice}</div>}

      {/* ── Screens ── */}
      <main className="content">
        {loading && <p style={{ color: 'var(--text-4)', textAlign: 'center', padding: '40px 0' }}>Đang tải...</p>}

        {/* INBOX */}
        {!loading && screen === 'inbox' && (
          <section>
            <ScreenTitle title="Inbox" count={inboxItems.length} />
            {inboxItems.length === 0
              ? <Empty text="Inbox trống. Nhấn + để thêm." />
              : <div className="list">
                  {inboxItems.map(item => (
                    <Card key={item.id} stripe="accent">
                      <CardBody>
                        <h3>{item.title}</h3>
                        {item.notes && <p className="card-notes">{item.notes}</p>}
                        <CardTags>
                          <CardTag label="Nguồn" value={item.source} />
                          {item.link_url && <TagLink url={item.link_url} />}
                        </CardTags>
                      </CardBody>
                      <CardFooter>
                        <CardAction label="⚡ Xử lý" onClick={() => setProcessingItem(item)} variant="primary" />
                        <CardAction label="Sửa" onClick={() => setEditItem(item)} />
                      </CardFooter>
                    </Card>
                  ))}
                </div>
            }
          </section>
        )}

        {/* TODAY */}
        {!loading && screen === 'today' && (
          <section>
            <ScreenTitle title="Hôm nay" count={todayItems.length} />
            <AreaSwitcher value={todayAreaFilter} onChange={setTodayAreaFilter} />
            {todayItems.length === 0
              ? <Empty text="Không có việc gì. Tuyệt vời! 🎉" />
              : <div className="list">
                  {todayItems.map(item => {
                    const overdue = item.due_date && item.due_date < today
                    const stripe  = overdue ? 'urgent' : item.case_type === 'scheduled' ? 'ok' : undefined
                    return (
                      <Card key={item.id} stripe={stripe}>
                        <CardBody>
                          <h3>{item.title}</h3>
                          {item.notes && <p className="card-notes">{item.notes}</p>}
                          <CardTags>
                            {item.due_date && <CardTag value={item.due_date} variant="urgent" icon="📅" />}
                            {item.scheduled_at && item.case_type === 'scheduled' &&
                              <CardTag value={formatDateTime(item.scheduled_at)} variant="scheduled-tag" icon="🕐" />}
                            <CardTag value={projectById[item.project_id]?.name} variant="project-tag" />
                            <CardTag value={item.priority} />
                            <CardTag label="@" value={item.context} />
                            <CardTag value={item.area_type} />
                            {item.link_url && <TagLink url={item.link_url} />}
                          </CardTags>
                        </CardBody>
                        <CardFooter>
                          <CardAction label="✓ Hoàn thành" onClick={() => completeItem(item)} variant="primary" />
                          <CardAction label="Sửa" onClick={() => setEditItem(item)} />
                        </CardFooter>
                      </Card>
                    )
                  })}
                </div>
            }
          </section>
        )}

        {/* SCHEDULE */}
        {!loading && screen === 'schedule' && (
          <section>
            <ScreenTitle title="Lịch biểu" count={scheduledItems.length} />
            {scheduledItems.length === 0
              ? <Empty text="Không có lịch nào." />
              : <div className="list">
                  {scheduledItems.map(item => (
                    <Card key={item.id} stripe="ok">
                      <CardBody>
                        <h3>{item.title}</h3>
                        {item.notes && <p className="card-notes">{item.notes}</p>}
                        <CardTags>
                          {item.scheduled_at && <CardTag value={formatDateTime(item.scheduled_at)} variant="scheduled-tag" icon="🕐" />}
                          <CardTag value={item.area_type} />
                          {item.link_url && <TagLink url={item.link_url} />}
                        </CardTags>
                      </CardBody>
                      <CardFooter>
                        <CardAction label="✓ Hoàn thành" onClick={() => completeItem(item)} variant="primary" />
                        <CardAction label="Sửa" onClick={() => setEditItem(item)} />
                      </CardFooter>
                    </Card>
                  ))}
                </div>
            }
          </section>
        )}

        {/* WAITING */}
        {!loading && screen === 'waiting' && (
          <section>
            <ScreenTitle title="Đang chờ" count={waitingItems.length} />
            <AreaSwitcher value={waitingAreaFilter} onChange={setWaitingAreaFilter} />
            {waitingItems.length === 0
              ? <Empty text="Không có việc nào đang chờ." />
              : <div className="list">
                  {waitingItems.map(item => (
                    <Card key={item.id} stripe="accent">
                      <CardBody>
                        <h3>{item.waiting_for || item.title}</h3>
                        {item.communication_notes && <p className="card-notes">{item.communication_notes}</p>}
                        <CardTags>
                          <CardTag label="👤" value={item.person_responsible} />
                          {item.review_date && <CardTag value={`Follow-up ${item.review_date}`} variant="urgent" icon="📅" />}
                          <CardTag value={item.area_type} />
                          {item.link_url && <TagLink url={item.link_url} />}
                        </CardTags>
                      </CardBody>
                      <CardFooter>
                        <CardAction label="✓ Đã xong" onClick={() => completeItem(item)} variant="primary" />
                        <CardAction label="Sửa" onClick={() => setEditItem(item)} />
                      </CardFooter>
                    </Card>
                  ))}
                </div>
            }
          </section>
        )}

        {/* PROJECTS */}
        {!loading && screen === 'projects' && (
          <section>
            <ScreenTitle title="Dự án" count={activeProjects.length} />
            <AreaSwitcher value={projectsAreaFilter} onChange={setProjectsAreaFilter} />
            {activeProjects.length === 0
              ? <Empty text="Không có dự án nào đang hoạt động." />
              : <div className="list">
                  {activeProjects.map(project => {
                    const actions = projectActions(project.id)
                    return (
                      <Card key={project.id} stripe="accent">
                        <CardBody>
                          <h3>{project.name}</h3>
                          <p className="card-notes">{project.desired_outcome}</p>
                          <CardTags>
                            {project.due_date && <CardTag value={project.due_date} variant="urgent" icon="📅" />}
                            <CardTag value={project.area_type} />
                            <CardTag value={`${actions.length} việc`} />
                            {project.link_url && <TagLink url={project.link_url} />}
                          </CardTags>
                          {actions.slice(0, 3).map(action => (
                            <div className="mini-action" key={action.id}>
                              <span>{action.title}</span>
                              <button onClick={() => completeItem(action)}>✓ Xong</button>
                            </div>
                          ))}
                        </CardBody>
                        <CardFooter>
                          <CardAction label="Xem" onClick={() => setProjectToView(project)} variant="primary" />
                          <CardAction label="+ Việc" onClick={() => setNewProjectActionOpen(project)} />
                          <CardAction label="Sửa" onClick={() => setEditProject(project)} />
                          <CardAction label="Hoàn thành" onClick={() => completeProject(project)} />
                        </CardFooter>
                      </Card>
                    )
                  })}
                </div>
            }
          </section>
        )}

        {/* REFERENCE */}
        {!loading && screen === 'reference' && (
          <section>
            <ScreenTitle title="Tài liệu" count={references.length} />
            {references.length === 0
              ? <Empty text="Chưa có tài liệu nào." />
              : <div className="list">
                  {references.map(ref => (
                    <Card key={ref.id}>
                      <CardBody>
                        <h3>{ref.title}</h3>
                        {ref.content && <p className="card-notes">{ref.content}</p>}
                        <CardTags>
                          <CardTag value={ref.category} />
                          {(Array.isArray(ref.tags) ? ref.tags : []).map(tag => (
                            <CardTag key={tag} value={tag} />
                          ))}
                          {ref.link_url && <TagLink url={ref.link_url} />}
                        </CardTags>
                      </CardBody>
                      <CardFooter>
                        <CardAction label="Sửa" onClick={() => setEditReference(ref)} />
                      </CardFooter>
                    </Card>
                  ))}
                </div>
            }
          </section>
        )}

        {/* SOMEDAY */}
        {!loading && screen === 'someday' && (
          <section>
            <ScreenTitle title="Someday" count={somedayItems.length} />
            {somedayItems.length === 0
              ? <Empty text="Không có mục nào trong Someday." />
              : <div className="list">
                  {somedayItems.map(item => (
                    <Card key={item.id}>
                      <CardBody>
                        <h3>{item.title}</h3>
                        {item.notes && <p className="card-notes">{item.notes}</p>}
                        <CardTags>
                          {item.review_date && <CardTag value={`Review ${item.review_date}`} icon="🔁" />}
                          <CardTag value={item.area_type} />
                          {item.link_url && <TagLink url={item.link_url} />}
                        </CardTags>
                      </CardBody>
                      <CardFooter>
                        <CardAction label="Sửa" onClick={() => setEditItem(item)} />
                      </CardFooter>
                    </Card>
                  ))}
                </div>
            }
          </section>
        )}

        {/* DONE */}
        {!loading && screen === 'done' && (
          <section>
            <div className="screen-title">
              <h2>Đã xong</h2>
              <p>{doneItems.length} task · {doneProjects.length} dự án</p>
            </div>

            {(doneItems.length > 0 || doneProjects.length > 0) && (
              <button
                className="secondary small"
                style={{ marginBottom: 12 }}
                onClick={deleteAllDone}
              >
                🗑 Xóa tất cả
              </button>
            )}

            {doneItems.length === 0 && doneProjects.length === 0 && (
              <Empty text="Chưa có gì hoàn thành." />
            )}

            {doneProjects.length > 0 && (
              <>
                <SectionLabel text="Dự án hoàn thành" />
                <div className="list" style={{ marginBottom: 14 }}>
                  {doneProjects.map(p => (
                    <Card key={p.id}>
                      <CardBody>
                        <h3>{p.name}</h3>
                        {p.desired_outcome && <p className="card-notes">{p.desired_outcome}</p>}
                        <CardTags>
                          <CardTag value={p.area_type} />
                          {p.completed_at && <CardTag value={formatDateTime(p.completed_at)} icon="✓" />}
                        </CardTags>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {doneItems.length > 0 && (
              <>
                <SectionLabel text="Task hoàn thành" />
                <div className="list">
                  {doneItems.map(item => (
                    <Card key={item.id}>
                      <CardBody>
                        <h3>{item.title}</h3>
                        <CardTags>
                          <CardTag value={projectById[item.project_id]?.name} variant="project-tag" />
                          <CardTag value={item.area_type} />
                          {item.completed_at && <CardTag value={formatDateTime(item.completed_at)} icon="✓" />}
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

      {/* ── FAB ── */}
      <button className="fab" onClick={() => setCaptureOpen(true)} aria-label="Thêm mới">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      {/* ── Modals ── */}
      {captureOpen && <CaptureModal onClose={() => setCaptureOpen(false)} onSubmit={createInboxItem} />}

      {processingItem && (
        <ProcessModal item={processingItem} userId={user.id} projects={allActiveProjects}
          onClose={() => setProcessingItem(null)}
          onDone={async () => { setProcessingItem(null); await loadAll({ quiet: true }) }} />
      )}

      {projectToView && (
        <ProjectModal project={projectToView} actions={projectActions(projectToView.id)}
          onClose={() => setProjectToView(null)}
          onCompleteAction={completeItem}
          onEditAction={item => setEditItem(item)} />
      )}

      {newProjectActionOpen && (
        <ProjectActionModal project={newProjectActionOpen}
          onClose={() => setNewProjectActionOpen(null)}
          onSubmit={data => addProjectAction(newProjectActionOpen, data)} />
      )}

      {settingsOpen && (
        <SettingsModal email={user.email} onClose={() => setSettingsOpen(false)}
          onSignOut={onSignOut} onRefresh={() => loadAll({ quiet: true })} refreshing={refreshing} />
      )}

      {editItem && (
        <EditItemModal item={editItem} projects={allActiveProjects}
          onClose={() => setEditItem(null)}
          onSubmit={data => updateItem(editItem.id, data)} />
      )}

      {editProject && (
        <EditProjectModal project={editProject} onClose={() => setEditProject(null)}
          onSubmit={data => updateProject(editProject.id, data)} />
      )}

      {editReference && (
        <EditReferenceModal reference={editReference} onClose={() => setEditReference(null)}
          onSubmit={data => updateReference(editReference.id, data)} />
      )}
    </div>
  )
}

/* ─── Modals ────────────────────────────────── */
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="bottom-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Đóng">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function CaptureModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  return (
    <Modal title="✏️ Ghi chú nhanh" onClose={onClose}>
      <Fld label="Tiêu đề *">
        <input autoFocus placeholder="Việc cần làm, ý tưởng, thông tin..." value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && title.trim() && onSubmit({ title: title.trim(), notes, source, linkUrl })} />
      </Fld>
      <Fld label="Ghi chú">
        <textarea placeholder="Chi tiết, ngữ cảnh..." value={notes} onChange={e => setNotes(e.target.value)} />
      </Fld>
      <Fld label="Nguồn">
        <input placeholder="Email, cuộc họp, ý tưởng..." value={source} onChange={e => setSource(e.target.value)} />
      </Fld>
      <Fld label="Link">
        <input placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
      </Fld>
      <button disabled={!title.trim()} onClick={() => onSubmit({ title: title.trim(), notes, source, linkUrl })}>
        Lưu vào Inbox
      </button>
    </Modal>
  )
}

function ProcessModal({ item, userId, projects, onClose, onDone }) {
  const [caseType, setCaseType] = useState('')
  const [areaType, setAreaType] = useState('')
  const [form, setForm] = useState({
    reference_title: item.title, content: item.notes || '',
    notes: item.notes || '', link_url: item.link_url || '',
    shared_with_emails: emailListToText(item.shared_with_emails),
    next_action: item.title, action_to_do: item.title,
    project_name: item.title, desired_outcome: '', waiting_for: item.title,
  })
  const [saving, setSaving] = useState(false)
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function validate() {
    if (!caseType) return 'Chọn loại xử lý.'
    if (['action','delegated','project'].includes(caseType) && !areaType) return 'Chọn Công việc hoặc Cá nhân.'
    if (caseType === 'action' && !form.next_action.trim()) return 'Hành động tiếp theo là bắt buộc.'
    if (caseType === 'delegated' && (!form.person_responsible || !form.waiting_for)) return 'Người phụ trách và mô tả là bắt buộc.'
    if (caseType === 'scheduled' && !form.scheduled_date) return 'Ngày lên lịch là bắt buộc.'
    if (caseType === 'project' && (!form.project_name.trim() || !form.desired_outcome.trim() || !form.next_action.trim())) return 'Tên dự án, kết quả mong muốn, và hành động đầu tiên là bắt buộc.'
    return ''
  }

  async function save() {
    const msg = validate()
    if (msg) { alert(msg); return }
    setSaving(true)
    const pAt = nowISO()
    const lu = normalizeUrl(form.link_url) || null
    const sw = parseEmailList(form.shared_with_emails)

    if (caseType === 'trash') {
      const { error } = await supabase.from('items').update({ status: 'archived', case_type: 'trash', link_url: lu, shared_with_emails: sw, processed_at: pAt, archived_at: pAt }).eq('id', item.id)
      return fin(error)
    }
    if (caseType === 'reference') {
      const r1 = await supabase.from('items').update({ status: 'processed', case_type: 'reference', link_url: lu, shared_with_emails: sw, processed_at: pAt }).eq('id', item.id)
      if (r1.error) return fin(r1.error)
      const r2 = await supabase.from('references').insert({ user_id: userId, item_id: item.id, title: form.reference_title || item.title, content: form.content || item.notes || null, category: form.category || null, tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [], link_url: lu, shared_with_emails: sw })
      return fin(r2.error)
    }
    if (caseType === 'someday') {
      const { error } = await supabase.from('items').update({ status: 'processed', case_type: 'someday', area_type: areaType || null, review_date: form.review_date || null, notes: form.notes || item.notes || null, link_url: lu, shared_with_emails: sw, processed_at: pAt }).eq('id', item.id)
      return fin(error)
    }
    if (caseType === 'action') {
      const { error } = await supabase.from('items').update({ title: form.next_action, notes: form.notes || item.notes || null, status: 'active', case_type: 'action', area_type: areaType, project_id: form.project_id || null, priority: form.priority || null, context: form.context || null, due_date: form.due_date || null, scheduled_at: null, link_url: lu, shared_with_emails: sw, processed_at: pAt }).eq('id', item.id)
      return fin(error)
    }
    if (caseType === 'delegated') {
      const { error } = await supabase.from('items').update({ title: form.waiting_for, status: 'active', case_type: 'delegated', area_type: areaType, person_responsible: form.person_responsible, waiting_for: form.waiting_for, communication_notes: form.communication_notes || null, review_date: form.follow_up_date || null, link_url: lu, shared_with_emails: sw, processed_at: pAt }).eq('id', item.id)
      return fin(error)
    }
    if (caseType === 'scheduled') {
      const { error } = await supabase.from('items').update({ title: form.action_to_do || item.title, notes: form.notes || item.notes || null, status: 'active', case_type: 'scheduled', area_type: areaType || null, due_date: null, scheduled_at: toScheduledAt(form.scheduled_date, form.scheduled_time), link_url: lu, shared_with_emails: sw, processed_at: pAt }).eq('id', item.id)
      return fin(error)
    }
    if (caseType === 'project') {
      const pRes = await supabase.from('projects').insert({ user_id: userId, name: form.project_name, desired_outcome: form.desired_outcome, status: 'active', area_type: areaType, due_date: form.due_date || null, link_url: lu, shared_with_emails: sw }).select().single()
      if (pRes.error) return fin(pRes.error)
      const { error } = await supabase.from('items').update({ title: form.next_action, notes: form.notes || item.notes || null, status: 'active', case_type: 'action', area_type: areaType, project_id: pRes.data.id, due_date: form.due_date || null, scheduled_at: null, link_url: lu, shared_with_emails: sw, processed_at: pAt }).eq('id', item.id)
      return fin(error)
    }
  }

  function fin(error) {
    setSaving(false)
    if (error) { alert(error.message); return }
    onDone()
  }

  return (
    <Modal title="⚡ Xử lý" onClose={onClose}>
      <div className="process-item">
        <h3>{item.title}</h3>
        {item.notes && <p>{item.notes}</p>}
      </div>

      <Fld label="Đây là gì?">
        <select value={caseType} onChange={e => setCaseType(e.target.value)}>
          <option value="">Chọn loại xử lý...</option>
          {CASES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Fld>

      <Fld label="Link"><input placeholder="https://..." value={form.link_url} onChange={e => upd('link_url', e.target.value)} /></Fld>
      <Fld label="Chia sẻ với (email)"><input placeholder="email1, email2..." value={form.shared_with_emails} onChange={e => upd('shared_with_emails', e.target.value)} /></Fld>

      {['action','delegated','project'].includes(caseType) && (
        <Fld label="Khu vực *">
          <select value={areaType} onChange={e => setAreaType(e.target.value)}>
            <option value="">Chọn...</option>
            <option value="Work">💼 Công việc</option>
            <option value="Personal">🏠 Cá nhân</option>
          </select>
        </Fld>
      )}

      {caseType === 'reference' && <>
        <Fld label="Tiêu đề tài liệu"><input value={form.reference_title} onChange={e => upd('reference_title', e.target.value)} /></Fld>
        <Fld label="Nội dung"><textarea value={form.content} onChange={e => upd('content', e.target.value)} /></Fld>
        <Fld label="Danh mục"><input placeholder="Kỹ thuật, Pháp lý..." onChange={e => upd('category', e.target.value)} /></Fld>
        <Fld label="Tags"><input placeholder="tag1, tag2..." onChange={e => upd('tags', e.target.value)} /></Fld>
      </>}

      {caseType === 'someday' && <>
        <Fld label="Ngày review"><input type="date" onChange={e => upd('review_date', e.target.value)} /></Fld>
        <Fld label="Ghi chú"><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} /></Fld>
      </>}

      {caseType === 'action' && <>
        <Fld label="Hành động tiếp theo *"><input value={form.next_action} onChange={e => upd('next_action', e.target.value)} /></Fld>
        {projects.length > 0 && <Fld label="Dự án liên quan">
          <select value={form.project_id || ''} onChange={e => upd('project_id', e.target.value)}>
            <option value="">Không có dự án</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Fld>}
        <Fld label="Ưu tiên"><input placeholder="Cao / Bình thường..." onChange={e => upd('priority', e.target.value)} /></Fld>
        <Fld label="Ngữ cảnh @"><input placeholder="@Office, @Phone..." onChange={e => upd('context', e.target.value)} /></Fld>
        <Fld label="Deadline"><input type="date" onChange={e => upd('due_date', e.target.value)} /></Fld>
        <Fld label="Ghi chú"><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} /></Fld>
      </>}

      {caseType === 'delegated' && <>
        <Fld label="Người phụ trách *"><input placeholder="Tên người..." onChange={e => upd('person_responsible', e.target.value)} /></Fld>
        <Fld label="Đang chờ gì *"><input value={form.waiting_for} onChange={e => upd('waiting_for', e.target.value)} /></Fld>
        <Fld label="Ngày follow-up"><input type="date" onChange={e => upd('follow_up_date', e.target.value)} /></Fld>
        <Fld label="Ghi chú"><textarea placeholder="Nội dung trao đổi..." onChange={e => upd('communication_notes', e.target.value)} /></Fld>
      </>}

      {caseType === 'scheduled' && <>
        <Fld label="Ngày *"><input type="date" onChange={e => upd('scheduled_date', e.target.value)} /></Fld>
        <Fld label="Giờ"><input type="time" onChange={e => upd('scheduled_time', e.target.value)} /></Fld>
        <Fld label="Việc cần làm lúc đó"><input value={form.action_to_do} onChange={e => upd('action_to_do', e.target.value)} /></Fld>
        <Fld label="Ghi chú"><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} /></Fld>
      </>}

      {caseType === 'project' && <>
        <Fld label="Tên dự án *"><input value={form.project_name} onChange={e => upd('project_name', e.target.value)} /></Fld>
        <Fld label="Kết quả mong muốn *"><textarea value={form.desired_outcome} onChange={e => upd('desired_outcome', e.target.value)} /></Fld>
        <Fld label="Hành động đầu tiên *"><input value={form.next_action} onChange={e => upd('next_action', e.target.value)} /></Fld>
        <Fld label="Deadline dự án"><input type="date" onChange={e => upd('due_date', e.target.value)} /></Fld>
        <Fld label="Ghi chú"><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} /></Fld>
      </>}

      <button disabled={saving} onClick={save}>{saving ? 'Đang lưu...' : 'Hoàn tất xử lý'}</button>
    </Modal>
  )
}

function ProjectModal({ project, actions, onClose, onCompleteAction, onEditAction }) {
  return (
    <Modal title={project.name} onClose={onClose}>
      <div className="process-item">
        <p>{project.desired_outcome}</p>
        {project.due_date && <p style={{ fontSize: 12, color: 'var(--red-text)', marginTop: 4 }}>📅 Deadline: {project.due_date}</p>}
      </div>
      {project.link_url && <a className="link-button" href={normalizeUrl(project.link_url)} target="_blank" rel="noreferrer">🔗 Mở link</a>}
      <SectionLabel text={`${actions.length} hành động đang mở`} />
      {actions.length === 0
        ? <Empty text="Chưa có hành động nào." />
        : <div className="list">
            {actions.map(action => (
              <Card key={action.id} stripe="ok">
                <CardBody>
                  <h3>{action.title}</h3>
                  {action.notes && <p className="card-notes">{action.notes}</p>}
                  <CardTags>
                    {action.due_date && <CardTag value={action.due_date} variant="urgent" icon="📅" />}
                    <CardTag label="@" value={action.context} />
                    {action.link_url && <TagLink url={action.link_url} />}
                  </CardTags>
                </CardBody>
                <CardFooter>
                  <CardAction label="✓ Xong" onClick={() => onCompleteAction(action)} variant="primary" />
                  <CardAction label="Sửa" onClick={() => onEditAction(action)} />
                </CardFooter>
              </Card>
            ))}
          </div>
      }
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
    <Modal title={`+ Việc cho: ${project.name}`} onClose={onClose}>
      <Fld label="Tiêu đề *"><input autoFocus placeholder="Hành động cụ thể..." value={title} onChange={e => setTitle(e.target.value)} /></Fld>
      <Fld label="Ghi chú"><textarea value={notes} onChange={e => setNotes(e.target.value)} /></Fld>
      <Fld label="Link"><input placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} /></Fld>
      <Fld label="Ưu tiên"><input value={priority} onChange={e => setPriority(e.target.value)} /></Fld>
      <Fld label="Ngữ cảnh @"><input placeholder="@Office..." value={context} onChange={e => setContext(e.target.value)} /></Fld>
      <Fld label="Deadline"><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></Fld>
      <button disabled={!title.trim()} onClick={() => onSubmit({ title: title.trim(), notes, priority, context, due_date: dueDate, link_url: linkUrl })}>
        Thêm hành động
      </button>
    </Modal>
  )
}

function EditItemModal({ item, projects, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: item.title || '', notes: item.notes || '', source: item.source || '',
    link_url: item.link_url || '', shared_with_emails: emailListToText(item.shared_with_emails),
    status: item.status || 'inbox', case_type: item.case_type || '',
    area_type: item.area_type || '', project_id: item.project_id || '',
    person_responsible: item.person_responsible || '', waiting_for: item.waiting_for || '',
    communication_notes: item.communication_notes || '', priority: item.priority || '',
    context: item.context || '', due_date: item.due_date || '',
    review_date: item.review_date || '', scheduled_date: datePart(item.scheduled_at),
    scheduled_time: timePart(item.scheduled_at),
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <Modal title="✏️ Sửa item" onClose={onClose}>
      <Fld label="Tiêu đề *"><input value={form.title} onChange={e => upd('title', e.target.value)} /></Fld>
      <Fld label="Ghi chú"><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} /></Fld>
      <Fld label="Link"><input value={form.link_url} onChange={e => upd('link_url', e.target.value)} /></Fld>
      <Fld label="Nguồn"><input value={form.source} onChange={e => upd('source', e.target.value)} /></Fld>
      <Fld label="Chia sẻ (email)"><input value={form.shared_with_emails} onChange={e => upd('shared_with_emails', e.target.value)} /></Fld>
      <Fld label="Trạng thái">
        <select value={form.status} onChange={e => upd('status', e.target.value)}>
          <option value="inbox">Inbox</option>
          <option value="active">Active</option>
          <option value="processed">Processed</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </Fld>
      <Fld label="Loại">
        <select value={form.case_type} onChange={e => upd('case_type', e.target.value)}>
          <option value="">—</option>
          <option value="action">Action</option>
          <option value="delegated">Delegated</option>
          <option value="scheduled">Scheduled</option>
          <option value="someday">Someday</option>
          <option value="reference">Reference</option>
          <option value="trash">Trash</option>
        </select>
      </Fld>
      <Fld label="Khu vực">
        <select value={form.area_type} onChange={e => upd('area_type', e.target.value)}>
          <option value="">—</option>
          <option value="Work">💼 Công việc</option>
          <option value="Personal">🏠 Cá nhân</option>
        </select>
      </Fld>
      {projects.length > 0 && <Fld label="Dự án">
        <select value={form.project_id} onChange={e => upd('project_id', e.target.value)}>
          <option value="">Không có</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Fld>}
      <Fld label="Ưu tiên"><input value={form.priority} onChange={e => upd('priority', e.target.value)} /></Fld>
      <Fld label="Ngữ cảnh @"><input value={form.context} onChange={e => upd('context', e.target.value)} /></Fld>
      <Fld label="Deadline"><input type="date" value={form.due_date} onChange={e => upd('due_date', e.target.value)} /></Fld>
      <Fld label="Ngày review"><input type="date" value={form.review_date} onChange={e => upd('review_date', e.target.value)} /></Fld>
      <Fld label="Ngày lên lịch"><input type="date" value={form.scheduled_date} onChange={e => upd('scheduled_date', e.target.value)} /></Fld>
      <Fld label="Giờ lên lịch"><input type="time" value={form.scheduled_time} onChange={e => upd('scheduled_time', e.target.value)} /></Fld>
      <Fld label="Người phụ trách"><input value={form.person_responsible} onChange={e => upd('person_responsible', e.target.value)} /></Fld>
      <Fld label="Đang chờ gì"><input value={form.waiting_for} onChange={e => upd('waiting_for', e.target.value)} /></Fld>
      <Fld label="Ghi chú trao đổi"><textarea value={form.communication_notes} onChange={e => upd('communication_notes', e.target.value)} /></Fld>
      <button disabled={!form.title.trim()} onClick={() => onSubmit(form)}>Lưu</button>
    </Modal>
  )
}

function EditProjectModal({ project, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: project.name || '', desired_outcome: project.desired_outcome || '',
    status: project.status || 'active', area_type: project.area_type || 'Personal',
    due_date: project.due_date || '', link_url: project.link_url || '',
    shared_with_emails: emailListToText(project.shared_with_emails),
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <Modal title="✏️ Sửa dự án" onClose={onClose}>
      <Fld label="Tên dự án *"><input value={form.name} onChange={e => upd('name', e.target.value)} /></Fld>
      <Fld label="Kết quả mong muốn *"><textarea value={form.desired_outcome} onChange={e => upd('desired_outcome', e.target.value)} /></Fld>
      <Fld label="Link"><input value={form.link_url} onChange={e => upd('link_url', e.target.value)} /></Fld>
      <Fld label="Chia sẻ (email)"><input value={form.shared_with_emails} onChange={e => upd('shared_with_emails', e.target.value)} /></Fld>
      <Fld label="Trạng thái">
        <select value={form.status} onChange={e => upd('status', e.target.value)}>
          <option value="active">Đang hoạt động</option>
          <option value="completed">Hoàn thành</option>
          <option value="paused">Tạm dừng</option>
        </select>
      </Fld>
      <Fld label="Khu vực">
        <select value={form.area_type} onChange={e => upd('area_type', e.target.value)}>
          <option value="Work">💼 Công việc</option>
          <option value="Personal">🏠 Cá nhân</option>
        </select>
      </Fld>
      <Fld label="Deadline"><input type="date" value={form.due_date} onChange={e => upd('due_date', e.target.value)} /></Fld>
      <button disabled={!form.name.trim() || !form.desired_outcome.trim()} onClick={() => onSubmit(form)}>Lưu dự án</button>
    </Modal>
  )
}

function EditReferenceModal({ reference, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: reference.title || '', content: reference.content || '',
    category: reference.category || '',
    tags: Array.isArray(reference.tags) ? reference.tags.join(', ') : '',
    link_url: reference.link_url || '',
    shared_with_emails: emailListToText(reference.shared_with_emails),
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <Modal title="✏️ Sửa tài liệu" onClose={onClose}>
      <Fld label="Tiêu đề *"><input value={form.title} onChange={e => upd('title', e.target.value)} /></Fld>
      <Fld label="Nội dung"><textarea value={form.content} onChange={e => upd('content', e.target.value)} /></Fld>
      <Fld label="Link"><input value={form.link_url} onChange={e => upd('link_url', e.target.value)} /></Fld>
      <Fld label="Chia sẻ (email)"><input value={form.shared_with_emails} onChange={e => upd('shared_with_emails', e.target.value)} /></Fld>
      <Fld label="Danh mục"><input value={form.category} onChange={e => upd('category', e.target.value)} /></Fld>
      <Fld label="Tags"><input placeholder="tag1, tag2..." value={form.tags} onChange={e => upd('tags', e.target.value)} /></Fld>
      <button disabled={!form.title.trim()} onClick={() => onSubmit(form)}>Lưu tài liệu</button>
    </Modal>
  )
}

function SettingsModal({ email, onClose, onSignOut, onRefresh, refreshing }) {
  return (
    <Modal title="⚙️ Cài đặt" onClose={onClose}>
      <div className="settings-card">
        <div className="form-label">Tài khoản đang đăng nhập</div>
        <div className="settings-email">{email}</div>
        <p className="settings-note">Dữ liệu được bảo vệ bởi Supabase Auth và Row Level Security.</p>
        <div className="button-row two">
          <button onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Đang tải...' : '↻ Làm mới'}</button>
          <button className="secondary" onClick={onSignOut}>→ Đăng xuất</button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── UI Atoms ──────────────────────────────── */
function ScreenTitle({ title, count }) {
  return (
    <div className="screen-title">
      <h2>{title}</h2>
      {count !== undefined && <p>{count} mục</p>}
    </div>
  )
}

function SectionLabel({ text }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
      color: 'var(--text-4)', margin: '14px 0 6px' }}>
      {text}
    </p>
  )
}

function AreaSwitcher({ value, onChange }) {
  return (
    <div className="area-switcher" aria-label="Lọc khu vực">
      {[['All','Tất cả'],['Work','Công việc'],['Personal','Cá nhân']].map(([v, l]) => (
        <button key={v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

/* Card system */
function Card({ children, stripe }) {
  return (
    <article className="card">
      <div className={`card-stripe${stripe ? ` ${stripe}` : ''}`} />
      <div className="card-inner">{children}</div>
    </article>
  )
}
function CardBody({ children })  { return <div className="card-body">{children}</div> }
function CardTags({ children }) {
  const valid = React.Children.toArray(children).filter(Boolean)
  return valid.length ? <div className="card-tags">{valid}</div> : null
}
function CardTag({ label, value, variant, icon }) {
  if (!value && value !== 0) return null
  return (
    <span className={`card-tag${variant ? ` ${variant}` : ''}`}>
      {icon && <span aria-hidden="true">{icon} </span>}
      {label && <span className="card-tag-label">{label} </span>}
      {value}
    </span>
  )
}
function TagLink({ url }) {
  return (
    <a className="card-tag" href={normalizeUrl(url)} target="_blank" rel="noreferrer">
      🔗 Link
    </a>
  )
}
function CardFooter({ children }) {
  const valid = React.Children.toArray(children).filter(Boolean)
  if (!valid.length) return null
  const rows = []
  valid.forEach((c, i) => {
    rows.push(c)
    if (i < valid.length - 1) rows.push(<span key={`s${i}`} className="card-action-sep" aria-hidden="true" />)
  })
  return <div className="card-footer">{rows}</div>
}
function CardAction({ label, onClick, variant }) {
  return <button className={`card-action${variant ? ` ${variant}` : ''}`} onClick={onClick}>{label}</button>
}
function Empty({ text }) { return <div className="empty">{text}</div> }

/* Form field wrapper */
function Fld({ label, children }) {
  return (
    <div className="form-group">
      {label && <div className="form-label">{label}</div>}
      {children}
    </div>
  )
}

/* Legacy shims (used in SettingsModal) */
function Meta({ label, value }) {
  if (!value && value !== 0) return null
  return <p className="meta"><strong>{label}:</strong> {value}</p>
}
function LinkButton({ url }) {
  if (!url) return null
  return <a className="link-button" href={normalizeUrl(url)} target="_blank" rel="noreferrer">🔗 Mở link</a>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
