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
        [day]: {
          ...menu.menu_data.days[day],
          [meal]: newRecipeId,
        }
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
    await supabase
      .from('weekly_menus')
      .update({ status: 'approved' })
      .eq('id', menuId)
    setApproving(false)
    onApproved()
  }

  if (loading) return <p>Loading menu...</p>
  if (!menu) return <p>Menu not found</p>

  const menuData: MenuData = menu.menu_data

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>This Week's Menu</h2>
          <p style={{ color: '#666', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Week of {menu.week_start_date} · Status: <strong>{menu.status.replace('_', ' ')}</strong>
          </p>
        </div>
        {menu.status === 'pending_approval' && (
          <button
            onClick={approveMenu}
            disabled={approving}
            style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '6px', fontSize: '0.95rem', cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.7 : 1 }}
          >
            {approving ? 'Approving...' : '✓ Approve Menu'}
          </button>
        )}
        {menu.status === 'approved' && (
          <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓ Approved</span>
        )}
      </div>

      {/* Weekly grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '2rem' }}>
        {DAYS.map((day, i) => {
          const dayData = menuData.days[String(i)] || { breakfast: null, lunch: null, dinner: null }
          const hasAnyMeal = dayData.breakfast || dayData.lunch || dayData.dinner

          return (
            <div key={i} style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ background: '#4f46e5', color: 'white', padding: '0.5rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 'bold' }}>
                {day.slice(0, 3)}
              </div>
              <div style={{ padding: '0.5rem' }}>
                {!hasAnyMeal ? (
                  <p style={{ color: '#999', fontSize: '0.75rem', textAlign: 'center', margin: '0.5rem 0' }}>No meals</p>
                ) : (
                  MEALS.map(meal => {
                    const recipeId = dayData[meal]
                    const recipe = recipeId ? recipes[recipeId] : null
                    if (!recipeId && !dayData[meal === 'breakfast' ? 'lunch' : meal === 'lunch' ? 'dinner' : 'breakfast']) return null
                    if (recipeId === null && meal !== 'dinner') return null

                    return recipeId ? (
                      <div key={meal} style={{ marginBottom: '0.4rem' }}>
                        <div style={{ fontSize: '0.65rem', color: '#999', textTransform: 'capitalize', marginBottom: '0.1rem' }}>{meal}</div>
                        <div
                          style={{ background: '#f5f3ff', borderRadius: '4px', padding: '0.3rem 0.4rem', fontSize: '0.75rem', cursor: menu.status === 'pending_approval' ? 'pointer' : 'default', lineHeight: '1.3' }}
                          onClick={() => menu.status === 'pending_approval' && setSwapping({ day: String(i), meal })}
                          title={menu.status === 'pending_approval' ? 'Click to swap' : ''}
                        >
                          {recipe?.title || 'Loading...'}
                          {menu.status === 'pending_approval' && (
                            <span style={{ color: '#4f46e5', marginLeft: '0.25rem', fontSize: '0.65rem' }}>↺</span>
                          )}
                        </div>
                      </div>
                    ) : null
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Swap modal */}
      {swapping && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>
                Swap {swapping.meal} on {DAYS[parseInt(swapping.day)]}
              </h3>
              <button onClick={() => setSwapping(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            <button
              onClick={() => swapMeal(swapping.day, swapping.meal, null)}
              style={{ width: '100%', padding: '0.6rem', marginBottom: '0.5rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', color: '#dc2626', fontSize: '0.9rem' }}
            >
              Remove this meal
            </button>
            <p style={{ color: '#666', fontSize: '0.85rem', margin: '0.75rem 0 0.5rem' }}>Or choose a recipe:</p>
            {allRecipes
              .filter(r => r.meal_type?.includes(swapping.meal) || r.meal_type?.length === 0)
              .map(recipe => (
                <div
                  key={recipe.id}
                  onClick={() => swapMeal(swapping.day, swapping.meal, recipe.id)}
                  style={{ padding: '0.75rem', marginBottom: '0.4rem', border: '1px solid #eee', borderRadius: '6px', cursor: 'pointer', background: recipes[recipe.id] ? '#f5f3ff' : 'white' }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{recipe.title}</div>
                  <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.2rem' }}>
                    {recipe.cook_time_minutes ? `${recipe.cook_time_minutes}min` : ''} · {recipe.complexity}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}
