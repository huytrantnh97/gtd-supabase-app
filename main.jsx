import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './lib/supabaseClient'
import './styles.css'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        setMessage(`Session error: ${error.message}`)
      } else {
        setSession(data.session)
      }

      setLoading(false)
    }

    loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  async function handleSignUp() {
    setMessage('Creating account...')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(`Create account error: ${error.message}`)
      alert(`Create account error: ${error.message}`)
      return
    }

    console.log('Sign up data:', data)

    if (data.user) {
      setMessage('Account created. If email confirmation is enabled, check your email. Otherwise, try signing in now.')
      alert('Account created. Now try signing in.')
    } else {
      setMessage('No user returned. Check Supabase Auth settings.')
    }
  }

  async function handleSignIn() {
    setMessage('Signing in...')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(`Sign in error: ${error.message}`)
      alert(`Sign in error: ${error.message}`)
      return
    }

    console.log('Sign in data:', data)
    setSession(data.session)
    setMessage('Signed in successfully.')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setSession(null)
    setMessage('Signed out.')
  }

  if (loading) {
    return <div className="app-shell">Loading...</div>
  }

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>GTD App</h1>
          <p>Sign in to your private task system.</p>

          <label>Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button onClick={handleSignIn}>Sign in</button>
          <button className="secondary" onClick={handleSignUp}>
            Create account
          </button>

          {message && (
            <div className="message-box">
              {message}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>GTD App</h1>
          <p>{session.user.email}</p>
        </div>
        <button onClick={handleSignOut}>Sign out</button>
      </header>

      <main>
        <h2>You are signed in.</h2>
        <p>
          Auth is working. After this, we can reconnect the full Inbox / Today / Projects screens.
        </p>
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
