import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRef } from 'react'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
  tenantId: string
  onSaved: () => void
  onCancel: () => void
}

const CUISINES = ['italian', 'mexican', 'asian', 'american', 'mediterranean', 'indian', 'thai', 'greek', 'french', 'japanese', 'southern', 'middle_eastern']
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']
const DIETARY_TAGS = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto', 'paleo', 'nut-free']

export default function RecipeForm({ user, tenantId, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [instructions, setInstructions] = useState('')
  const [prepTime, setPrepTime] = useState('')
  const [cookTime, setCookTime] = useState('')
  const [servings, setServings] = useState('4')
  const [complexity, setComplexity] = useState('simple')
  const [cuisineTags, setCuisineTags] = useState<string[]>([])
  const [mealType, setMealType] = useState<string[]>(['dinner'])
  const [dietaryTags, setDietaryTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const toggleTag = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null
    setUploadingImage(true)
    const ext = imageFile.name.split('.').pop()
    const path = `${tenantId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('recipe-images').upload(path, imageFile)
    setUploadingImage(false)
    if (error) { console.error('Image upload error:', error); return null }
    const { data } = supabase.storage.from('recipe-images').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Recipe title is required.'); return }
    if (!ingredients.trim()) { setError('Ingredients are required.'); return }
    if (!instructions.trim()) { setError('Instructions are required.'); return }

    setSaving(true)
    setError(null)

    const imageUrl = await uploadImage()

    const parsedIngredients = ingredients.split('\n')
      .filter(line => line.trim())
      .map(line => ({ name: line.trim(), quantity: '', unit: '' }))

    try {
      const { error } = await supabase.from('recipes').insert({
        tenant_id: tenantId,
        created_by: user.id,
        title: title.trim(),
        description: description.trim() || null,
        ingredients: parsedIngredients,
        instructions: instructions.trim(),
        prep_time_minutes: prepTime ? parseInt(prepTime) : null,
        cook_time_minutes: cookTime ? parseInt(cookTime) : null,
        servings: servings ? parseInt(servings) : null,
        complexity,
        cuisine_tags: cuisineTags,
        meal_type: mealType,
        dietary_tags: dietaryTags,
        is_premium: false,
        is_active: true,
        image_url: imageUrl || null,
      })
      if (error) throw error
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', fontSize: '0.95rem',
    borderRadius: '10px', border: '2px solid #E8D5B7',
    background: '#FDF6EE', color: '#2C1810',
    fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block', fontWeight: '600', color: '#2C1810',
    marginBottom: '0.5rem', fontSize: '0.875rem',
  }

  const ChipGroup = ({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (id: string) => void }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.4rem' }}>
      {options.map(opt => {
        const active = selected.includes(opt)
        return (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={active ? 'chip-active' : 'chip-inactive'}
            style={{
              padding: '0.35rem 0.85rem', borderRadius: '20px',
              border: `2px solid ${active ? '#C4622D' : '#E8D5B7'}`,
              fontSize: '0.8rem', cursor: 'pointer', fontWeight: '500',
              transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)',
              textTransform: 'capitalize' as const,
            }}
          >
            {opt.replace('_', ' ')}
          </button>
        )
      })}
    </div>
  )

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: '#2C1810', margin: '0 0 0.25rem' }}>
          Add a Recipe
        </h2>
        <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.95rem' }}>
          Fill in the details and we'll include it in your weekly meal plans.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Title */}
        <div>
          <label style={labelStyle}>Recipe name *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Grandma's Chicken Soup" style={inputStyle} />
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>Short description</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="A quick description of the dish" style={inputStyle} />
        </div>

        {/* Time + Servings */}
        <div className="recipe-time-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Prep time (min)</label>
            <input type="number" value={prepTime} onChange={e => setPrepTime(e.target.value)} placeholder="15" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Cook time (min)</label>
            <input type="number" value={cookTime} onChange={e => setCookTime(e.target.value)} placeholder="30" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Servings</label>
            <input type="number" value={servings} onChange={e => setServings(e.target.value)} placeholder="4" style={inputStyle} />
          </div>
        </div>

        {/* Complexity */}
        <div>
          <label style={labelStyle}>Complexity</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['simple', 'moderate', 'complex'].map(c => {
              const active = complexity === c
              return (
                <button
                  key={c}
                  onClick={() => setComplexity(c)}
                  className={active ? 'chip-active' : 'chip-inactive'}
                  style={{
                    flex: 1, padding: '0.6rem', borderRadius: '10px',
                    border: `2px solid ${active ? '#C4622D' : '#E8D5B7'}`,
                    fontSize: '0.875rem', cursor: 'pointer', fontWeight: '500',
                    transition: 'all 0.15s ease', fontFamily: 'var(--font-sans)',
                    textTransform: 'capitalize' as const,
                  }}
                >
                  {c === 'simple' ? '⚡ Simple' : c === 'moderate' ? '🕐 Moderate' : '👨‍🍳 Complex'}
                </button>
              )
            })}
          </div>
        </div>

        {/* Meal type */}
        <div>
          <label style={labelStyle}>Meal type</label>
          <ChipGroup options={MEAL_TYPES} selected={mealType} onToggle={id => toggleTag(mealType, setMealType, id)} />
        </div>

        {/* Cuisine */}
        <div>
          <label style={labelStyle}>Cuisine</label>
          <ChipGroup options={CUISINES} selected={cuisineTags} onToggle={id => toggleTag(cuisineTags, setCuisineTags, id)} />
        </div>

        {/* Dietary tags */}
        <div>
          <label style={labelStyle}>Dietary tags</label>
          <ChipGroup options={DIETARY_TAGS} selected={dietaryTags} onToggle={id => toggleTag(dietaryTags, setDietaryTags, id)} />
        </div>

        {/* Image */}
        <div>
          <label style={labelStyle}>Recipe photo</label>
          <div
            onClick={() => imageInputRef.current?.click()}
            style={{
              border: '2px dashed #E8D5B7', borderRadius: '12px', padding: '1.5rem',
              textAlign: 'center', cursor: 'pointer', background: '#FDF6EE',
              transition: 'all 0.2s ease',
            }}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" style={{ maxHeight: '200px', borderRadius: '8px', objectFit: 'cover', width: '100%' }} />
            ) : (
              <>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</div>
                <p style={{ margin: 0, color: '#9B8B82', fontSize: '0.875rem' }}>Click to upload a photo</p>
              </>
            )}
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <label style={labelStyle}>Ingredients *</label>
          <p style={{ color: '#9B8B82', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>One ingredient per line</p>
          <textarea
            value={ingredients}
            onChange={e => setIngredients(e.target.value)}
            placeholder={"2 cups chicken broth\n1 lb chicken breast\n3 carrots, chopped"}
            rows={6}
            style={{ ...inputStyle, resize: 'vertical' as const }}
          />
        </div>

        {/* Instructions */}
        <div>
          <label style={labelStyle}>Instructions *</label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="Step by step instructions..."
            rows={6}
            style={{ ...inputStyle, resize: 'vertical' as const }}
          />
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.875rem 1rem' }}>
            <p style={{ color: '#dc2626', margin: 0, fontSize: '0.9rem' }}>{error}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
          <button onClick={onCancel} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : '+ Save Recipe'}
          </button>
        </div>

      </div>
    </div>
  )
}
