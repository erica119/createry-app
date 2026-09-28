import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { parseShoppingIngredient } from '../../lib/ingredientReadiness'
import { canonicalYouTubeUrl, getYouTubeVideoId } from '../../lib/youtube'

interface Ingredient {
  name: string
  quantity?: string
  unit?: string
}

interface Recipe {
  id: string
  title: string
  description: string | null
  ingredients: Ingredient[] | string[] | string
  instructions: string
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  servings: number | null
  complexity: string
  cuisine_tags: string[]
  meal_type: string[]
  dietary_tags: string[]
  source?: string
  video_url?: string | null
}

interface Props {
  recipe: Recipe
  onClose: () => void
  familyId?: string | null
  onSaved?: () => void
}

const CUISINES = ['italian', 'mexican', 'asian', 'american', 'mediterranean', 'indian', 'thai', 'greek', 'french', 'japanese', 'southern', 'middle_eastern']
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']
const DIETARY_TAGS = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'keto', 'paleo', 'nut-free']
const COMPLEXITIES = ['simple', 'moderate', 'complex']

function ingredientToLine(ingredient: Ingredient | string) {
  if (typeof ingredient === 'string') return ingredient
  return [ingredient.quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ').trim()
}

function ingredientsToText(ingredients: Recipe['ingredients']) {
  if (typeof ingredients === 'string') return ingredients
  if (!Array.isArray(ingredients)) return ''
  return ingredients.map(ingredientToLine).join('\n')
}

export default function RecipeModal({ recipe, onClose, familyId, onSaved }: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)

  const [title, setTitle] = useState(recipe.title || '')
  const [description, setDescription] = useState(recipe.description || '')
  const [videoUrl, setVideoUrl] = useState(recipe.video_url || '')
  const [ingredients, setIngredients] = useState(ingredientsToText(recipe.ingredients))
  const [instructions, setInstructions] = useState(recipe.instructions || '')
  const [prepTime, setPrepTime] = useState(recipe.prep_time_minutes?.toString() || '')
  const [cookTime, setCookTime] = useState(recipe.cook_time_minutes?.toString() || '')
  const [servings, setServings] = useState(recipe.servings?.toString() || '')
  const [complexity, setComplexity] = useState(recipe.complexity || 'simple')
  const [cuisineTags, setCuisineTags] = useState<string[]>(recipe.cuisine_tags || [])
  const [mealType, setMealType] = useState<string[]>(recipe.meal_type || [])
  const [dietaryTags, setDietaryTags] = useState<string[]>(recipe.dietary_tags || [])

  const displayedRecipe = useMemo(() => ({
    ...recipe,
    title,
    description,
    video_url: videoUrl,
    ingredients: ingredients.split('\n').filter(line => line.trim()).map(line => ({ name: line.trim(), quantity: '', unit: '' })),
    instructions,
    prep_time_minutes: prepTime ? parseInt(prepTime) : null,
    cook_time_minutes: cookTime ? parseInt(cookTime) : null,
    servings: servings ? parseInt(servings) : null,
    complexity,
    cuisine_tags: cuisineTags,
    meal_type: mealType,
    dietary_tags: dietaryTags,
  }), [recipe, title, description, videoUrl, ingredients, instructions, prepTime, cookTime, servings, complexity, cuisineTags, mealType, dietaryTags])

  const toggleTag = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter(item => item !== value) : [...current, value])
  }

  const handleCancelEdit = () => {
    setTitle(recipe.title || '')
    setDescription(recipe.description || '')
    setVideoUrl(recipe.video_url || '')
    setIngredients(ingredientsToText(recipe.ingredients))
    setInstructions(recipe.instructions || '')
    setPrepTime(recipe.prep_time_minutes?.toString() || '')
    setCookTime(recipe.cook_time_minutes?.toString() || '')
    setServings(recipe.servings?.toString() || '')
    setComplexity(recipe.complexity || 'simple')
    setCuisineTags(recipe.cuisine_tags || [])
    setMealType(recipe.meal_type || [])
    setDietaryTags(recipe.dietary_tags || [])
    setError(null)
    setSaved(false)
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!title.trim()) { setError('Recipe title is required.'); return }
    if (!ingredients.trim()) { setError('Ingredients are required.'); return }
    if (!instructions.trim()) { setError('Instructions are required.'); return }
    if (!COMPLEXITIES.includes(complexity)) { setError('Complexity must be simple, moderate, or complex.'); return }
    const canEditVideo = !familyId && recipe.source === 'creator'
    const normalizedVideoUrl = videoUrl.trim() ? canonicalYouTubeUrl(videoUrl) : null
    if (canEditVideo && videoUrl.trim() && !normalizedVideoUrl) { setError('Enter a valid YouTube video link.'); return }

    const parsedPrep = prepTime ? parseInt(prepTime) : null
    const parsedCook = cookTime ? parseInt(cookTime) : null
    const parsedServings = servings ? parseInt(servings) : null

    if (parsedPrep !== null && (Number.isNaN(parsedPrep) || parsedPrep < 0)) { setError('Prep time must be 0 or greater.'); return }
    if (parsedCook !== null && (Number.isNaN(parsedCook) || parsedCook < 0)) { setError('Cook time must be 0 or greater.'); return }
    if (parsedServings !== null && (Number.isNaN(parsedServings) || parsedServings <= 0)) { setError('Servings must be greater than 0.'); return }

    const parsedIngredients = ingredients.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const original = Array.isArray(recipe.ingredients)
          ? recipe.ingredients.find(item => ingredientToLine(item) === line.trim())
          : null
        return original && typeof original !== 'string' ? original : parseShoppingIngredient(line.trim())
      })

    const updates = {
      title: title.trim(),
      description: description.trim() || null,
      ingredients: parsedIngredients,
      instructions: instructions.trim(),
      prep_time_minutes: parsedPrep,
      cook_time_minutes: parsedCook,
      servings: parsedServings,
      complexity,
      cuisine_tags: cuisineTags,
      meal_type: mealType,
      dietary_tags: dietaryTags,
      ...(canEditVideo ? { video_url: normalizedVideoUrl } : {}),
    }

    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      if (familyId && recipe.source !== 'user') {
        const [{ data: original, error: originalError }, { data: prior, error: priorError }] = await Promise.all([
          supabase.from('recipes').select(Object.keys(updates).join(',')).eq('id', recipe.id).single(),
          supabase.from('recipe_overrides').select('edits').eq('family_id', familyId).eq('recipe_id', recipe.id).maybeSingle(),
        ])
        if (originalError || !original) throw originalError || new Error('Could not load the creator recipe.')
        if (priorError) throw priorError
        const edits: Record<string, unknown> = { ...(prior?.edits || {}) }
        for (const [field, value] of Object.entries(updates)) {
          if (JSON.stringify(value) === JSON.stringify((recipe as any)[field])) continue
          if (JSON.stringify(value) === JSON.stringify((original as any)[field])) delete edits[field]
          else edits[field] = value
        }
        if (Object.keys(edits).length) {
          const { data, error: updateError } = await supabase.from('recipe_overrides')
            .upsert({ family_id: familyId, recipe_id: recipe.id, edits, updated_at: new Date().toISOString() }, { onConflict: 'family_id,recipe_id' })
            .select('recipe_id').single()
          if (updateError) throw updateError
          if (data?.recipe_id !== recipe.id) throw new Error('The household recipe edit was not saved.')
        } else if (prior) {
          const { error: deleteError } = await supabase.from('recipe_overrides')
            .delete().eq('family_id', familyId).eq('recipe_id', recipe.id)
          if (deleteError) throw deleteError
        }
      } else {
        const { data, error: updateError } = await supabase.from('recipes')
          .update(updates).eq('id', recipe.id).select('id').single()
        if (updateError) throw updateError
        if (data?.id !== recipe.id) throw new Error('The recipe was not saved.')
      }

      // The dashboard keeps the selected recipe object from its recipes array.
      // Updating it in place ensures the card reflects saved changes as soon as
      // this modal closes, without requiring a full page refresh.
      Object.assign(recipe, updates)
      if (canEditVideo) setVideoUrl(normalizedVideoUrl || '')
      setVideoPlaying(false)
      setSaved(true)
      setIsEditing(false)
      onSaved?.()
    } catch (err: any) {
      setError(err?.message || 'Could not save this recipe.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '0.7rem 0.85rem', fontSize: '0.9rem',
    borderRadius: '10px', border: '2px solid #DDCDBB',
    background: '#FAF3E8', color: '#1F3B30',
    fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block', fontWeight: '600', color: '#1F3B30',
    marginBottom: '0.4rem', fontSize: '0.82rem',
  }
  const videoId = getYouTubeVideoId(displayedRecipe.video_url || '')
  const canEditVideo = !familyId && recipe.source === 'creator'

  const ChipGroup = ({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (id: string) => void }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
      {options.map(option => {
        const active = selected.includes(option)
        return (
          <button
            type="button"
            key={option}
            onClick={() => onToggle(option)}
            style={{
              padding: '0.35rem 0.75rem', borderRadius: '20px',
              border: `2px solid ${active ? '#C9471F' : '#DDCDBB'}`,
              background: active ? '#FFF3EA' : 'white', color: active ? '#C9471F' : '#52645A',
              fontSize: '0.76rem', cursor: 'pointer', fontWeight: '600',
              fontFamily: 'var(--font-sans)', textTransform: 'capitalize',
            }}
          >
            {option.replace('_', ' ')}
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      onClick={onClose}
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Edit recipe' : displayedRecipe.title}
        style={{ background: 'white', borderRadius: '20px', maxWidth: isEditing ? '720px' : '580px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(44,24,16,0.2)' }}
      >
        <div style={{ background: '#1F3B30', borderRadius: '20px 20px 0 0', padding: '1.5rem 2rem', position: 'relative' }}>
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>

          <h2 style={{ fontFamily: 'var(--font-display)', color: 'white', margin: '0 0 0.5rem', fontSize: '1.5rem', paddingRight: '2rem' }}>
            {isEditing ? 'Edit Recipe' : displayedRecipe.title}
          </h2>
          {!isEditing && displayedRecipe.description && <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontSize: '0.9rem' }}>{displayedRecipe.description}</p>}

          {!isEditing && (
            <div style={{ display: 'flex', gap: '1.25rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              {displayedRecipe.prep_time_minutes !== null && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>⏱ {displayedRecipe.prep_time_minutes}m prep</span>}
              {displayedRecipe.cook_time_minutes !== null && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>🔥 {displayedRecipe.cook_time_minutes}m cook</span>}
              {displayedRecipe.servings && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>🍽 {displayedRecipe.servings} servings</span>}
              {displayedRecipe.complexity && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', textTransform: 'capitalize' }}>📊 {displayedRecipe.complexity}</span>}
            </div>
          )}
        </div>

        <div style={{ padding: '1.5rem 2rem' }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div>
                <label style={labelStyle}>Recipe name *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Short description</label>
                <input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} />
              </div>

              {canEditVideo && <div>
                <label htmlFor="edit-recipe-video-url" style={labelStyle}>YouTube cooking video (optional)</label>
                <input id="edit-recipe-video-url" type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" style={inputStyle} />
                <p style={{ color: '#687A70', fontSize: '0.78rem', margin: '0.35rem 0 0' }}>Your audience will see this video with the recipe.</p>
              </div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Prep time (min)</label>
                  <input type="number" min="0" value={prepTime} onChange={e => setPrepTime(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Cook time (min)</label>
                  <input type="number" min="0" value={cookTime} onChange={e => setCookTime(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Servings</label>
                  <input type="number" min="1" value={servings} onChange={e => setServings(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Complexity</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {COMPLEXITIES.map(option => (
                    <button
                      type="button"
                      key={option}
                      onClick={() => setComplexity(option)}
                      style={{
                        flex: 1, padding: '0.55rem', borderRadius: '10px',
                        border: `2px solid ${complexity === option ? '#C9471F' : '#DDCDBB'}`,
                        background: complexity === option ? '#FFF3EA' : 'white', color: complexity === option ? '#C9471F' : '#52645A',
                        cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)', textTransform: 'capitalize',
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Meal type</label>
                <ChipGroup options={MEAL_TYPES} selected={mealType} onToggle={id => toggleTag(id, mealType, setMealType)} />
              </div>

              <div>
                <label style={labelStyle}>Cuisine</label>
                <ChipGroup options={CUISINES} selected={cuisineTags} onToggle={id => toggleTag(id, cuisineTags, setCuisineTags)} />
              </div>

              <div>
                <label style={labelStyle}>Dietary tags</label>
                <ChipGroup options={DIETARY_TAGS} selected={dietaryTags} onToggle={id => toggleTag(id, dietaryTags, setDietaryTags)} />
              </div>

              <div>
                <label style={labelStyle}>Ingredients *</label>
                <p style={{ color: '#687A70', fontSize: '0.78rem', margin: '0 0 0.4rem' }}>One ingredient per line</p>
                <textarea value={ingredients} onChange={e => setIngredients(e.target.value)} rows={8} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div>
                <label style={labelStyle}>Instructions *</label>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={8} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                  <p style={{ color: '#dc2626', margin: 0, fontSize: '0.88rem' }}>{error}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
                <button onClick={handleCancelEdit} disabled={saving} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 2, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {saved && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <p style={{ color: '#15803d', margin: 0, fontSize: '0.85rem', fontWeight: '600' }}>✓ Recipe updated</p>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button onClick={() => { setError(null); setSaved(false); setIsEditing(true) }} className="btn-primary" style={{ padding: '0.55rem 1rem' }}>
                  ✏️ Edit Recipe
                </button>
              </div>

              {(displayedRecipe.cuisine_tags?.length > 0 || displayedRecipe.dietary_tags?.length > 0 || displayedRecipe.meal_type?.length > 0) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.5rem' }}>
                  {displayedRecipe.meal_type?.map(tag => (
                    <span key={`meal-${tag}`} style={{ background: '#fff7ed', color: '#c2410c', padding: '0.25rem 0.7rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tag}</span>
                  ))}
                  {displayedRecipe.cuisine_tags?.map(tag => (
                    <span key={`cuisine-${tag}`} style={{ background: '#F5E8D7', color: '#C9471F', padding: '0.25rem 0.7rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tag}</span>
                  ))}
                  {displayedRecipe.dietary_tags?.map(tag => (
                    <span key={`diet-${tag}`} style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.25rem 0.7rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tag}</span>
                  ))}
                </div>
              )}

              {videoId && <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Watch the recipe</h3>
                {videoPlaying ? <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: '12px', overflow: 'hidden', background: '#1F3B30' }}>
                  <iframe title={`Cooking video for ${displayedRecipe.title}`} src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ border: 0, width: '100%', height: '100%' }} />
                </div> : <button type="button" onClick={() => setVideoPlaying(true)} aria-label={`Watch video for ${displayedRecipe.title}`}
                  style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', background: '#1F3B30', backgroundImage: `linear-gradient(0deg, rgba(31,59,48,.72), rgba(31,59,48,.08)), url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)`, backgroundPosition: 'center', backgroundSize: 'cover', color: 'white', fontFamily: 'var(--font-sans)' }}>
                  <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', width: '64px', height: '64px', borderRadius: '50%', background: '#C9471F', fontSize: '1.7rem', boxShadow: '0 5px 20px #0005' }}>▶</span>
                  <span style={{ display: 'block', marginTop: '0.75rem', fontWeight: 700 }}>Watch the cooking video</span>
                </button>}
                <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', color: '#52645A', fontSize: '0.8rem', marginTop: '0.5rem' }}>Open on YouTube ↗</a>
              </div>}

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Ingredients</h3>
                <div style={{ background: '#FAF3E8', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  {Array.isArray(displayedRecipe.ingredients) ? (
                    <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
                      {displayedRecipe.ingredients.map((ingredient, index) => (
                        <li key={index} style={{ color: '#1F3B30', fontSize: '0.9rem', marginBottom: '0.4rem', lineHeight: 1.5 }}>
                          {ingredientToLine(ingredient)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: 0, color: '#1F3B30', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{displayedRecipe.ingredients}</p>
                  )}
                </div>
              </div>

              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Instructions</h3>
                <div style={{ color: '#1F3B30', fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                  {displayedRecipe.instructions}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
