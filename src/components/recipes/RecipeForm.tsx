import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
  tenantId: string
  onSaved: () => void
  onCancel: () => void
}

interface Ingredient {
  name: string
  quantity: string
  unit: string
}

export default function RecipeForm({ user, tenantId, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', quantity: '', unit: '' }])
  const [instructions, setInstructions] = useState('')
  const [prepTime, setPrepTime] = useState('')
  const [cookTime, setCookTime] = useState('')
  const [servings, setServings] = useState('')
  const [cuisineTags, setCuisineTags] = useState('')
  const [mealType, setMealType] = useState<string[]>([])
  const [dietaryTags, setDietaryTags] = useState('')
  const [complexity, setComplexity] = useState('moderate')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']
  const COMPLEXITY_OPTIONS = ['simple', 'moderate', 'complex']

  const addIngredient = () => setIngredients([...ingredients, { name: '', quantity: '', unit: '' }])

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], [field]: value }
    setIngredients(updated)
  }

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const toggleMealType = (type: string) => {
    if (mealType.includes(type)) setMealType(mealType.filter(t => t !== type))
    else setMealType([...mealType, type])
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Recipe title is required'); return }
    if (!instructions.trim()) { setError('Instructions are required'); return }
    if (ingredients.filter(i => i.name.trim()).length === 0) { setError('At least one ingredient is required'); return }

    setSaving(true)
    setError(null)

    try {
      const cleanIngredients = ingredients.filter(i => i.name.trim()).map(i => ({
        name: i.name.trim(),
        quantity: i.quantity.trim(),
        unit: i.unit.trim(),
      }))

      const { error } = await supabase.from('recipes').insert({
        tenant_id: tenantId,
        created_by: user.id,
        title: title.trim(),
        description: description.trim() || null,
        ingredients: cleanIngredients,
        instructions: instructions.trim(),
        prep_time_minutes: prepTime ? parseInt(prepTime) : null,
        cook_time_minutes: cookTime ? parseInt(cookTime) : null,
        servings: servings ? parseInt(servings) : null,
        cuisine_tags: cuisineTags ? cuisineTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [],
        meal_type: mealType,
        dietary_tags: dietaryTags ? dietaryTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [],
        complexity,
        is_premium: false,
        is_active: true,
      })

      if (error) throw error
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { width: '100%', padding: '0.5rem', fontSize: '1rem', borderRadius: '4px', border: '1px solid #ddd', boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.9rem' }
  const sectionStyle = { marginBottom: '1.5rem' }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h2>Add a Recipe</h2>

      <div style={sectionStyle}>
        <label style={labelStyle}>Recipe Title *</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Grandma's Chicken Soup" style={inputStyle} />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of the recipe..." style={{ ...inputStyle, height: '80px', resize: 'vertical' }} />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Ingredients *</label>
        {ingredients.map((ing, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
            <input type="text" value={ing.quantity} onChange={e => updateIngredient(i, 'quantity', e.target.value)} placeholder="Qty" style={{ ...inputStyle, width: '80px' }} />
            <input type="text" value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)} placeholder="Unit" style={{ ...inputStyle, width: '100px' }} />
            <input type="text" value={ing.name} onChange={e => updateIngredient(i, 'name', e.target.value)} placeholder="Ingredient name" style={{ ...inputStyle, flex: 1 }} />
            {ingredients.length > 1 && (
              <button onClick={() => removeIngredient(i)} style={{ background: 'none', border: 'none', color: '#999', fontSize: '1.2rem', cursor: 'pointer', padding: '0 0.5rem' }}>x</button>
            )}
          </div>
        ))}
        <button onClick={addIngredient} style={{ background: 'none', border: '1px dashed #ddd', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', color: '#666', fontSize: '0.9rem' }}>
          + Add ingredient
        </button>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Instructions *</label>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Step-by-step instructions..." style={{ ...inputStyle, height: '150px', resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Prep Time (min)</label>
          <input type="number" value={prepTime} onChange={e => setPrepTime(e.target.value)} placeholder="15" style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Cook Time (min)</label>
          <input type="number" value={cookTime} onChange={e => setCookTime(e.target.value)} placeholder="30" style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Servings</label>
          <input type="number" value={servings} onChange={e => setServings(e.target.value)} placeholder="4" style={inputStyle} />
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Meal Type</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {MEAL_TYPES.map(type => (
            <button key={type} onClick={() => toggleMealType(type)} style={{ padding: '0.4rem 0.9rem', borderRadius: '20px', border: '2px solid', borderColor: mealType.includes(type) ? '#4f46e5' : '#ddd', background: mealType.includes(type) ? '#4f46e5' : 'white', color: mealType.includes(type) ? 'white' : '#333', cursor: 'pointer', fontSize: '0.85rem', textTransform: 'capitalize' }}>
              {type}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Complexity</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {COMPLEXITY_OPTIONS.map(c => (
            <button key={c} onClick={() => setComplexity(c)} style={{ padding: '0.4rem 0.9rem', borderRadius: '8px', border: '2px solid', borderColor: complexity === c ? '#4f46e5' : '#ddd', background: complexity === c ? '#4f46e5' : 'white', color: complexity === c ? 'white' : '#333', cursor: 'pointer', fontSize: '0.85rem', textTransform: 'capitalize' }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Cuisine Tags (comma separated)</label>
        <input type="text" value={cuisineTags} onChange={e => setCuisineTags(e.target.value)} placeholder="e.g. italian, pasta, comfort food" style={inputStyle} />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Dietary Tags (comma separated)</label>
        <input type="text" value={dietaryTags} onChange={e => setDietaryTags(e.target.value)} placeholder="e.g. gluten-free, vegetarian, dairy-free" style={inputStyle} />
      </div>

      {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button onClick={onCancel} style={{ padding: '0.75rem 2rem', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '1rem' }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} style={{ background: '#4f46e5', color: 'white', border: 'none', padding: '0.75rem 2rem', borderRadius: '6px', fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Recipe'}
        </button>
      </div>
    </div>
  )
}
