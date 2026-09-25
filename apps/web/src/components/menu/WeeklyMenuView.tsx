import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import WeekCalendarPicker from './WeekCalendarPicker'

type Meal = 'breakfast' | 'lunch' | 'dinner'

interface Props {
  menuId: string
  tenantId: string
  userId?: string
  familyId?: string
  onApproved: () => void
  onGoShopping?: () => void
  onWeekChange?: (menuId: string | null, weekDate: string) => void
  onRegenerate?: (feedback: string) => void
}

interface Recipe {
  id: string
  title: string
  complexity: string
  prep_time_minutes: number
  cook_time_minutes: number
  image_url: string | null
  is_premium: boolean
  recipe_pack_id: string | null
  meal_type: string[]
  is_active: boolean
}

interface RecipePack {
  id: string
  name: string
  price_cents: number
}

interface MenuData {
  days: Record<string, { breakfast: string | null; lunch: string | null; dinner: string | null }>
  schedule_override?: Record<string, Record<Meal, boolean>>
}

interface WeeklyMenu {
  id: string
  week_start_date: string
  status: string
  menu_data: MenuData
}

const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' }, { key: 'dinner', label: 'Dinner' },
]

export default function WeeklyMenuView({ menuId, tenantId, userId, familyId, onApproved, onGoShopping, onWeekChange, onRegenerate }: Props) {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null)
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({})
  const [packs, setPacks] = useState<Record<string, RecipePack>>({})
  const [unlockedPackIds, setUnlockedPackIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [swapDay, setSwapDay] = useState<{ day: string; meal: Meal } | null>(null)
  const [savingSlot, setSavingSlot] = useState(false)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([])
  const [justApproved, setJustApproved] = useState(false)
  const [unlockModal, setUnlockModal] = useState<{ pack: RecipePack; recipeTitle: string } | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)

  useEffect(() => {
    fetchMenu()
    fetchAllRecipes()
    if (userId) fetchUnlockedPacks()
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
    const { data } = await supabase
      .from('recipes')
      .select('id, title, complexity, prep_time_minutes, cook_time_minutes, image_url, is_premium, recipe_pack_id, meal_type, is_active')
      .in('id', ids)
    if (data) {
      const map: Record<string, Recipe> = {}
      data.forEach(r => { map[r.id] = r })
      setRecipes(map)
      await fetchPacksForRecipes(data)
    }
  }

  const fetchPacksForRecipes = async (recipeList: Recipe[]) => {
    const packIds = [...new Set(recipeList.map(r => r.recipe_pack_id).filter((id): id is string => !!id))]
    if (packIds.length === 0) return
    const { data } = await supabase
      .from('recipe_packs')
      .select('id, name, price_cents')
      .in('id', packIds)
    if (data) {
      const map: Record<string, RecipePack> = {}
      data.forEach(p => { map[p.id] = p })
      setPacks(map)
    }
  }

  const fetchAllRecipes = async () => {
    const { data } = await supabase
      .from('recipes')
      .select('id, title, complexity, prep_time_minutes, cook_time_minutes, image_url, is_premium, recipe_pack_id, meal_type, is_active')
      .eq('tenant_id', tenantId)
    if (data) setAllRecipes(data)
  }

  const fetchUnlockedPacks = async () => {
    if (!userId) return
    const { data } = await supabase
      .from('user_purchases')
      .select('recipe_pack_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
    if (data) {
      setUnlockedPackIds(new Set(data.map(p => p.recipe_pack_id).filter((id): id is string => !!id)))
    }
  }

  const navigateWeek = async (direction: 'prev' | 'next') => {
    if (!menu || !familyId) return
    setNavigating(true)
    const current = new Date(menu.week_start_date)
    current.setUTCDate(current.getUTCDate() + (direction === 'next' ? 7 : -7))
    const newWeekStr = current.toISOString().split('T')[0]
    const { data } = await supabase
      .from('weekly_menus')
      .select('id')
      .eq('family_id', familyId)
      .eq('week_start_date', newWeekStr)
      .maybeSingle()
    if (onWeekChange) onWeekChange(data?.id || null, newWeekStr)
    setNavigating(false)
  }

  const handleApprove = async () => {
    if (!menu) return
    if (!Object.values(menu.menu_data.days).some(day => MEALS.some(({ key }) => day[key]))) {
      setSlotError('Add at least one meal before approving this menu.')
      return
    }
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

  const saveSlot = async (day: string, meal: Meal, recipeId: string | null) => {
    if (!menu || savingSlot) return false
    setSavingSlot(true)
    setSlotError(null)
    const updatedDays: MenuData['days'] = {
      ...menu.menu_data.days,
      [day]: { ...menu.menu_data.days[day], [meal]: recipeId },
    }
    // This snapshot belongs only to this menu. The recurring weekly_schedule is untouched.
    const scheduleOverride: Record<string, Record<Meal, boolean>> = {}
    for (let i = 0; i < 7; i++) {
      const slots = updatedDays[String(i)]
      scheduleOverride[String(i)] = {
        breakfast: !!slots?.breakfast,
        lunch: !!slots?.lunch,
        dinner: !!slots?.dinner,
      }
    }
    const updatedMenuData = { ...menu.menu_data, days: updatedDays, schedule_override: scheduleOverride }
    const { error } = await supabase.from('weekly_menus')
      .update({ menu_data: updatedMenuData, status: 'pending_approval' })
      .eq('id', menu.id)
    if (error) {
      setSlotError('Could not save this week’s schedule. Please try again.')
      setSavingSlot(false)
      return false
    }
    setMenu({ ...menu, menu_data: updatedMenuData, status: 'pending_approval' })
    setJustApproved(false)
    if (recipeId) await fetchRecipesForMenu(updatedMenuData)
    setSavingSlot(false)
    return true
  }

  const handleSwap = async (recipeId: string) => {
    if (!swapDay) return
    if (await saveSlot(swapDay.day, swapDay.meal, recipeId)) setSwapDay(null)
  }

  const handleUnlockClick = (pack: RecipePack, recipeTitle: string) => {
    setUnlockModal({ pack, recipeTitle })
  }

  const handleCheckout = async () => {
    if (!unlockModal || !userId) return
    setCheckingOut(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipe_pack_id: unlockModal.pack.id,
          tenant_id: tenantId,
        }),
      })
      const { url, error } = await res.json()
      if (error) throw new Error(error)
      window.location.href = url
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Something went wrong. Please try again.')
    } finally {
      setCheckingOut(false)
    }
  }

  const isLocked = (recipe: Recipe) => {
    if (!recipe.is_premium) return false
    if (!recipe.recipe_pack_id) return false
    return !unlockedPackIds.has(recipe.recipe_pack_id)
  }

  if (loading) return <p style={{ color: '#6B5C52' }}>Loading menu...</p>
  if (!menu) return <p style={{ color: '#6B5C52' }}>Menu not found.</p>

  const isApproved = menu.status === 'approved'
  const weekDate = new Date(`${menu.week_start_date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            {familyId && (
              <button onClick={() => navigateWeek('prev')} disabled={navigating}
                style={{ background: 'none', border: '1.5px solid #E8D5B7', borderRadius: '6px', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '1rem', color: '#6B5C52' }}>←</button>
            )}
            <h2 onClick={() => familyId && setShowCalendar(true)}
              style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: '#2C1810', margin: 0, cursor: familyId ? 'pointer' : 'default', textDecoration: familyId ? 'underline dotted #C8BAB2' : 'none' }}>
              Week of {weekDate}
            </h2>
            {familyId && (
              <button onClick={() => navigateWeek('next')} disabled={navigating}
                style={{ background: 'none', border: '1.5px solid #E8D5B7', borderRadius: '6px', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '1rem', color: '#6B5C52' }}>→</button>
            )}
            {familyId && (
              <button onClick={() => setShowCalendar(true)}
                style={{ background: 'none', border: '1.5px solid #E8D5B7', borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#6B5C52' }}>📅</button>
            )}
          </div>
          <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>
            Status: <strong>{menu.status.replace('_', ' ')}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {isApproved ? (
            <>
              <span style={{ color: '#16a34a', fontWeight: '600', fontSize: '0.95rem' }}>✓ Approved</span>
              {onGoShopping && (
                <button onClick={onGoShopping}
                  style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600' }}>
                  → Build Shopping List
                </button>
              )}
              {onRegenerate && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setShowFeedback(!showFeedback)}
                      style={{ background: 'white', color: '#6B5C52', border: '1.5px solid #E8D5B7', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '500' }}>
                      💬 Feedback
                    </button>
                    <button onClick={() => { onRegenerate(feedback); setShowFeedback(false); setFeedback('') }}
                      style={{ background: 'white', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '600' }}>
                      ✨ Regenerate
                    </button>
                  </div>
                  {showFeedback && (
                    <input type="text" value={feedback} onChange={e => setFeedback(e.target.value)}
                      placeholder="e.g. more Italian, less chicken..."
                      style={{ width: '280px', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #E8D5B7', fontSize: '0.875rem', fontFamily: 'var(--font-sans)', outline: 'none' }} />
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setShowFeedback(!showFeedback)}
                  style={{ background: 'white', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '500' }}>
                  💬 Add Feedback
                </button>
                <button onClick={handleApprove} disabled={approving}
                  style={{ background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.9rem', cursor: approving ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: approving ? 0.7 : 1 }}>
                  {approving ? 'Approving...' : '✓ Approve Menu'}
                </button>
              </div>
              {showFeedback && (
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  <input type="text" value={feedback} onChange={e => setFeedback(e.target.value)}
                    placeholder="e.g. more Italian, less chicken..."
                    style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid #E8D5B7', fontSize: '0.875rem', fontFamily: 'var(--font-sans)', outline: 'none' }} />
                  {onRegenerate && (
                    <button onClick={() => { onRegenerate(feedback); setShowFeedback(false); setFeedback('') }}
                      style={{ background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}>
                      ✨ Regenerate
                    </button>
                  )}
                </div>
              )}
            </div>
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

      {!isApproved && (
        <div style={{ background: '#FDF6EE', border: '1px solid #E8D5B7', borderRadius: '12px', padding: '0.9rem 1rem', marginBottom: '1rem' }}>
          <strong style={{ color: '#2C1810' }}>Adjust this week’s meals</strong>
          <p style={{ color: '#6B5C52', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>Add a meal or remove one below before approving. Your regular weekly schedule will not change.</p>
          {slotError && <p role="alert" style={{ color: '#dc2626', margin: '0.5rem 0 0' }}>{slotError}</p>}
        </div>
      )}

      {/* Mobile-first vertical menu scroll */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        {Array.from({ length: 7 }, (_, i) => {
          const dayData = menu.menu_data.days[String(i)] || {}
          const meals = MEALS
          const hasMeals = meals.some(m => dayData[m.key])
          const dayDate = new Date(`${menu.week_start_date}T12:00:00`)
          dayDate.setDate(dayDate.getDate() + i)
          const isToday = dayDate.toDateString() === new Date().toDateString()

          return (
            <div key={i}>
              {/* Day header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{
                  fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.75rem',
                  borderRadius: '20px', letterSpacing: '0.05em',
                  background: isToday ? 'var(--color-primary)' : '#F5EFE6',
                  color: isToday ? 'white' : '#9B8B82',
                }}>
                  {FULL_DAY_NAMES[i]}{isToday ? ' · Today' : ''}
                </span>
                {!hasMeals && (
                  <span style={{ fontSize: '0.75rem', color: '#C8BAB2', fontStyle: 'italic' }}>Rest day</span>
                )}
              </div>

              {!isApproved && (
                <div aria-label={`Meals for ${FULL_DAY_NAMES[i]}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {meals.map(({ key, label }) => {
                    const planned = !!dayData[key]
                    return (
                      <button key={key} type="button" disabled={savingSlot}
                        aria-label={`${planned ? 'Remove' : 'Add'} ${label} on ${FULL_DAY_NAMES[i]}`}
                        aria-pressed={planned}
                        onClick={() => {
                          if (planned) void saveSlot(String(i), key, null)
                          else { setSlotError(null); setSwapDay({ day: String(i), meal: key }) }
                        }}
                        style={{ minHeight: '40px', borderRadius: '20px', padding: '0.4rem 0.75rem', cursor: savingSlot ? 'wait' : 'pointer', border: `1.5px solid ${planned ? 'var(--color-primary)' : '#E8D5B7'}`, background: planned ? 'var(--color-primary)' : 'white', color: planned ? 'white' : '#6B5C52', fontSize: '0.78rem', fontWeight: '600' }}>
                        {planned ? '✓' : '+'} {label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Meal cards for this day */}
              {hasMeals && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {meals.map(({ key, label }) => {
                    const recipeId = dayData[key]
                    if (!recipeId) return null
                    const recipe = recipes[recipeId]
                    const locked = recipe ? isLocked(recipe) : false
                    const pack = recipe?.recipe_pack_id ? packs[recipe.recipe_pack_id] : null

                    if (locked && pack) {
                      return (
                        <div key={key}
                          onClick={() => handleUnlockClick(pack, recipe?.title || '')}
                          style={{ background: '#F0EAEA', borderRadius: '12px', border: '1px dashed #D4B0B0', padding: '0.875rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: 0.85 }}
                        >
                          <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#E8D5B7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '1.25rem' }}>🔒</span>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: '0 0 0.15rem', fontSize: '0.7rem', fontWeight: '600', color: '#9B8B82', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                            <p style={{ margin: '0 0 0.15rem', fontSize: '0.9rem', fontWeight: '600', color: '#9B8B82', filter: 'blur(3px)', userSelect: 'none' }}>{recipe?.title || 'Premium Recipe'}</p>
                            <span style={{ fontSize: '0.75rem', color: '#C4622D' }}>🔒 ${(pack.price_cents / 100).toFixed(0)} to unlock</span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={key}
                        onClick={() => !isApproved && !locked && setSwapDay({ day: String(i), meal: key })}
                        style={{ background: 'white', borderRadius: '12px', border: isToday ? '1.5px solid var(--color-primary)' : '1px solid #E8D5B7', padding: '0.875rem 1rem', cursor: isApproved ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.875rem', boxShadow: '0 1px 4px rgba(44,24,16,0.06)' }}
                      >
                        {(recipe as any)?.image_url ? (
                          <img src={(recipe as any).image_url} alt={recipe?.title} style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        ) : (
                          <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: '#F5EFE6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '1.5rem' }}>🍽️</span>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: '0 0 0.15rem', fontSize: '0.7rem', fontWeight: '600', color: '#9B8B82', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                          <p style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: '600', color: '#2C1810', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {recipe?.title || 'Recipe Not Found'}
                          </p>
                          {recipe?.cook_time_minutes && (
                            <span style={{ fontSize: '0.75rem', color: '#9B8B82' }}>🕐 {recipe.cook_time_minutes} min</span>
                          )}
                        </div>
                        {!isApproved && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: '500', flexShrink: 0 }}>swap →</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
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
                {menu.menu_data.days[swapDay.day]?.[swapDay.meal] ? 'Swap' : 'Add'} {swapDay.meal} on {FULL_DAY_NAMES[parseInt(swapDay.day)]}
              </h3>
              <button onClick={() => setSwapDay(null)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6B5C52' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {allRecipes.filter(r => r.is_active && !isLocked(r) && r.meal_type?.includes(swapDay?.meal || '')).map(recipe => (
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
              {!allRecipes.some(r => r.is_active && !isLocked(r) && r.meal_type?.includes(swapDay?.meal || '')) && <p>No {swapDay.meal} recipes are available. Add one to your recipe library first.</p>}
              {slotError && <p role="alert" style={{ color: '#dc2626' }}>{slotError}</p>}
            </div>
          </div>
        </div>
      )}

      {showCalendar && onWeekChange && (
        <WeekCalendarPicker
          currentWeekDate={menu.week_start_date}
          onSelectWeek={async (weekDate) => {
            setNavigating(true)
            const { data } = await supabase
              .from('weekly_menus')
              .select('id')
              .eq('family_id', familyId!)
              .eq('week_start_date', weekDate)
              .maybeSingle()
            onWeekChange(data?.id || null, weekDate)
            setNavigating(false)
          }}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {/* Unlock modal */}
      {unlockModal && (
        <div
          onClick={() => setUnlockModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(44,24,16,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '20px', maxWidth: '420px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(44,24,16,0.25)' }}
          >
            <div style={{ background: 'var(--color-primary)', padding: '1.5rem 2rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
              <h2 style={{ fontFamily: 'var(--font-serif)', color: 'white', margin: '0 0 0.25rem', fontSize: '1.35rem' }}>
                {unlockModal.pack.name}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', margin: 0, fontSize: '0.875rem' }}>
                Unlock this recipe pack to access all premium recipes
              </p>
            </div>
            <div style={{ padding: '1.5rem 2rem' }}>
              <div style={{ background: '#FDF6EE', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#9B8B82', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Includes</p>
                <p style={{ margin: 0, color: '#2C1810', fontWeight: '500', fontSize: '0.95rem' }}>
                  {unlockModal.recipeTitle} + more recipes in this pack
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span style={{ color: '#6B5C52', fontSize: '0.9rem' }}>One-time purchase</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: '#2C1810', fontWeight: '700' }}>
                  ${(unlockModal.pack.price_cents / 100).toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleCheckout}
                disabled={checkingOut}
                style={{ width: '100%', background: 'var(--color-primary)', color: 'white', border: 'none', padding: '0.875rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1, fontFamily: 'var(--font-sans)' }}
              >
                {checkingOut ? 'Redirecting...' : `Unlock for $${(unlockModal.pack.price_cents / 100).toFixed(2)}`}
              </button>
              <button
                onClick={() => setUnlockModal(null)}
                style={{ width: '100%', background: 'none', border: 'none', color: '#9B8B82', padding: '0.75rem', fontSize: '0.875rem', cursor: 'pointer', marginTop: '0.5rem' }}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
