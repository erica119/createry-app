import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  familyId: string
  tenantId: string
  onNext: () => void
  onBack: () => void
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface DaySchedule {
  day_of_week: number
  is_home: boolean
  breakfast: boolean
  lunch: boolean
  dinner: boolean
}

const defaultSchedule = (): DaySchedule[] =>
  DAYS.map((_, i) => ({ day_of_week: i, is_home: true, breakfast: false, lunch: false, dinner: true }))

export default function StepWeeklySchedule({ familyId, tenantId, onNext, onBack }: Props) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('weekly_schedule').select('*').eq('family_id', familyId).order('day_of_week')
      if (data && data.length > 0) setSchedule(data)
    }
    fetch()
  }, [familyId])

  const updateDay = (index: number, field: keyof DaySchedule, value: boolean) => {
    const updated = [...schedule]
    updated[index] = { ...updated[index], [field]: value }
    if (field === 'is_home' && !value) { updated[index].breakfast = false; updated[index].lunch = false; updated[index].dinner = false }
    setSchedule(updated)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await supabase.from('weekly_schedule').delete().eq('family_id', familyId)
      const rows = schedule.map(day => ({
        tenant_id: tenantId,
        family_id: familyId,
        day_of_week: day.day_of_week,
        is_home: day.is_home,
        breakfast: day.breakfast,
        lunch: day.lunch,
        dinner: day.dinner,
      }))
      const { error } = await supabase.from('weekly_schedule').insert(rows)
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
      <h2>Your weekly cooking schedule</h2>
      <p style={{ color: '#666' }}>Which days do you cook at home and which meals?</p>
      <div style={{ marginBottom: '2rem' }}>
        {schedule.map((day, i) => (
          <div key={i} style={{ padding: '1rem', marginBottom: '0.5rem', borderRadius: '8px', border: '1px solid #eee', background: day.is_home ? 'white' : '#f9f9f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', minWidth: '100px' }}>{DAYS[i]}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={day.is_home} onChange={e => updateDay(i, 'is_home', e.target.checked)} />
                Eating at home
              </label>
            </div>
            {day.is_home && (
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', paddingLeft: '0.5rem' }}>
                {(['breakfast', 'lunch', 'dinner'] as const).map(meal => (
                  <label key={meal} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', textTransform: 'capitalize' }}>
                    <input type="checkbox" checked={day[meal]} onChange={e => updateDay(i, meal, e.target.checked)} />
                    {meal}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={onBack} style={{ padding: '0.75rem 2rem', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '1rem' }}>Back</button>
        <button onClick={handleSave} disabled={saving} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '6px', fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Next'}
        </button>
      </div>
    </div>
  )
}
