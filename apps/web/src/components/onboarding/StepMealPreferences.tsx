import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  familyId: string
  tenantId: string
  onNext: () => void
  onBack: () => void
}

const CUISINES = ['Italian', 'Mexican', 'Asian', 'American', 'Mediterranean', 'Indian', 'Thai', 'Japanese', 'Greek', 'French']
const COOK_TIMES = [{ label: 'Under 30 min', value: '30' }, { label: 'Under 45 min', value: '45' }, { label: 'Under 60 min', value: '60' }, { label: 'No limit', value: '999' }]
const COMPLEXITY = [{ label: 'Simple', value: 'simple', description: 'Few ingredients, easy steps' }, { label: 'Moderate', value: 'moderate', description: 'Some prep work involved' }, { label: 'Complex', value: 'complex', description: 'Multi-step, more skilled cooking' }]

export default function StepMealPreferences({ familyId, tenantId, onNext, onBack }: Props) {
  const [likedCuisines, setLikedCuisines] = useState<string[]>([])
  const [dislikedCuisines, setDislikedCuisines] = useState<string[]>([])
  const [maxCookTime, setMaxCookTime] = useState('60')
  const [complexity, setComplexity] = useState('moderate')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('meal_preferences').select('*').eq('family_id', familyId)
      if (data) {
        setLikedCuisines(data.filter((p: any) => p.preference_type === 'cuisine_like').map((p: any) => p.value))
        setDislikedCuisines(data.filter((p: any) => p.preference_type === 'cuisine_dislike').map((p: any) => p.value))
        const time = data.find((p: any) => p.preference_type === 'cook_time_max_minutes')
        if (time) setMaxCookTime(time.value)
        const comp = data.find((p: any) => p.preference_type === 'complexity')
        if (comp) setComplexity(comp.value)
      }
    }
    fetch()
  }, [familyId])

  const toggleCuisine = (cuisine: string, type: 'like' | 'dislike') => {
    const lower = cuisine.toLowerCase()
    if (type === 'like') {
      if (likedCuisines.includes(lower)) setLikedCuisines(likedCuisines.filter(c => c !== lower))
      else { setLikedCuisines([...likedCuisines, lower]); setDislikedCuisines(dislikedCuisines.filter(c => c !== lower)) }
    } else {
      if (dislikedCuisines.includes(lower)) setDislikedCuisines(dislikedCuisines.filter(c => c !== lower))
      else { setDislikedCuisines([...dislikedCuisines, lower]); setLikedCuisines(likedCuisines.filter(c => c !== lower)) }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await supabase.from('meal_preferences').delete().eq('family_id', familyId)
      const rows = [
        ...likedCuisines.map(value => ({ tenant_id: tenantId, family_id: familyId, preference_type: 'cuisine_like', value })),
        ...dislikedCuisines.map(value => ({ tenant_id: tenantId, family_id: familyId, preference_type: 'cuisine_dislike', value })),
        { tenant_id: tenantId, family_id: familyId, preference_type: 'cook_time_max_minutes', value: maxCookTime },
        { tenant_id: tenantId, family_id: familyId, preference_type: 'complexity', value: complexity },
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
      <h2>Meal preferences</h2>
      <p style={{ color: '#666' }}>Help us understand what your family loves to eat.</p>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 'bold' }}>Cuisines (click to like, click again to dislike, click again to clear)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {CUISINES.map(cuisine => {
            const lower = cuisine.toLowerCase()
            const liked = likedCuisines.includes(lower)
            const disliked = dislikedCuisines.includes(lower)
            return (
              <button key={cuisine} onClick={() => { if (!liked && !disliked) toggleCuisine(cuisine, 'like'); else if (liked) toggleCuisine(cuisine, 'dislike'); else toggleCuisine(cuisine, 'dislike') }} style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: '2px solid', borderColor: liked ? '#16a34a' : disliked ? '#dc2626' : '#ddd', background: liked ? '#dcfce7' : disliked ? '#fee2e2' : 'white', color: liked ? '#16a34a' : disliked ? '#dc2626' : '#333', cursor: 'pointer', fontSize: '0.9rem' }}>
                {liked ? 'Like ' : disliked ? 'Dislike ' : ''}{cuisine}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 'bold' }}>Maximum cook time on weeknights</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {COOK_TIMES.map(ct => (
            <button key={ct.value} onClick={() => setMaxCookTime(ct.value)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '2px solid', borderColor: maxCookTime === ct.value ? '#4f46e5' : '#ddd', background: maxCookTime === ct.value ? '#4f46e5' : 'white', color: maxCookTime === ct.value ? 'white' : '#333', cursor: 'pointer', fontSize: '0.9rem' }}>
              {ct.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 'bold' }}>Recipe complexity</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {COMPLEXITY.map(c => (
            <button key={c.value} onClick={() => setComplexity(c.value)} style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: '2px solid', borderColor: complexity === c.value ? '#4f46e5' : '#ddd', background: complexity === c.value ? '#4f46e5' : 'white', color: complexity === c.value ? 'white' : '#333', cursor: 'pointer', fontSize: '0.9rem', textAlign: 'left' }}>
              <div style={{ fontWeight: 'bold' }}>{c.label}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{c.description}</div>
            </button>
          ))}
        </div>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={onBack} style={{ padding: '0.75rem 2rem', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '1rem' }}>Back</button>
        <button onClick={handleSave} disabled={saving} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '6px', fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Finish'}
        </button>
      </div>
    </div>
  )
}
