import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
  tenantId: string
  familyId: string | null
  onNext: (familyId: string) => void
}

export default function StepFamilySize({ user, tenantId, familyId, onNext }: Props) {
  const [familyName, setFamilyName] = useState('My Family')
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId) return
    const fetch = async () => {
      const { data } = await supabase
        .from('family_profiles')
        .select('family_name, adults, children')
        .eq('id', familyId)
        .single()
      if (data) {
        setFamilyName(data.family_name)
        setAdults(data.adults)
        setChildren(data.children)
      }
    }
    fetch()
  }, [familyId])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const userId = typeof user === 'string' ? user : user.id
    try {
      if (familyId) {
        const { error } = await supabase
          .from('family_profiles')
          .update({ family_name: familyName, adults, children })
          .eq('id', familyId)
        if (error) throw error
        onNext(familyId)
      } else {
        const { data, error } = await supabase
          .from('family_profiles')
          .insert({ tenant_id: tenantId, user_id: userId, family_name: familyName, adults, children })
          .select('id')
          .single()
        if (error) throw error
        onNext(data.id)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const btnBase: React.CSSProperties = {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    fontSize: '1.5rem',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', color: 'var(--color-text)', margin: '0 0 0.5rem' }}>
        Tell us about your family
      </h2>
      <p style={{ color: 'var(--color-text-muted)', margin: '0 0 1.75rem', fontSize: '0.95rem' }}>
        This helps us generate the right amount of food each week.
      </p>

      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ display: 'block', fontWeight: '500', color: 'var(--color-text)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          Family name
        </label>
        <input
          type="text"
          value={familyName}
          onChange={e => setFamilyName(e.target.value)}
          style={{
            width: '100%', padding: '0.75rem 1rem', fontSize: '1rem',
            borderRadius: '10px', border: '2px solid #E8D5B7',
            background: '#FDF6EE', color: '#2C1810',
            fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box'
          }}
        />
      </div>

      {[
        { label: '👨‍👩‍👧 Adults', value: adults, min: 1, set: setAdults },
        { label: '🧒 Children', value: children, min: 0, set: setChildren },
      ].map(({ label, value, min, set }) => (
        <div key={label} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem', background: '#FDF6EE', borderRadius: '12px', marginBottom: '0.75rem'
        }}>
          <span style={{ fontWeight: '500', color: '#2C1810', fontSize: '1rem' }}>{label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => set(Math.max(min, value - 1))}
              disabled={value <= min}
              style={{
                ...btnBase,
                border: '2px solid #E8D5B7',
                background: 'white',
                color: '#2C1810',
                opacity: value <= min ? 0.35 : 1,
                cursor: value <= min ? 'not-allowed' : 'pointer',
              }}
            >−</button>
            <span style={{
              fontSize: '1.6rem', fontWeight: '700', color: '#C4622D',
              minWidth: '2rem', textAlign: 'center', fontFamily: 'var(--font-serif)'
            }}>{value}</span>
            <button
              onClick={() => set(value + 1)}
              style={{
                ...btnBase,
                border: '2px solid #C4622D',
                background: '#C4622D',
                color: 'white',
              }}
            >+</button>
          </div>
        </div>
      ))}

      {error && <p style={{ color: '#dc2626', fontSize: '0.9rem', marginTop: '1rem' }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary"
        style={{ width: '100%', marginTop: '1.5rem', opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Saving...' : 'Continue →'}
      </button>
    </div>
  )
}
