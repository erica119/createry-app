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

  return (
    <div>
      <h2>Tell us about your family</h2>
      <p style={{ color: '#666' }}>This helps us generate the right amount of food each week.</p>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Family name</label>
        <input type="text" value={familyName} onChange={e => setFamilyName(e.target.value)} style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #ddd' }} />
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Number of adults</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => setAdults(Math.max(1, adults - 1))} style={{ padding: '0.5rem 1rem', fontSize: '1.2rem' }}>-</button>
          <span style={{ fontSize: '1.5rem', minWidth: '2rem', textAlign: 'center' }}>{adults}</span>
          <button onClick={() => setAdults(adults + 1)} style={{ padding: '0.5rem 1rem', fontSize: '1.2rem' }}>+</button>
        </div>
      </div>
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Number of children</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => setChildren(Math.max(0, children - 1))} style={{ padding: '0.5rem 1rem', fontSize: '1.2rem' }}>-</button>
          <span style={{ fontSize: '1.5rem', minWidth: '2rem', textAlign: 'center' }}>{children}</span>
          <button onClick={() => setChildren(children + 1)} style={{ padding: '0.5rem 1rem', fontSize: '1.2rem' }}>+</button>
        </div>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={handleSave} disabled={saving} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '6px', fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Saving...' : 'Next'}
      </button>
    </div>
  )
}
