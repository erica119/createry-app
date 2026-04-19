import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
}

const PCLA_VERSION = '2025-07-01'

export default function CreatorOnboarding({ user }: Props) {
  const [step, setStep] = useState(0)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [brandName, setBrandName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [tagline, setTagline] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#C4622D')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pclaAccepted, setPclaAccepted] = useState(false)
  const [pclaError, setPclaError] = useState(false)
  const [aiAccepted, setAiAccepted] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly')
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  const handleSubdomain = (val: string) => {
    setSubdomain(val.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-'))
  }

  const handleSave = async () => {
    if (!brandName.trim()) { setError('Brand name is required.'); return }
    if (!subdomain.trim()) { setError('Subdomain is required.'); return }
    if (subdomain.length < 3) { setError('Subdomain must be at least 3 characters.'); return }

    setSaving(true)
    setError(null)

    try {
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .eq('subdomain', subdomain)
        .maybeSingle()
      if (existing) { setError('That subdomain is already taken. Try another.'); setSaving(false); return }

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: brandName.trim(),
          subdomain,
          owner_id: user.id,
          brand_name: brandName.trim(),
          tagline: tagline.trim() || null,
          primary_color: primaryColor,
          subscription_status: 'trialing',
        })
        .select('id')
        .single()
      if (tenantError) throw tenantError

      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          tenant_id: tenant.id,
          user_id: user.id,
          role: 'creator',
          display_name: brandName.trim(),
        })
      if (profileError) throw profileError

      setTenantId(tenant.id)
      setStep(1)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handlePclaAccept = async () => {
    if (!pclaAccepted) { setPclaError(true); return }
    if (!tenantId) return
    await supabase.from('tenants').update({
      pcla_accepted_at: new Date().toISOString(),
      pcla_version: PCLA_VERSION,
    }).eq('id', tenantId)
    setStep(2)
  }

  const handleAiAccept = async () => {
    if (!aiAccepted) { setAiError(true); return }
    if (!tenantId) return
    await supabase.from('tenants').update({
      creator_ai_consent_acknowledged_at: new Date().toISOString(),
    }).eq('id', tenantId)
    setStep(3)
  }

  const handleSubscribe = async () => {
    if (!tenantId || !user) return
    setSubscribing(true)
    setSubscribeError(null)
    try {
      const MONTHLY_PRICE = 'price_1TNdqeJzNLT19Phao9z7oH4u'
      const ANNUAL_PRICE = 'price_1TNdwNJzNLT19PhaZF15La1v'
      const price_id = selectedPlan === 'monthly' ? MONTHLY_PRICE : ANNUAL_PRICE
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/creator-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ price_id, creator_id: user.id, tenant_id: tenantId }),
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      if (!url) throw new Error('No checkout URL returned')
      window.location.href = url
    } catch (err: any) {
      setSubscribeError(err.message)
      setSubscribing(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem',
    borderRadius: '10px', border: '2px solid #E8D5B7',
    background: '#FDF6EE', color: '#2C1810',
    fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block', fontWeight: '600', color: '#2C1810',
    marginBottom: '0.5rem', fontSize: '0.875rem',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FDF6EE', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🍽️</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: '#2C1810', margin: '0 0 0.5rem' }}>
            Set up your creator account
          </h1>
          <p style={{ color: '#6B5C52', margin: '0 0 1rem', fontSize: '0.95rem' }}>
            Step {step + 1} of 4 — {['Brand Setup', 'Content License Agreement', 'AI Disclosure', 'Choose Your Plan'][step]}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width: i === step ? '24px' : '8px', height: '8px', borderRadius: '4px', background: i <= step ? '#C4622D' : '#E8D5B7', transition: 'all 0.3s ease' }} />
            ))}
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', border: '1px solid #E8D5B7', boxShadow: '0 4px 24px rgba(44,24,16,0.08)' }}>

          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={labelStyle}>Brand name *</label>
                <p style={{ color: '#9B8B82', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>This is what your audience will see</p>
                <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="e.g. Healthy with Hannah" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Subdomain *</label>
                <p style={{ color: '#9B8B82', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>Your app will live at <strong>{subdomain || 'yourname'}.plate.app</strong></p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="text" value={subdomain} onChange={e => handleSubdomain(e.target.value)} placeholder="yourname" style={{ ...inputStyle, flex: 1 }} />
                  <span style={{ color: '#6B5C52', fontWeight: '500', whiteSpace: 'nowrap' }}>.plate.app</span>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Tagline</label>
                <input type="text" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Meal plans made simple for busy families" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Brand color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} style={{ width: '48px', height: '48px', borderRadius: '10px', border: '2px solid #E8D5B7', cursor: 'pointer', padding: '2px' }} />
                  <div>
                    <p style={{ margin: '0 0 0.25rem', fontWeight: '600', color: '#2C1810', fontSize: '0.875rem' }}>{primaryColor}</p>
                    <p style={{ margin: 0, color: '#9B8B82', fontSize: '0.8rem' }}>Used for buttons and accents throughout your app</p>
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', background: primaryColor, color: 'white', fontWeight: '600', fontSize: '0.875rem', textAlign: 'center' }}>
                  Preview: Button color
                </div>
              </div>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                  <p style={{ color: '#dc2626', margin: 0, fontSize: '0.9rem' }}>{error}</p>
                </div>
              )}
              <button onClick={handleSave} disabled={saving} style={{ background: primaryColor, color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: saving ? 0.7 : 1, marginTop: '0.5rem' }}>
                {saving ? 'Setting up your account...' : 'Continue →'}
              </button>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem', fontSize: '1.3rem' }}>Platform Content License Agreement</h2>
              <p style={{ color: '#6B5C52', fontSize: '0.875rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>Before activating your creator dashboard, please review and accept the Platform Content License Agreement. This governs how your recipe content is hosted, displayed, and monetized on Plate.</p>
              <div style={{ background: '#FDF6EE', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {[
                  "You retain full ownership of all recipe content you upload",
                  "Plate receives a limited license to host and display your content to your audience only",
                  "Your content will never be shared with other creator tenants or used to train AI models without your consent",
                  "Plate takes a 20% platform fee on Recipe Pack sales — you receive 80% as Net Revenue",
                  "Upon termination, you can export your content within 30 days",
                ].map((point, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.875rem', color: '#4A3728', lineHeight: 1.5 }}>
                    <span style={{ color: '#C4622D', flexShrink: 0 }}>&#10003;</span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '0.8rem', color: '#9B8B82', margin: '0 0 1rem', lineHeight: 1.5 }}>
                Read the full agreement:{' '}
                <a href="https://www.notion.so/Platform-Content-License-Agreement-33cf2e6d5092814c8da2dd6bf170f032" target="_blank" rel="noopener noreferrer" style={{ color: '#C4622D', fontWeight: '600' }}>Platform Content License Agreement</a>
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: pclaError ? '0.5rem' : '1.25rem' }}>
                <input type="checkbox" id="pcla-accept" checked={pclaAccepted} onChange={e => { setPclaAccepted(e.target.checked); setPclaError(false) }} style={{ marginTop: '2px', flexShrink: 0, width: '16px', height: '16px', cursor: 'pointer', accentColor: '#C4622D' }} />
                <label htmlFor="pcla-accept" style={{ fontSize: '0.82rem', color: '#4A3728', lineHeight: 1.5, cursor: 'pointer' }}>
                  I have read and agree to the Platform Content License Agreement, including the 20% platform fee and content license terms.
                </label>
              </div>
              {pclaError && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 1rem' }}>Please accept the agreement to continue.</p>}
              <button onClick={handlePclaAccept} style={{ width: '100%', background: '#C4622D', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Accept and continue →
              </button>
              <button onClick={() => setStep(0)} style={{ width: '100%', background: 'none', border: 'none', color: '#9B8B82', padding: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.25rem' }}>
                Back
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem', fontSize: '1.3rem' }}>Choose your plan</h2>
              <p style={{ color: '#6B5C52', fontSize: '0.875rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>Start with a 7-day free trial. Cancel anytime.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <div
                  onClick={() => setSelectedPlan('monthly')}
                  style={{ border: selectedPlan === 'monthly' ? '2px solid #C4622D' : '2px solid #E8D5B7', borderRadius: '12px', padding: '1.25rem 1.5rem', cursor: 'pointer', background: selectedPlan === 'monthly' ? '#FFF9F5' : 'white', transition: 'all 0.2s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: '0 0 0.25rem', fontWeight: '700', color: '#2C1810', fontSize: '1rem' }}>Monthly</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B5C52' }}>Flexible, cancel anytime</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: '#2C1810', fontWeight: '700' }}>$199</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#9B8B82' }}>per month</p>
                    </div>
                  </div>
                </div>
                <div
                  onClick={() => setSelectedPlan('annual')}
                  style={{ border: selectedPlan === 'annual' ? '2px solid #C4622D' : '2px solid #E8D5B7', borderRadius: '12px', padding: '1.25rem 1.5rem', cursor: 'pointer', background: selectedPlan === 'annual' ? '#FFF9F5' : 'white', transition: 'all 0.2s', position: 'relative' }}
                >
                  <div style={{ position: 'absolute', top: '-10px', right: '1rem', background: '#16a34a', color: 'white', fontSize: '0.7rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '20px', letterSpacing: '0.04em' }}>SAVE 16%</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: '0 0 0.25rem', fontWeight: '700', color: '#2C1810', fontSize: '1rem' }}>Annual</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B5C52' }}>2 months free vs monthly</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: '#2C1810', fontWeight: '700' }}>$1,999</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#9B8B82' }}>per year</p>
                    </div>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#9B8B82', textAlign: 'center', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
                🔒 Secure checkout via Stripe · 7-day free trial · No charge today
              </p>
              {subscribeError && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 1rem' }}>{subscribeError}</p>}
              <button onClick={handleSubscribe} disabled={subscribing} style={{ width: '100%', background: '#C4622D', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: subscribing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)', opacity: subscribing ? 0.7 : 1 }}>
                {subscribing ? 'Redirecting to checkout...' : 'Start free trial →'}
              </button>
              <button onClick={() => setStep(2)} style={{ width: '100%', background: 'none', border: 'none', color: '#9B8B82', padding: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.25rem' }}>
                Back
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem', fontSize: '1.3rem' }}>AI Features Disclosure</h2>
              <p style={{ color: '#6B5C52', fontSize: '0.875rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>Plate uses AI to generate meal plans for your audience and to parse recipe URLs. Here is what you need to know.</p>
              <div style={{ background: '#FDF6EE', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {[
                  "AI-generated meal plans are created from your recipe library, filtered by each end user dietary constraints",
                  "End user personal data is not sent to external AI providers for meal plan generation",
                  "The recipe URL scraper uses Anthropic AI to extract and structure recipe data from web pages",
                  "You may not use the platform to generate content that violates applicable law or third-party IP rights",
                  "Plate will not use your recipe content to train AI models without your written consent",
                ].map((point, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.875rem', color: '#4A3728', lineHeight: 1.5 }}>
                    <span style={{ color: '#C4622D', flexShrink: 0 }}>&#10003;</span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: aiError ? '0.5rem' : '1.25rem' }}>
                <input type="checkbox" id="ai-accept" checked={aiAccepted} onChange={e => { setAiAccepted(e.target.checked); setAiError(false) }} style={{ marginTop: '2px', flexShrink: 0, width: '16px', height: '16px', cursor: 'pointer', accentColor: '#C4622D' }} />
                <label htmlFor="ai-accept" style={{ fontSize: '0.82rem', color: '#4A3728', lineHeight: 1.5, cursor: 'pointer' }}>
                  I understand how Plate uses AI for meal plan generation and recipe parsing, and I agree to the AI usage terms described above.
                </label>
              </div>
              {aiError && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 1rem' }}>Please accept the AI disclosure to continue.</p>}
              <button onClick={handleAiAccept} style={{ width: '100%', background: '#C4622D', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Accept and launch my dashboard →
              </button>
              <button onClick={() => setStep(1)} style={{ width: '100%', background: 'none', border: 'none', color: '#9B8B82', padding: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.25rem' }}>
                Back
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
