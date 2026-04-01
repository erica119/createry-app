import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'
import OnboardingWizard from './components/onboarding/OnboardingWizard'

// Temporary hardcoded tenant ID for testing
// This will be replaced when we build the tenant resolution logic
const TEST_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setOnboardingComplete(false)
  }

  if (loading) return <p style={{ padding: '2rem' }}>Loading...</p>

  if (!user) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center', marginTop: '4rem' }}>
        <h1>Meal Plan App</h1>
        <p style={{ color: '#666' }}>Sign in to get started</p>
        <button
          onClick={signInWithGoogle}
          style={{
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            padding: '0.75rem 2rem',
            borderRadius: '6px',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  if (!onboardingComplete) {
    return (
      <div style={{ fontFamily: 'sans-serif' }}>
        <div style={{ padding: '1rem 2rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Meal Plan App</strong>
          <button onClick={signOut} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
        <OnboardingWizard
          user={user}
          tenantId={TEST_TENANT_ID}
          onComplete={() => setOnboardingComplete(true)}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Meal Plan App</h1>
        <button onClick={signOut} style={{ background: 'none', border: '1px solid #ddd', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
      <p>✅ Signed in as: {user.email}</p>
      <p>✅ Onboarding complete!</p>
      <p style={{ color: '#666' }}>Dashboard coming soon...</p>
    </div>
  )
}

export default App