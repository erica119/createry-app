import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  menuId: string
  tenantId: string
  onApproved: () => void
  onGoShopping?: () => void
}

interface Recipe {
  id: string
  title: string
  complexity: string
  prep_time_minutes: number
  cook_time_minutes: number
}

interface MenuData {
  days: Record<string, { breakfast: string | null; lunch: string | null; dinner: string | null }>
}

interface WeeklyMenu {
  id: string
  week_start_date: string
  status: string
  menu_data: MenuData
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function WeeklyMenuView({ menuId, tenantId, onApproved, onGoShopping }: Props) {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null)
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({})
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [swapDay, setSwapDay] = useState<{ day: string; meal: string } | null>(null)
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [justApproved, setJustApproved] = useState(false)

  useEffect(() => {
    fetchMenu()
    fetchAllRecipes()
  }, [menuId])

  const fetchMenu = async () => {
    setLoading(true)
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
    const ids = Object.values(menuData.days)
      .flatMap(d => [d.breakfast, d.lunch, d.dinner])
      .filter((id): id is string => !!id)
    if (ids.length === 0) return
    const { data } = await supabase.from('recipes').select('id, title, complexity, prep_time_minutes, cook_time_minutes').in('id', ids)
    if (data) {
      const map: Record<string, Recipe> = {}
      data.forEach(r => { map[r.id] = r })
      setRecipes(map)
    }
  }

  const fetchAllRecipes = async () => {
    const { data } = await supabase.from('recipes').select('id, title, complexity, prep_time_minutes, cook_time_minutes').eq('tenant_id', tenantId)
    if (data) setAllRecipes(data)
  }

  const handleApprove = async () => {
    if (!menu) return
    setApproving(true)
    const { error } = await supabase
      .from('weekly_menus')
      .update({ status: 'approved' })
      .eq('id', menu.id)
    if (!error) {
      setMenu({ ...menu, status: 'approved' })
      setJustApproved(true)
      onApproved()
    }
    setApproving(false)
  }

  const handleSwap = async (recipeId: string) => {
    if (!swapDay || !menu) return
    const updatedDays = {
      ...menu.menu_data.days,
      [swapDay.day]: {
        ...menu.menu_data.days[swapDay.day],
        [swapDay.meal]: recipeId,
      }
    }
    const updatedMenuData = { ...menu.menu_data, days: updatedDays }
    const { error } = await supabase
      .from('weekly_menus')
      .update({ menu_data: updatedMenuData, status: 'pending_approval' })
      .eq('id', menu.id)
    if (!error) {
      setMenu({ ...menu, menu_data: updatedMenuData, status: 'pending_approval' })
      await fetchRecipesForMenu(updatedMenuData)
      setJustApproved(false)
    }
    setSwapDay(null)
  }

  if (loading) return <p style={{ color: '#6B5C52' }}>Loading menu...</p>
  if (!menu) return <p style={{ color: '#6B5C52' }}>Menu not found.</p>

  const isApproved = menu.status === 'approved'
  const weekDate = new Date(menu.week_start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: '#2C1810', margin: '0 0 0.25rem' }}>
            This Week's Menu
          </h2>
          <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>
            Week of {weekDate} · Status: <strong>{menu.status.replace('_', ' ')}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {isApproved ? (
            <>
              <span style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.95rem' }}>✓ Approved</span>
              {onGoShopping && (
                <button
                  onClick={onGoShopping}
                  style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600' }}
                >
                  → Build Shopping List
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleApprove}
              disabled={approving}
              style={{ background: '#C4622D', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: approving ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: approving ? 0.7 : 1 }}
            >
              {approving ? 'Approving...' : '✓ Approve Menu'}
            </button>
          )}
        </div>
      </div>

      {/* Just approved banner */}
      {justApproved && onGoShopping && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, color: '#16a34a', fontWeight: '500' }}>🎉 Menu approved! Ready to build your shopping list?</p>
          <button
            onClick={onGoShopping}
            style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap', marginLeft: '1rem' }}
          >
            Build Shopping List →
          </button>
        </div>
      )}

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '2rem' }}>
        {Array.from({ length: 7 }, (_, i) => {
          const dayData = menu.menu_data.days[String(i)] || {}
          const meals = [
            { key: 'breakfast', label: 'BREAKFAST' },
            { key: 'lunch', label: 'LUNCH' },
            { key: 'dinner', label: 'DINNER' },
          ] as const
          const hasMeals = meals.some(m => dayData[m.key])

          return (
            <div key={i} style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #E8D5B7', background: 'white' }}>
              <div style={{ background: '#C4622D', padding: '0.5rem 0.25rem', textAlign: 'center' }}>
                <span style={{ color: 'white', fontWeight: '700', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                  {DAY_NAMES[i]}
                </span>
              </div>
              <div style={{ padding: '0.5rem 0.4rem', minHeight: '80px' }}>
                {!hasMeals ? (
                  <p style={{ color: '#C8BAB2', fontSize: '0.7rem', textAlign: 'center', margin: '0.75rem 0', fontStyle: 'italic' }}>Rest day</p>
                ) : (
                  meals.map(({ key, label }) => {
                    const recipeId = dayData[key]
                    if (!recipeId) return null
                    const recipe = recipes[recipeId]
                    return (
                      <div key={key} style={{ marginBottom: '0.4rem' }}>
                        <p style={{ margin: '0 0 0.2rem', fontSize: '0.6rem', fontWeight: '700', color: '#9B8B82', letterSpacing: '0.05em' }}>{label}</p>
                        <div
                          style={{ background: '#F5EFE6', borderRadius: '6px', padding: '0.3rem 0.4rem', cursor: isApproved ? 'default' : 'pointer', position: 'relative' }}
                          onClick={() => !isApproved && setSwapDay({ day: String(i), meal: key })}
                        >
                          <p style={{ margin: 0, fontSize: '0.72rem', color: '#2C1810', fontWeight: '500', lineHeight: 1.3 }}>
                            {recipe?.title || 'Loading...'}
                          </p>
                          {!isApproved && (
                            <span style={{ fontSize: '0.6rem', color: '#C4622D', display: 'block', marginTop: '0.15rem' }}>tap to swap</span>
                          )}
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
      {swapDay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', maxWidth: '480px', width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-serif)', color: '#2C1810' }}>
                Swap {swapDay.meal} on {FULL_DAY_NAMES[parseInt(swapDay.day)]}
              </h3>
              <button onClick={() => setSwapDay(null)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6B5C52' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {allRecipes.map(recipe => (
                <button
                  key={recipe.id}
                  onClick={() => handleSwap(recipe.id)}
                  style={{ padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E8D5B7', background: 'white', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                >
                  <p style={{ margin: '0 0 0.2rem', fontWeight: '600', color: '#2C1810', fontSize: '0.9rem' }}>{recipe.title}</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#9B8B82' }}>
                    {recipe.prep_time_minutes && `${recipe.prep_time_minutes}m prep · `}{recipe.complexity}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
