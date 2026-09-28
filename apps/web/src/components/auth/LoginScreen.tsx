import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { takeAuthNotice } from '../../lib/verifiedSession'
import type { User } from '@supabase/supabase-js'
import type { TenantConfig } from '../../lib/tenant'
import BrandMark from '../shared/BrandMark'
import './LoginScreen.css'

interface Props {
  onGoogleSignIn: () => void
  onSignIn: (user: User) => void
  tenant?: TenantConfig | null
}

export default function LoginScreen({ onGoogleSignIn, onSignIn, tenant }: Props) {
  const brandColor = tenant?.primary_color || '#C9471F'
  const tagline = tenant?.tagline || 'Your recipes, your week, your way. Plan meals and take a ready-to-shop list with you.'
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
  const [authNotice] = useState(takeAuthNotice)
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

  if (confirmationSent) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAF3E8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.5rem' }}>Check your email</h2>
        <p style={{ color: '#52645A', maxWidth: '360px', lineHeight: 1.6 }}>
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account and sign in.
        </p>
        <button onClick={() => setConfirmationSent(false)} style={{ marginTop: '1.5rem', background: 'none', border: 'none', color: '#C9471F', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: '600' }}>
          ← Back to sign in
        </button>
      </div>
    )
  }

  return (
    <main className="login-page" style={{ '--login-accent': brandColor } as React.CSSProperties}>
      <section className="login-story" aria-label="Createry meal planning">
        <div className="login-story-inner">
          <BrandMark tenant={tenant} onDark />
          <div className="login-story-copy">
            <span className="login-eyebrow">{isCreatorBranded ? 'A kitchen of your own' : 'GOOD FOOD, LESS GUESSWORK'}</span>
            <h1>{isCreatorBranded ? 'Your kitchen. Your way.' : <>Your week looks<br />better from here<span className="login-period">.</span></>}</h1>
            <p>{tagline}</p>
          </div>
          <div className="login-visual" aria-hidden="true">
            <div className="login-note login-note-top"><span>THE WEEK AHEAD</span><strong>A plan that fits real life.</strong></div>
            <div className="login-plan">
              <div className="login-plan-head"><span>THIS WEEK'S MENU</span><span>READY TO REVIEW ↗</span></div>
              <div className="login-plan-row"><i>M</i><div><strong>Lemon chicken bowls</strong><small>Tonight · 35 min</small></div><b>01</b></div>
              <div className="login-plan-row"><i>T</i><div><strong>Weeknight taco skillet</strong><small>Tomorrow · 25 min</small></div><b>02</b></div>
              <div className="login-plan-row"><i>W</i><div><strong>Garlic butter pasta</strong><small>Wednesday · 30 min</small></div><b>03</b></div>
              <div className="login-plan-foot">Recipes → plan → groceries <span>✦</span></div>
            </div>
            <div className="login-note login-note-bottom"><span>UP NEXT</span><strong>Shopping list, handled. ↗</strong></div>
          </div>
          <div className="login-story-bottom">Built for real kitchens and the creators behind them.</div>
        </div>
      </section>

      <section className="login-entry" aria-label="Account access">
        <div className="login-entry-inner">
          <div className="login-mobile-brand"><BrandMark tenant={tenant} /></div>
          <div className="login-heading">
            <span className="login-eyebrow">{isCreatorBranded ? 'YOUR BRANDED EXPERIENCE' : 'WELCOME TO CREATERY'}</span>
            <h2>{mode === 'login' ? 'Welcome back.' : 'Come on in.'}</h2>
            <p>{mode === 'login' ? 'Sign in and pick up where you left off.' : 'Start with the recipes you love.'}</p>
          </div>
          {authNotice && <p className="login-error" role="alert">{authNotice}</p>}

          <div className="login-tabs" role="tablist" aria-label="Account action">
            {(['login', 'signup'] as const).map(m => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => { setMode(m); setError(null) }}>
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form className="login-form" onSubmit={e => { e.preventDefault(); void handleEmailAuth() }}>
            <label htmlFor="login-email">Email address</label>
            <input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} />
            {error && <p className="login-error" role="alert">{error}</p>}
            {mode === 'signup' && (
              <label className="login-terms" htmlFor="tos-accept">
                <input type="checkbox" id="tos-accept" checked={tosAccepted} onChange={e => setTosAccepted(e.target.checked)} />
                <span>I agree to the <a href="https://www.notion.so/Terms-of-Service-33cf2e6d5092819ab105d956ab1c5d62" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="https://www.notion.so/Privacy-Policy-33cf2e6d509281b282d0c0bdb872eff8" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
              </label>
            )}
            <button className="login-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in →' : 'Create account →'}</button>
          </form>

          <div className="login-divider"><span>or continue with</span></div>
          <button className="login-google" type="button" onClick={handleGoogleSignIn}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <p className="login-reassurance">Free to get started. No credit card required.</p>
          <nav className="login-legal" aria-label="Legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies</a></nav>
        </div>
      </section>
    </main>
  )
}
