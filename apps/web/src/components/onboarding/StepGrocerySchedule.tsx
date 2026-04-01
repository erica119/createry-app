import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  familyId: string
  tenantId: string
  onNext: () => void
  onBack: () => void
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function StepGrocerySchedule({ familyId, tenantId, onNext, onBack }: Props) {
  const [selectedDays, setSelectedDays] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('grocery_schedule').select('day_of_week').eq('family_id', familyId).order('order_index')
      if (data) setSelectedDays(data.map(d => d.day_of_week))
    }
    fetch()
  }, [familyId])

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) setSelectedDays(selectedDays.filter(d => d !== day))
    else setSelectedDays([...selectedDays, day].sort())
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await supabase.from('grocery_schedule').delete().eq('family_id', familyId)
      if (selectedDays.length > 0) {
        const rows = selectedDays.map((day, index) => ({ tenant_id: tenantId, family_id: familyId, day_of_week: day, order_index: index }))
        const { error } = await supabase.from('grocery_schedule').insert(rows)
        if (error) throw error
      }
      onNext()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2>When do you grocery shop?</h2>
      <p style={{ color: '#666' }}>Select the days you typically shop.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
        {DAYS.map((day, i) => (
          <button key={i} onClick={() => toggleDay(i)} style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: '2px solid', borderColor: selectedDays.includes(i) ? '#4f46e5' : '#ddd', background: selectedDays.includes(i) ? '#4f46e5' : 'white', color: selectedDays.includes(i) ? 'white' : '#333', cursor: 'pointer', fontSize: '0.95rem', fontWeight: selectedDays.includes(i) ? 'bold' : 'normal' }}>
            {day}
          </button>
        ))}
      </div>
      {selectedDays.length > 0 && <p style={{ color: '#4f46e5', marginBottom: '1.5rem' }}>Shopping on: {selectedDays.map(d => DAYS[d]).join(', ')}</p>}
      {selectedDays.length === 0 && <p style={{ color: '#999', marginBottom: '1.5rem' }}>Select at least one shopping day.</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={onBack} style={{ padding: '0.75rem 2rem', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '1rem' }}>Back</button>
        <button onClick={handleSave} disabled={saving || selectedDays.length === 0} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '6px', fontSize: '1rem', cursor: saving || selectedDays.length === 0 ? 'not-allowed' : 'pointer', opacity: saving || selectedDays.length === 0 ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Next'}
        </button>
      </div>
    </div>
  )
}
