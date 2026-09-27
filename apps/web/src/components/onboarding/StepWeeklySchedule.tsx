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

  const toggleHome = (index: number) => {
    const updated = [...schedule]
    updated[index] = { ...updated[index], is_home: !updated[index].is_home, breakfast: false, lunch: false, dinner: false }
    setSchedule(updated)
  }

  const toggleMeal = (dayOfWeek: number, meal: 'breakfast' | 'lunch' | 'dinner') => {
    setSchedule(schedule.map(d => d.day_of_week === dayOfWeek ? { ...d, [meal]: !d[meal] } : d))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await supabase.from('weekly_schedule').delete().eq('family_id', familyId)
      const { error } = await supabase.from('weekly_schedule').insert(
        schedule.map(day => ({
          tenant_id: tenantId, family_id: familyId,
          day_of_week: day.day_of_week, is_home: day.is_home,
          breakfast: day.breakfast, lunch: day.lunch, dinner: day.dinner,
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

  const homeDays = schedule.filter(d => d.is_home).length

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#1F3B30', margin: '0 0 0.5rem' }}>
        When do you cook at home?
      </h2>
      <p style={{ color: '#52645A', margin: '0 0 0.5rem', fontSize: '0.95rem' }}>
        Tap the days you're home, then choose which meals.
      </p>
      <p style={{ color: '#C9471F', margin: '0 0 1.25rem', fontSize: '0.85rem', fontWeight: '600' }}>
        {homeDays} day{homeDays !== 1 ? 's' : ''} selected
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem', marginBottom: '1.25rem' }}>
        {schedule.map((day, i) => (
          <button
            key={i}
            onClick={() => toggleHome(i)}
            className={day.is_home ? 'day-pill-active' : 'day-pill-inactive'}
            style={{
              padding: '0.6rem 0.1rem', borderRadius: '10px',
              border: `2px solid ${day.is_home ? '#C9471F' : '#DDCDBB'}`,
              fontSize: '0.7rem', fontWeight: '600', cursor: 'pointer',
              transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)', textAlign: 'center',
            }}
          >
            {DAY_SHORT[i]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {schedule.filter(d => d.is_home).map((day) => (
          <div key={day.day_of_week} style={{
            padding: '0.875rem 1rem', borderRadius: '12px',
            background: '#FAF3E8', border: '1px solid #DDCDBB',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: '600', color: '#1F3B30', fontSize: '0.875rem', minWidth: '80px' }}>
              {DAYS[day.day_of_week]}
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {([
                { key: 'breakfast', emoji: '🌅', label: 'Breakfast' },
                { key: 'lunch', emoji: '☀️', label: 'Lunch' },
                { key: 'dinner', emoji: '🌙', label: 'Dinner' },
              ] as const).map(({ key, emoji, label }) => (
                <button
                  key={key}
                  onClick={() => toggleMeal(day.day_of_week, key)}
                  className={day[key] ? 'meal-btn-active' : 'meal-btn-inactive'}
                  style={{
                    padding: '0.3rem 0.6rem', borderRadius: '20px',
                    border: `1.5px solid ${day[key] ? '#C9471F' : '#DDCDBB'}`,
                    fontSize: '0.72rem', fontWeight: '500', cursor: 'pointer',
                    transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                  }}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: '0.9rem', marginTop: '1rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
        <button onClick={onBack} className="btn-secondary" style={{ flex: 1 }}>← Back</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}
