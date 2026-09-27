import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  familyId: string
  tenantId: string
  onNext: () => void
  onBack: () => void
}

const ALLERGIES = [
  { id: 'peanuts', label: '🥜 Peanuts', type: 'allergy' },
  { id: 'tree_nuts', label: '🌰 Tree Nuts', type: 'allergy' },
  { id: 'dairy', label: '🥛 Dairy', type: 'intolerance' },
  { id: 'eggs', label: '🥚 Eggs', type: 'allergy' },
  { id: 'gluten', label: '🌾 Gluten', type: 'intolerance' },
  { id: 'soy', label: '🫘 Soy', type: 'allergy' },
  { id: 'shellfish', label: '🦐 Shellfish', type: 'allergy' },
  { id: 'fish', label: '🐟 Fish', type: 'allergy' },
]

const DIETS = [
  { id: 'vegetarian', label: '🥦 Vegetarian', type: 'lifestyle' },
  { id: 'vegan', label: '🌱 Vegan', type: 'lifestyle' },
  { id: 'pescatarian', label: '🐠 Pescatarian', type: 'lifestyle' },
  { id: 'keto', label: '🥑 Keto', type: 'preference' },
  { id: 'paleo', label: '🍖 Paleo', type: 'preference' },
  { id: 'halal', label: '☪️ Halal', type: 'religious' },
  { id: 'kosher', label: '✡️ Kosher', type: 'religious' },
  { id: 'gluten_free', label: '🚫 Gluten-Free', type: 'intolerance' },
]

export default function StepDietaryConstraints({ familyId, tenantId, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('dietary_constraints')
        .select('value')
        .eq('family_id', familyId)
      if (data) setSelected(data.map(d => d.value))
    }
    fetch()
  }, [familyId])

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await supabase.from('dietary_constraints').delete().eq('family_id', familyId)
      const allOptions = [...ALLERGIES, ...DIETS]
      const rows = selected.map(id => {
        const opt = allOptions.find(o => o.id === id)!
        return {
          tenant_id: tenantId,
          family_id: familyId,
          constraint_type: opt.type,
          value: id,
          severity: opt.type === 'allergy' ? 'allergy' : opt.type === 'intolerance' ? 'intolerance' : 'preference',
        }
      })
      if (rows.length > 0) {
        const { error } = await supabase.from('dietary_constraints').insert(rows)
        if (error) throw error
      }
      onNext()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const ChipGroup = ({ title, options }: { title: string; options: typeof ALLERGIES }) => (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{ fontWeight: '600', color: '#1F3B30', margin: '0 0 0.75rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {options.map(opt => {
          const active = selected.includes(opt.id)
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={active ? 'chip-active' : 'chip-inactive'}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                border: `2px solid ${active ? '#C9471F' : '#DDCDBB'}`,
                fontSize: '0.875rem',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.15s ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#1F3B30', margin: '0 0 0.5rem' }}>
        Any dietary needs?
      </h2>
      <p style={{ color: '#52645A', margin: '0 0 1.75rem', fontSize: '0.95rem' }}>
        Select all that apply. We'll make sure every meal fits your family.
      </p>
      <ChipGroup title="Allergies & intolerances" options={ALLERGIES} />
      <ChipGroup title="Dietary preferences" options={DIETS} />
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
