import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './lib/supabaseClient'
import './styles.css'

const cases = [
  ['trash','Trash'], ['reference','Reference'], ['someday','Someday'],
  ['i_do_it','I Do It'], ['delegate','Delegate'], ['schedule','Schedule'], ['project','Multi-Step / Project']
]
const nav = ['Inbox','Today','Waiting','Projects','Reference','Someday','Settings']
const key = s => s.toLowerCase()
const today = () => new Date().toISOString().slice(0,10)

function App(){
  const [session,setSession]=useState(null),[loading,setLoading]=useState(true)
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[msg,setMsg]=useState('')
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)})
    const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return()=>l.subscription.unsubscribe() },[])
  async function signUp(){ setMsg('Creating account...'); const {error}=await supabase.auth.signUp({email,password}); if(error){alert(error.message);setMsg(error.message)} else setMsg('Account created. Check email if confirmation is enabled, then sign in.') }
  async function signIn(){ setMsg('Signing in...'); const {error}=await supabase.auth.signInWithPassword({email,password}); if(error){alert(error.message);setMsg(error.message)} else setMsg('') }
  if(loading) return <div className="center">Loading...</div>
  if(!session) return <div className="auth"><div className="panel"><h1>GTD App</h1><p>Private task and knowledge processing.</p><input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button onClick={signIn}>Sign in</button><button className="secondary" onClick={signUp}>Create account</button>{msg&&<div className="msg">{msg}</div>}</div></div>
  return <Main session={session}/>
}

function Main({session}){
  const [screen,setScreen]=useState('inbox'),[items,setItems]=useState([]),[actions,setActions]=useState([]),[delegated,setDelegated]=useState([]),[projects,setProjects]=useState([]),[refs,setRefs]=useState([]),[someday,setSomeday]=useState([]),[cap,setCap]=useState(false),[proc,setProc]=useState(null),[loading,setLoading]=useState(false)
  const user=session.user
  async function load(){ setLoading(true); const [i,a,d,p,r,s]=await Promise.all([
    supabase.from('items').select('*').order('created_at',{ascending:false}),
    supabase.from('actions').select('*').is('completed_at',null).order('created_at',{ascending:false}),
    supabase.from('delegated_items').select('*').is('completed_at',null).order('created_at',{ascending:false}),
    supabase.from('projects').select('*').is('completed_at',null).order('created_at',{ascending:false}),
    supabase.from('reference_items').select('*, items(title,notes)').order('created_at',{ascending:false}),
    supabase.from('someday_items').select('*, items(title,notes)').order('created_at',{ascending:false})])
    const err=i.error||a.error||d.error||p.error||r.error||s.error; if(err) alert(err.message); else {setItems(i.data||[]);setActions(a.data||[]);setDelegated(d.data||[]);setProjects(p.data||[]);setRefs(r.data||[]);setSomeday(s.data||[])} setLoading(false)}
  useEffect(()=>{load()},[])
  async function signOut(){await supabase.auth.signOut()}
  async function done(table,id,extra={}){const {error}=await supabase.from(table).update({completed_at:new Date().toISOString(),...extra}).eq('id',id); if(error) alert(error.message); load()}
  const inbox=items.filter(x=>x.status==='unprocessed'), byId=Object.fromEntries(items.map(i=>[i.id,i]))
  const todays=actions.filter(a=>!a.completed_at && (!a.due_date || a.due_date<=today()) && (!a.scheduled_at || a.scheduled_at.slice(0,10)<=today()))
  return <div><header><div><h1>GTD App</h1><p>{user.email}</p></div><button onClick={signOut}>Sign out</button></header><nav>{nav.map(n=><button key={n} className={screen===key(n)?'active':''} onClick={()=>setScreen(key(n))}>{n}</button>)}</nav><main>{loading&&<p>Loading...</p>}
    {screen==='inbox'&&<Section title="Inbox" sub={`${inbox.length} unprocessed item(s)`}>{inbox.map(i=><Card key={i.id}><h3>{i.title}</h3><p>{i.notes}</p><button onClick={()=>setProc(i)}>Process</button></Card>)}</Section>}
    {screen==='today'&&<Section title="Today / Do" sub="Actions to do now">{todays.map(a=><Card key={a.id}><h3>{a.action_title}</h3><p>{byId[a.item_id]?.title}</p><small>{[a.priority,a.context,a.due_date,a.scheduled_at?.slice(0,16)].filter(Boolean).join(' • ')}</small><button onClick={()=>done('actions',a.id)}>Mark done</button></Card>)}</Section>}
    {screen==='waiting'&&<Section title="Waiting" sub="Check, communicate, follow up">{delegated.map(d=><Card key={d.id}><h3>{d.waiting_for}</h3><p>{d.person_responsible}</p><small>{d.follow_up_date}</small><button onClick={()=>done('delegated_items',d.id)}>Resolved</button></Card>)}</Section>}
    {screen==='projects'&&<Section title="Projects" sub="Plan and track progress">{projects.map(p=><Card key={p.id}><h3>{p.project_name}</h3><p>{p.desired_outcome}</p><small>Next: {p.next_action}</small><button onClick={()=>done('projects',p.id,{status:'completed'})}>Complete</button></Card>)}</Section>}
    {screen==='reference'&&<Section title="Reference" sub="Information to keep">{refs.map(r=><Card key={r.id}><h3>{r.items?.title}</h3><p>{r.items?.notes}</p><small>{r.category}</small></Card>)}</Section>}
    {screen==='someday'&&<Section title="Someday" sub="Maybe later">{someday.map(s=><Card key={s.id}><h3>{s.items?.title}</h3><p>{s.items?.notes}</p><small>{s.category} {s.review_date}</small></Card>)}</Section>}
    {screen==='settings'&&<Section title="Settings" sub="Account"><Card><p>{user.email}</p><button onClick={signOut}>Sign out</button></Card></Section>}
  </main><button className="fab" onClick={()=>setCap(true)}>+</button>{cap&&<Capture user={user} close={()=>setCap(false)} reload={load}/>} {proc&&<Process item={proc} user={user} close={()=>setProc(null)} reload={load}/>}</div>
}
function Section({title,sub,children}){return <section><h2>{title}</h2><p className="muted">{sub}</p><div className="list">{React.Children.count(children)?children:<div className="empty">Nothing here.</div>}</div></section>}
function Card({children}){return <article className="card">{children}</article>}
function Modal({title,children,close}){return <div className="back"><div className="sheet"><div className="head"><h2>{title}</h2><button onClick={close}>×</button></div><div className="body">{children}</div></div></div>}
function Capture({user,close,reload}){const [title,setTitle]=useState(''),[notes,setNotes]=useState(''),[source,setSource]=useState(''); async function save(){const {error}=await supabase.from('items').insert({user_id:user.id,title,notes,source,status:'unprocessed'}); if(error) alert(error.message); else {close(); reload()}} return <Modal title="Quick Capture" close={close}><input autoFocus placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)}/><textarea placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)}/><input placeholder="Source" value={source} onChange={e=>setSource(e.target.value)}/><button disabled={!title.trim()} onClick={save}>Capture</button></Modal>}
function Process({item,user,close,reload}){const [c,setC]=useState(''),[area,setArea]=useState(''),[f,setF]=useState({}); const u=(k,v)=>setF({...f,[k]:v}); async function finish(){
  if(!c) return alert('Choose a case.'); if(['i_do_it','delegate','project'].includes(c)&&!area) return alert('Choose Work or Personal.'); if(c==='i_do_it'&&!f.next_action) return alert('Next action is required.'); if(c==='delegate'&&(!f.person||!f.waiting)) return alert('Person and waiting-for are required.'); if(c==='schedule'&&!f.date) return alert('Scheduled date is required.'); if(c==='project'&&(!f.project||!f.outcome||!f.next_action)) return alert('Project name, outcome, and next action are required.');
  const now=new Date().toISOString(); let res=await supabase.from('items').update({status:c==='trash'?'archived':'processed',case_type:c,area_type:area||null,processed_at:now,archived_at:c==='trash'?now:null}).eq('id',item.id); if(res.error) return alert(res.error.message)
  let err=null; if(c==='reference') err=(await supabase.from('reference_items').insert({item_id:item.id,user_id:user.id,category:f.category||null,tags:f.tags?f.tags.split(',').map(x=>x.trim()):[]})).error
  if(c==='someday') err=(await supabase.from('someday_items').insert({item_id:item.id,user_id:user.id,category:f.category||null,review_date:f.review||null})).error
  if(c==='i_do_it') err=(await supabase.from('actions').insert({item_id:item.id,user_id:user.id,action_title:f.next_action,priority:f.priority||null,context:f.context||null,due_date:f.due||null,action_notes:f.notes||null})).error
  if(c==='delegate') err=(await supabase.from('delegated_items').insert({item_id:item.id,user_id:user.id,person_responsible:f.person,waiting_for:f.waiting,follow_up_date:f.follow||null,communication_notes:f.notes||null})).error
  if(c==='schedule') err=(await supabase.from('actions').insert({item_id:item.id,user_id:user.id,action_title:f.action||item.title,scheduled_at:`${f.date}T${f.time||'00:00'}:00`,action_notes:f.notes||null})).error
  if(c==='project') err=(await supabase.from('projects').insert({item_id:item.id,user_id:user.id,project_name:f.project,desired_outcome:f.outcome,next_action:f.next_action,status:'active',due_date:f.due||null})).error
  if(err) alert(err.message); else {close(); reload()}}
 return <Modal title="Process Item" close={close}><Card><h3>{item.title}</h3><p>{item.notes}</p></Card><select value={c} onChange={e=>setC(e.target.value)}><option value="">What is this?</option>{cases.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>{['i_do_it','delegate','project'].includes(c)&&<select value={area} onChange={e=>setArea(e.target.value)}><option value="">Work or Personal</option><option>Work</option><option>Personal</option></select>}{['reference','someday'].includes(c)&&<input placeholder="Category" onChange={e=>u('category',e.target.value)}/>} {c==='reference'&&<input placeholder="Tags comma separated" onChange={e=>u('tags',e.target.value)}/>} {c==='someday'&&<input type="date" onChange={e=>u('review',e.target.value)}/>} {c==='i_do_it'&&<><input placeholder="Next action" onChange={e=>u('next_action',e.target.value)}/><input placeholder="Priority" onChange={e=>u('priority',e.target.value)}/><input placeholder="Context" onChange={e=>u('context',e.target.value)}/><input type="date" onChange={e=>u('due',e.target.value)}/></>} {c==='delegate'&&<><input placeholder="Person responsible" onChange={e=>u('person',e.target.value)}/><input placeholder="Waiting for" onChange={e=>u('waiting',e.target.value)}/><input type="date" onChange={e=>u('follow',e.target.value)}/></>} {c==='schedule'&&<><input type="date" onChange={e=>u('date',e.target.value)}/><input type="time" onChange={e=>u('time',e.target.value)}/><input placeholder="Action to do" onChange={e=>u('action',e.target.value)}/></>} {c==='project'&&<><input placeholder="Project name" onChange={e=>u('project',e.target.value)}/><textarea placeholder="Desired outcome" onChange={e=>u('outcome',e.target.value)}/><input placeholder="Next action" onChange={e=>u('next_action',e.target.value)}/><input type="date" onChange={e=>u('due',e.target.value)}/></>}<textarea placeholder="Notes" onChange={e=>u('notes',e.target.value)}/><button onClick={finish}>Finish processing</button></Modal>}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
