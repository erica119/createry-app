import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  familyId: string
  tenantId: string
  onNext: () => void
  onBack: () => void
}

const CUISINES = [
  { id: 'italian', label: '🍝 Italian' },
  { id: 'mexican', label: '🌮 Mexican' },
  { id: 'asian', label: '🥢 Asian' },
  { id: 'american', label: '🍔 American' },
  { id: 'mediterranean', label: '🫒 Mediterranean' },
  { id: 'indian', label: '🍛 Indian' },
  { id: 'thai', label: '🍜 Thai' },
  { id: 'greek', label: '🥙 Greek' },
  { id: 'french', label: '🥐 French' },
  { id: 'japanese', label: '🍱 Japanese' },
]

const COOK_TIMES = [
  { id: '15', label: '⚡ 15 min or less' },
  { id: '30', label: '🕐 30 minutes' },
  { id: '45', label: '🕑 45 minutes' },
  { id: '60', label: '🕒 1 hour' },
  { id: '90', label: '🍲 1.5+ hours (weekends)' },
]

export default function StepMealPreferences({ familyId, tenantId, onNext, onBack }: Props) {
  const [favoriteCuisines, setFavoriteCuisines] = useState<string[]>([])
  const [dislikedCuisines, setDislikedCuisines] = useState<string[]>([])
  const [maxCookTime, setMaxCookTime] = useState('30')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'favorites' | 'dislikes'>('favorites')

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('meal_preferences')
        .select('preference_type, value')
        .eq('family_id', familyId)
      if (data) {
        setFavoriteCuisines(data.filter(d => d.preference_type === 'cuisine_like').map(d => d.value))
        setDislikedCuisines(data.filter(d => d.preference_type === 'cuisine_dislike').map(d => d.value))
        const cookTime = data.find(d => d.preference_type === 'cook_time_max_minutes')
        if (cookTime) setMaxCookTime(cookTime.value)
      }
    }
    fetch()
  }, [familyId])

  const toggleCuisine = (id: string) => {
    if (mode === 'favorites') {
      setFavoriteCuisines(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
      setDislikedCuisines(prev => prev.filter(x => x !== id))
    } else {
      setDislikedCuisines(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
      setFavoriteCuisines(prev => prev.filter(x => x !== id))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await supabase.from('meal_preferences').delete().eq('family_id', familyId)
      const rows = [
        ...favoriteCuisines.map(c => ({ tenant_id: tenantId, family_id: familyId, preference_type: 'cuisine_like', value: c })),
        ...dislikedCuisines.map(c => ({ tenant_id: tenantId, family_id: familyId, preference_type: 'cuisine_dislike', value: c })),
        { tenant_id: tenantId, family_id: familyId, preference_type: 'cook_time_max_minutes', value: maxCookTime },
      ]
      const { error } = await supabase.from('meal_preferences').insert(rows)
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
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#1F3B30', margin: '0 0 0.5rem' }}>
        What does your family love to eat?
      </h2>
      <p style={{ color: '#52645A', margin: '0 0 1.5rem', fontSize: '0.95rem' }}>
        We'll use this to personalize every menu we generate.
      </p>

      <div style={{ display: 'flex', background: '#FAF3E8', borderRadius: '10px', padding: '4px', marginBottom: '1.25rem' }}>
        {(['favorites', 'dislikes'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none',
              background: mode === m ? 'white' : 'transparent',
              color: mode === m ? '#1F3B30' : '#52645A',
              fontWeight: mode === m ? '600' : '400',
              fontSize: '0.875rem', cursor: 'pointer',
              transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)',
              boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {m === 'favorites' ? '❤️ Favorites' : '👎 Dislikes'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.75rem' }}>
        {CUISINES.map(cuisine => {
          const isFav = favoriteCuisines.includes(cuisine.id)
          const isDisliked = dislikedCuisines.includes(cuisine.id)
          const isActive = mode === 'favorites' ? isFav : isDisliked
          const isOther = mode === 'favorites' ? isDisliked : isFav
          const chipClass = isActive
            ? (mode === 'favorites' ? 'chip-active' : 'chip-dislike-active')
            : 'chip-inactive'
          return (
            <button
              key={cuisine.id}
              onClick={() => toggleCuisine(cuisine.id)}
              className={chipClass}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                border: `2px solid ${isActive ? (mode === 'favorites' ? '#C9471F' : '#dc2626') : '#DDCDBB'}`,
                fontSize: '0.875rem', cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)',
                opacity: isOther ? 0.4 : 1,
              }}
            >
              {cuisine.label}
            </button>
          )
        })}
      </div>

      <p style={{ fontWeight: '600', color: '#1F3B30', margin: '0 0 0.75rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Max weeknight cook time
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.5rem' }}>
        {COOK_TIMES.map(ct => {
          const active = maxCookTime === ct.id
          return (
            <button
              key={ct.id}
              onClick={() => setMaxCookTime(ct.id)}
              style={{
                padding: '0.75rem 1rem', borderRadius: '10px',
                border: `2px solid ${active ? '#C9471F' : '#DDCDBB'}`,
                background: active ? '#FAF3E8' : 'white',
                color: active ? '#C9471F' : '#1F3B30',
                fontSize: '0.9rem', cursor: 'pointer',
                fontWeight: active ? '600' : '400',
                transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)', textAlign: 'left',
              }}
            >
              {ct.label}
            </button>
          )
        })}
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
        <button onClick={onBack} className="btn-secondary" style={{ flex: 1 }}>← Back</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Finish setup →'}
        </button>
      </div>
    </div>
  )
}
