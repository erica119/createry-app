import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
  onComplete: (tenantId: string) => void
}

export default function CreatorOnboarding({ user, onComplete }: Props) {
  const [brandName, setBrandName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [tagline, setTagline] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#C4622D')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      // Check subdomain availability
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .eq('subdomain', subdomain)
        .maybeSingle()
      if (existing) { setError('That subdomain is already taken. Try another.'); setSaving(false); return }

      // Create tenant
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

      // Create user_profile as creator
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          tenant_id: tenant.id,
          user_id: user.id,
          role: 'creator',
          display_name: brandName.trim(),
        })
      if (profileError) throw profileError

      onComplete(tenant.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
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
          <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.95rem' }}>
            You'll get your own branded meal planning app to share with your audience.
          </p>
        </div>

        <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', border: '1px solid #E8D5B7', boxShadow: '0 4px 24px rgba(44,24,16,0.08)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            <div>
              <label style={labelStyle}>Brand name *</label>
              <p style={{ color: '#9B8B82', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>This is what your audience will see</p>
              <input
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="e.g. Healthy with Hannah"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Subdomain *</label>
              <p style={{ color: '#9B8B82', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>Your app will live at <strong>{subdomain || 'yourname'}.plate.app</strong></p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={subdomain}
                  onChange={e => handleSubdomain(e.target.value)}
                  placeholder="yourname"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <span style={{ color: '#6B5C52', fontWeight: '500', whiteSpace: 'nowrap' }}>.plate.app</span>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={e => setTagline(e.target.value)}
                placeholder="e.g. Meal plans made simple for busy families"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Brand color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  style={{ width: '48px', height: '48px', borderRadius: '10px', border: '2px solid #E8D5B7', cursor: 'pointer', padding: '2px' }}
                />
                <div>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: '600', color: '#2C1810', fontSize: '0.875rem' }}>{primaryColor}</p>
                  <p style={{ margin: 0, color: '#9B8B82', fontSize: '0.8rem' }}>Used for buttons and accents throughout your app</p>
                </div>
              </div>
              {/* Color preview */}
              <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '10px', background: primaryColor, color: 'white', fontWeight: '600', fontSize: '0.875rem', textAlign: 'center' }}>
                Preview: Button color
              </div>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                <p style={{ color: '#dc2626', margin: 0, fontSize: '0.9rem' }}>{error}</p>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: primaryColor, color: 'white', border: 'none',
                padding: '0.875rem', borderRadius: '10px', fontSize: '1rem',
                fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)', opacity: saving ? 0.7 : 1,
                marginTop: '0.5rem',
              }}
            >
              {saving ? 'Setting up your account...' : 'Launch my creator account →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
