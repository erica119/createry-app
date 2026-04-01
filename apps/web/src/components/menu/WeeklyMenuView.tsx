import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  menuId: string
  tenantId: string
  onApproved: () => void
}

interface Recipe {
  id: string
  title: string
  description: string
  cook_time_minutes: number
  prep_time_minutes: number
  complexity: string
  cuisine_tags: string[]
  meal_type: string[]
}

interface DayMenu {
  breakfast: string | null
  lunch: string | null
  dinner: string | null
}

interface MenuData {
  days: Record<string, DayMenu>
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MEALS = ['breakfast', 'lunch', 'dinner'] as const

export default function WeeklyMenuView({ menuId, tenantId, onApproved }: Props) {
  const [menu, setMenu] = useState<any>(null)
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({})
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [swapping, setSwapping] = useState<{ day: string; meal: string } | null>(null)

  useEffect(() => {
    fetchMenu()
    fetchAllRecipes()
  }, [menuId])

  const fetchMenu = async () => {
    const { data } = await supabase
      .from('weekly_menus')
      .select('*')
      .eq('id', menuId)
      .maybeSingle()
    if (data) {
      setMenu(data)
      await fetchRecipesForMenu(data.menu_data)
    }
    setLoading(false)
  }

  const fetchRecipesForMenu = async (menuData: MenuData) => {
    const ids = new Set<string>()
    Object.values(menuData.days).forEach((day: DayMenu) => {
      if (day.breakfast) ids.add(day.breakfast)
      if (day.lunch) ids.add(day.lunch)
      if (day.dinner) ids.add(day.dinner)
    })
    if (ids.size === 0) return
    const { data } = await supabase
      .from('recipes')
      .select('id, title, description, cook_time_minutes, prep_time_minutes, complexity, cuisine_tags, meal_type')
      .in('id', Array.from(ids))
    if (data) {
      const map: Record<string, Recipe> = {}
      data.forEach(r => { map[r.id] = r })
      setRecipes(map)
    }
  }

  const fetchAllRecipes = async () => {
    const { data } = await supabase
      .from('recipes')
      .select('id, title, description, cook_time_minutes, prep_time_minutes, complexity, cuisine_tags, meal_type')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('title')
    if (data) setAllRecipes(data)
  }

  const swapMeal = async (day: string, meal: string, newRecipeId: string | null) => {
    const updatedMenuData = {
      ...menu.menu_data,
      days: {
        ...menu.menu_data.days,
        [day]: { ...menu.menu_data.days[day], [meal]: newRecipeId }
      }
    }
    const { data } = await supabase
      .from('weekly_menus')
      .update({ menu_data: updatedMenuData })
      .eq('id', menuId)
      .select()
      .maybeSingle()
    if (data) {
      setMenu(data)
      if (newRecipeId && !recipes[newRecipeId]) {
        const { data: recipe } = await supabase
          .from('recipes')
          .select('id, title, description, cook_time_minutes, prep_time_minutes, complexity, cuisine_tags, meal_type')
          .eq('id', newRecipeId)
          .maybeSingle()
        if (recipe) setRecipes(prev => ({ ...prev, [recipe.id]: recipe }))
      }
    }
    setSwapping(null)
  }

  const approveMenu = async () => {
    setApproving(true)
    await supabase.from('weekly_menus').update({ status: 'approved' }).eq('id', menuId)
    setMenu((prev: any) => ({ ...prev, status: 'approved' }))
    setApproving(false)
    onApproved()
  }

  if (loading) return <p className="loading">Loading your menu...</p>
  if (!menu) return <p className="loading">Menu not found</p>

  const menuData: MenuData = menu.menu_data
  const isApproved = menu.status === 'approved'

  return (
    <div>
      {/* Header */}
      <div className="section-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>This Week's Menu</h2>
          <p className="text-small text-muted" style={{ margin: 0 }}>
            Week of {menu.week_start_date} · Status: <strong>{menu.status.replace('_', ' ')}</strong>
          </p>
        </div>
        {isApproved ? (
          <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '1rem' }}>✓ Approved</span>
        ) : (
          <button onClick={approveMenu} disabled={approving} className="btn btn-success">
            {approving ? 'Approving...' : '✓ Approve Menu'}
          </button>
        )}
      </div>

      {/* Weekly grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '2rem' }}>
        {DAYS.map((day, i) => {
          const dayData = menuData.days[String(i)] || { breakfast: null, lunch: null, dinner: null }
          const hasAnyMeal = dayData.breakfast || dayData.lunch || dayData.dinner

          return (
            <div key={i} className="card" style={{ overflow: 'hidden', padding: 0 }}>
              {/* Day header */}
              <div style={{
                background: 'var(--color-primary)',
                color: 'white',
                padding: '0.5rem',
                textAlign: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                fontFamily: 'var(--font-body)',
              }}>
                {day.slice(0, 3).toUpperCase()}
              </div>

              {/* Meals */}
              <div style={{ padding: '0.5rem' }}>
                {!hasAnyMeal ? (
                  <p style={{ color: 'var(--color-text-light)', fontSize: '0.7rem', textAlign: 'center', margin: '0.5rem 0' }}>Rest day</p>
                ) : (
                  MEALS.map(meal => {
                    const recipeId = dayData[meal]
                    if (!recipeId) return null
                    const recipe = recipes[recipeId]

                    return (
                      <div key={meal} style={{ marginBottom: '0.35rem' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem', fontWeight: 700 }}>{meal}</div>
                        <div
                          onClick={() => !isApproved && setSwapping({ day: String(i), meal })}
                          style={{
                            background: 'var(--color-primary-light)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.3rem 0.4rem',
                            fontSize: '0.72rem',
                            cursor: isApproved ? 'default' : 'pointer',
                            lineHeight: '1.3',
                            color: 'var(--color-primary-dark)',
                            transition: 'background 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.25rem',
                          }}
                          onMouseEnter={e => { if (!isApproved) (e.currentTarget as HTMLElement).style.background = 'var(--color-border)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-light)' }}
                        >
                          <span>{recipe?.title || 'Loading...'}</span>
                          {!isApproved && <span style={{ opacity: 0.5, fontSize: '0.65rem' }}>↺</span>}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Swap modal */}
      {swapping && (
        <div
          onClick={e => e.target === e.currentTarget && setSwapping(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', maxHeight: '80vh', overflow: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0 }}>
                Swap {swapping.meal} · {DAYS[parseInt(swapping.day)]}
              </h3>
              <button onClick={() => setSwapping(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
            </div>

            <button
              onClick={() => swapMeal(swapping.day, swapping.meal, null)}
              className="btn btn-ghost"
              style={{ width: '100%', marginBottom: '1rem', color: '#c0392b', borderColor: '#c0392b', justifyContent: 'center' }}
            >
              Remove this meal
            </button>

            <p className="text-small text-muted" style={{ marginBottom: '0.75rem' }}>Choose a replacement:</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {allRecipes
                .filter(r => !r.meal_type || r.meal_type.length === 0 || r.meal_type.includes(swapping.meal))
                .map(recipe => (
                  <div
                    key={recipe.id}
                    onClick={() => swapMeal(swapping.day, swapping.meal, recipe.id)}
                    style={{
                      padding: '0.75rem 1rem',
                      border: '1.5px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      background: 'var(--color-bg-card)',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--color-primary-light)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--color-bg-card)'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>{recipe.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                      {recipe.cook_time_minutes ? `🔥 ${recipe.cook_time_minutes}min` : ''} {recipe.complexity ? `· ${recipe.complexity}` : ''}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
