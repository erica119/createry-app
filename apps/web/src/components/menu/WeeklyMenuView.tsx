import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import WeekCalendarPicker from './WeekCalendarPicker'

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
  is_premium: boolean
  recipe_pack_id: string | null
}

interface RecipePack {
  id: string
  name: string
  price_cents: number
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

export default function WeeklyMenuView({ menuId, tenantId, userId, familyId, onApproved, onGoShopping, onWeekChange, onRegenerate }: Props) {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null)
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({})
  const [packs, setPacks] = useState<Record<string, RecipePack>>({})
  const [unlockedPackIds, setUnlockedPackIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [swapDay, setSwapDay] = useState<{ day: string; meal: string } | null>(null)
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
      .select('id, title, complexity, prep_time_minutes, cook_time_minutes, is_premium, recipe_pack_id')
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
      .select('id, title, complexity, prep_time_minutes, cook_time_minutes, is_premium, recipe_pack_id')
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
  const weekDate = new Date(menu.week_start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

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

      {/* Calendar grid */}
      <div className="menu-calendar" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', marginBottom: '2rem' }}>
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
              <div style={{ background: 'var(--color-primary)', padding: '0.5rem 0.25rem', textAlign: 'center' }}>
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
                    const locked = recipe ? isLocked(recipe) : false
                    const pack = recipe?.recipe_pack_id ? packs[recipe.recipe_pack_id] : null

                    return (
                      <div key={key} style={{ marginBottom: '0.4rem' }}>
                        <p style={{ margin: '0 0 0.2rem', fontSize: '0.6rem', fontWeight: '700', color: '#9B8B82', letterSpacing: '0.05em' }}>{label}</p>
                        {locked && pack ? (
                          <div
                            style={{ background: '#F0EAEA', borderRadius: '6px', padding: '0.3rem 0.4rem', cursor: 'pointer', border: '1px dashed #D4B0B0', opacity: 0.85 }}
                            onClick={() => handleUnlockClick(pack, recipe?.title || '')}
                          >
                            <p style={{ margin: '0 0 0.1rem', fontSize: '0.72rem', color: '#9B8B82', fontWeight: '500', lineHeight: 1.3, filter: 'blur(3px)', userSelect: 'none' }}>
                              {recipe?.title || 'Premium Recipe'}
                            </p>
                            <span style={{ fontSize: '0.6rem', color: '#C4622D', display: 'block' }}>🔒 ${(pack.price_cents / 100).toFixed(0)} to unlock</span>
                          </div>
                        ) : (
                          <div
                            style={{ background: '#F5EFE6', borderRadius: '6px', padding: '0.3rem 0.4rem', cursor: isApproved ? 'default' : 'pointer', position: 'relative' }}
                            onClick={() => !isApproved && !locked && setSwapDay({ day: String(i), meal: key })}
                          >
                            <p style={{ margin: 0, fontSize: '0.72rem', color: '#2C1810', fontWeight: '500', lineHeight: 1.3 }}>
                              {recipe?.title || 'Loading...'}
                            </p>
                            {!isApproved && (
                              <span style={{ fontSize: '0.6rem', color: 'var(--color-primary)', display: 'block', marginTop: '0.15rem' }}>tap to swap</span>
                            )}
                          </div>
                        )}
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
              {allRecipes.filter(r => !isLocked(r)).map(recipe => (
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
