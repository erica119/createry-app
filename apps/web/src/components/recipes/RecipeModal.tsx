interface Recipe {
  id: string
  title: string
  description: string
  ingredients: { name: string; quantity: string; unit: string }[]
  instructions: string
  prep_time_minutes: number
  cook_time_minutes: number
  servings: number
  complexity: string
  cuisine_tags: string[]
  meal_type: string[]
  dietary_tags: string[]
}

interface Props {
  recipe: Recipe
  onClose: () => void
}

export default function RecipeModal({ recipe, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: '20px', maxWidth: '580px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(44,24,16,0.2)' }}
      >
        {/* Header */}
        <div style={{ background: '#2C1810', borderRadius: '20px 20px 0 0', padding: '1.5rem 2rem', position: 'relative' }}>
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>
          <h2 style={{ fontFamily: 'var(--font-serif)', color: 'white', margin: '0 0 0.5rem', fontSize: '1.5rem', paddingRight: '2rem' }}>{recipe.title}</h2>
          {recipe.description && <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontSize: '0.9rem' }}>{recipe.description}</p>}

          {/* Meta row */}
          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {recipe.prep_time_minutes && (
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>⏱ {recipe.prep_time_minutes}m prep</span>
            )}
            {recipe.cook_time_minutes && (
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>🔥 {recipe.cook_time_minutes}m cook</span>
            )}
            {recipe.servings && (
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>🍽 {recipe.servings} servings</span>
            )}
            {recipe.complexity && (
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', textTransform: 'capitalize' }}>📊 {recipe.complexity}</span>
            )}
          </div>
        </div>

        <div style={{ padding: '1.5rem 2rem' }}>
          {/* Tags */}
          {(recipe.cuisine_tags?.length > 0 || recipe.dietary_tags?.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.5rem' }}>
              {recipe.cuisine_tags?.map(tag => (
                <span key={tag} style={{ background: '#F5EFE6', color: '#C4622D', padding: '0.25rem 0.7rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tag}</span>
              ))}
              {recipe.dietary_tags?.map(tag => (
                <span key={tag} style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.25rem 0.7rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tag}</span>
              ))}
            </div>
          )}

          {/* Ingredients */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Ingredients</h3>
            <div style={{ background: '#FDF6EE', borderRadius: '12px', padding: '1rem 1.25rem' }}>
              {Array.isArray(recipe.ingredients) ? (
                <ul style={{ margin: 0, padding: '0 0 0 1.25rem' }}>
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} style={{ color: '#2C1810', fontSize: '0.9rem', marginBottom: '0.4rem', lineHeight: 1.5 }}>
                      {ing.quantity && ing.unit
                        ? `${ing.quantity} ${ing.unit} ${ing.name}`
                        : ing.quantity
                        ? `${ing.quantity} ${ing.name}`
                        : ing.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: '#2C1810', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{recipe.ingredients}</p>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Instructions</h3>
            <div style={{ color: '#2C1810', fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {recipe.instructions}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
