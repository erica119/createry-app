import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  familyId: string
  tenantId: string
  onNext: () => void
  onBack: () => void
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function StepGrocerySchedule({ familyId, tenantId, onNext, onBack }: Props) {
  const [shoppingDays, setShoppingDays] = useState<number[]>([0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('grocery_schedule')
        .select('day_of_week')
        .eq('family_id', familyId)
      if (data && data.length > 0) setShoppingDays(data.map((d: any) => d.day_of_week))
    }
    fetch()
  }, [familyId])

  const toggleDay = (day: number) => {
    setShoppingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    )
  }

  const handleSave = async () => {
    if (shoppingDays.length === 0) {
      setError('Please select at least one shopping day.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await supabase.from('grocery_schedule').delete().eq('family_id', familyId)
      const { error } = await supabase.from('grocery_schedule').insert(
        shoppingDays.map((day, i) => ({
          tenant_id: tenantId, family_id: familyId, day_of_week: day, order_index: i,
        }))
      )
      if (error) throw error
      onNext()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.4rem', color: '#2C1810', margin: '0 0 0.5rem' }}>
        When do you grocery shop?
      </h2>
      <p style={{ color: '#6B5C52', margin: '0 0 1.75rem', fontSize: '0.95rem' }}>
        We'll make sure your list is ready before your usual shopping day.
      </p>

      <p style={{ fontWeight: '600', color: '#2C1810', margin: '0 0 0.75rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Shopping days
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem', marginBottom: '2rem' }}>
        {DAY_SHORT.map((day, i) => {
          const active = shoppingDays.includes(i)
          return (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={active ? 'day-pill-active' : 'day-pill-inactive'}
              style={{
                padding: '0.75rem 0.1rem', borderRadius: '10px',
                border: `2px solid ${active ? '#C4622D' : '#E8D5B7'}`,
                fontSize: '0.7rem', fontWeight: '600', cursor: 'pointer',
                transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)', textAlign: 'center',
              }}
            >
              {day}
            </button>
          )
        })}
      </div>

      {shoppingDays.length > 0 && (
        <div style={{ padding: '1rem', background: '#FDF6EE', borderRadius: '12px', marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, color: '#2C1810', fontSize: '0.9rem' }}>
            🛒 Shopping on <strong>{shoppingDays.map(d => DAYS[d]).join(', ')}</strong>
          </p>
        </div>
      )}

      {error && <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
        <button onClick={onBack} className="btn-secondary" style={{ flex: 1 }}>← Back</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
