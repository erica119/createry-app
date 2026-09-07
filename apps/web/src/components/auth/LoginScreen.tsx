import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { TenantConfig } from '../../lib/tenant'

interface Props {
  onGoogleSignIn: () => void
  onSignIn: (user: User) => void
  tenant?: TenantConfig | null
}

export default function LoginScreen({ onGoogleSignIn, onSignIn, tenant }: Props) {
  const brandName = tenant?.brand_name || 'Createry'
  const brandColor = tenant?.primary_color || '#C4622D'
  const tagline = tenant?.tagline || 'Personalized weekly meal plans built from recipes you love. Shopping lists ready to go.'
  const isCreatorBranded = !!tenant && tenant.id !== 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

  const handleGoogleSignIn = () => {
    if (tenant && isCreatorBranded) {
      localStorage.setItem('pending_tenant_id', tenant.id)
      localStorage.setItem('creator_subdomain', tenant.subdomain)
    }
    onGoogleSignIn()
  }
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const [tosAccepted, setTosAccepted] = useState(false)
  const TOS_VERSION = '2025-07-01'

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (mode === 'signup' && !tosAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy to create an account.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (mode === 'signup') {
        const { data: signUpData, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (signUpData.user) {
          await supabase.from('user_profiles').upsert({
            user_id: signUpData.user.id,
            tos_accepted_at: new Date().toISOString(),
            tos_version: TOS_VERSION,
          }, { onConflict: 'user_id' })
        }
        setConfirmationSent(true)
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        if (data.user) onSignIn(data.user)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.875rem 1rem', fontSize: '0.95rem',
    borderRadius: '10px', border: '2px solid #E8D5B7',
    background: '#FDF6EE', color: '#2C1810',
    fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const,
    marginBottom: '0.75rem',
  }

  if (confirmationSent) {
    return (
      <div style={{ minHeight: '100vh', background: '#FDF6EE', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
        <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem' }}>Check your email</h2>
        <p style={{ color: '#6B5C52', maxWidth: '360px', lineHeight: 1.6 }}>
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account and sign in.
        </p>
        <button onClick={() => setConfirmationSent(false)} style={{ marginTop: '1.5rem', background: 'none', border: 'none', color: '#C4622D', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: '600' }}>
          ← Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FDF6EE', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', padding: '2rem 2rem 5rem', textAlign: 'center', position: 'relative' }}>
      <footer style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '0.6rem 2rem', background: 'rgba(244,235,225,0.95)', borderTop: '1px solid #E8D5B7', display: 'flex', justifyContent: 'center', gap: '1.5rem', alignItems: 'center', zIndex: 10 }}>
        <a href="/terms" style={{ fontSize: '0.75rem', color: '#C4622D', textDecoration: 'none', fontWeight: '500' }}>Terms</a>
        <a href="/privacy" style={{ fontSize: '0.75rem', color: '#C4622D', textDecoration: 'none', fontWeight: '500' }}>Privacy</a>
        <a href="/cookies" style={{ fontSize: '0.75rem', color: '#C4622D', textDecoration: 'none', fontWeight: '500' }}>Cookies</a>
      </footer>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍽️</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', color: '#2C1810', margin: '0 0 0.5rem' }}>
        {isCreatorBranded ? brandName : <>{`Your Meals,`}<br /><em>Planned.</em></>}
      </h1>
      <p style={{ color: '#6B5C52', margin: '0 0 2.5rem', maxWidth: '400px', lineHeight: 1.6 }}>
        {tagline}
      </p>

      <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 24px rgba(44,24,16,0.08)', maxWidth: '380px', width: '100%' }}>

        {/* Mode toggle */}
        <div style={{ display: 'flex', background: '#FDF6EE', borderRadius: '10px', padding: '4px', marginBottom: '1.5rem' }}>
          {(['login', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              style={{
                flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none',
                background: mode === m ? 'white' : 'transparent',
                color: mode === m ? '#2C1810' : '#6B5C52',
                fontWeight: mode === m ? '600' : '400',
                fontSize: '0.875rem', cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* Email/password fields */}
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
          style={{ ...inputStyle, marginBottom: '1rem' }}
        />

        {error && (
          <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0 0 1rem', textAlign: 'left' }}>{error}</p>
        )}

        <button
          onClick={handleEmailAuth}
          disabled={loading}
          style={{
            width: '100%', padding: '0.875rem', background: brandColor, color: 'white',
            border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)',
            opacity: loading ? 0.7 : 1, marginBottom: '1rem',
          }}
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1, height: '1px', background: '#E8D5B7' }} />
          <span style={{ color: '#9B8B82', fontSize: '0.8rem' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: '#E8D5B7' }} />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogleSignIn}
          style={{
            width: '100%', padding: '0.875rem', background: 'white', color: '#2C1810',
            border: '2px solid #E8D5B7', borderRadius: '10px', fontSize: '0.95rem', fontWeight: '600',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {mode === 'signup' && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', margin: '1rem 0 0', textAlign: 'left' }}>
            <input
              type="checkbox"
              id="tos-accept"
              checked={tosAccepted}
              onChange={e => setTosAccepted(e.target.checked)}
              style={{ marginTop: '2px', accentColor: brandColor, flexShrink: 0, width: '15px', height: '15px', cursor: 'pointer' }}
            />
            <label htmlFor="tos-accept" style={{ fontSize: '0.78rem', color: '#6B5C52', lineHeight: 1.5, cursor: 'pointer' }}>
              I agree to the{' '}
              <a href="https://www.notion.so/Terms-of-Service-33cf2e6d5092819ab105d956ab1c5d62" target="_blank" rel="noopener noreferrer" style={{ color: brandColor, fontWeight: '600' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="https://www.notion.so/Privacy-Policy-33cf2e6d509281b282d0c0bdb872eff8" target="_blank" rel="noopener noreferrer" style={{ color: brandColor, fontWeight: '600' }}>Privacy Policy</a>
            </label>
          </div>
        )}
        {mode === 'login' && (
          <p style={{ color: '#9B8B82', fontSize: '0.8rem', margin: '1rem 0 0' }}>
            Free to get started. No credit card required.
          </p>
        )}
      </div>
    </div>
  )
}
