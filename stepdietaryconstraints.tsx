import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  familyId: string
  tenantId: string
  onNext: () => void
  onBack: () => void
}

interface Constraint {
  id?: string
  constraint_type: string
  value: string
  severity: string
  applies_to: string
}

const COMMON_CONSTRAINTS = [
  { label: 'Gluten-free', value: 'gluten', constraint_type: 'intolerance', severity: 'intolerance' },
  { label: 'Dairy-free', value: 'dairy', constraint_type: 'intolerance', severity: 'intolerance' },
  { label: 'Nut allergy', value: 'nuts', constraint_type: 'allergy', severity: 'allergy' },
  { label: 'Vegetarian', value: 'vegetarian', constraint_type: 'lifestyle', severity: 'preference' },
  { label: 'Vegan', value: 'vegan', constraint_type: 'lifestyle', severity: 'preference' },
  { label: 'Halal', value: 'halal', constraint_type: 'religious', severity: 'preference' },
  { label: 'Kosher', value: 'kosher', constraint_type: 'religious', severity: 'preference' },
  { label: 'Shellfish allergy', value: 'shellfish', constraint_type: 'allergy', severity: 'allergy' },
]

export default function StepDietaryConstraints({ familyId, tenantId, onNext, onBack }: Props) {
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [customValue, setCustomValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('dietary_constraints')
        .select('*')
        .eq('family_id', familyId)
      if (data) setConstraints(data)
    }
    fetch()
  }, [familyId])

  const isSelected = (value: string) =>
    constraints.some(c => c.value === value)

  const toggleCommon = async (item: typeof COMMON_CONSTRAINTS[0]) => {
    const existing = constraints.find(c => c.value === item.value)
    if (existing) {
      // Remove it
      if (existing.id) {
        await supabase.from('dietary_constraints').delete().eq('id', existing.id)
      }
      setConstraints(constraints.filter(c => c.value !== item.value))
    } else {
      // Add it
      const newConstraint = {
        tenant_id: tenantId,
        family_id: familyId,
        constraint_type: item.constraint_type,
        value: item.value,
        severity: item.severity,
        applies_to: 'everyone',
      }
      const { data } = await supabase
        .from('dietary_constraints')
        .insert(newConstraint)
        .select()
        .single()
      if (data) setConstraints([...constraints, data])
    }
  }

  const addCustom = async () => {
    if (!customValue.trim()) return
    const newConstraint = {
      tenant_id: tenantId,
      family_id: familyId,
      constraint_type: 'preference',
      value: customValue.trim().toLowerCase(),
      severity: 'preference',
      applies_to: 'everyone',
    }
    const { data } = await supabase
      .from('dietary_constraints')
      .insert(newConstraint)
      .select()
      .single()
    if (data) {
      setConstraints([...constraints, data])
      setCustomValue('')
    }
  }

  const removeConstraint = async (id: string) => {
    await supabase.from('dietary_constraints').delete().eq('id', id)
    setConstraints(constraints.filter(c => c.id !== id))
  }

  return (
    <div>
      <h2>Dietary restrictions</h2>
      <p style={{ color: '#666' }}>Select any that apply to your household. You can always update these later.</p>

      {/* Common options */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {COMMON_CONSTRAINTS.map(item => (
          <button
            key={item.value}
            onClick={() => toggleCommon(item)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '20px',
              border: '2px solid',
              borderColor: isSelected(item.value) ? '#4f46e5' : '#ddd',
              background: isSelected(item.value) ? '#4f46e5' : 'white',
              color: isSelected(item.value) ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {isSelected(item.value) ? '✓ ' : ''}{item.label}
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Add other restriction
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={customValue}
            onChange={e => setCustomValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
            placeholder="e.g. soy, eggs, sesame..."
            style={{ flex: 1, padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #ddd' }}
          />
          <button
            onClick={addCustom}
            style={{ padding: '0.5rem 1rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Custom constraints list */}
      {constraints.filter(c => !COMMON_CONSTRAINTS.some(cc => cc.value === c.value)).length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Added restrictions:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {constraints
              .filter(c => !COMMON_CONSTRAINTS.some(cc => cc.value === c.value))
              .map(c => (
                <span
                  key={c.id}
                  style={{
                    padding: '0.25rem 0.75rem',
                    background: '#f3f4f6',
                    borderRadius: '20px',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {c.value}
                  <button
                    onClick={() => c.id && removeConstraint(c.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '1rem' }}
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button
          onClick={onBack}
          style={{ padding: '0.75rem 2rem', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '1rem' }}
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={saving}
          style={{
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            padding: '0.75rem 2rem',
            borderRadius: '6px',
            fontSize: '1rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
