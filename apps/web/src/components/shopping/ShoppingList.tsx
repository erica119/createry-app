import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  menuId: string
  familyId: string
  tenantId: string
  onShoppingComplete?: () => void
  onListReady?: () => void
  creatorPreview?: boolean
}

interface GroceryItem {
  name: string
  quantity: number
  unit: string
  aisle: string
  checked: boolean
  recipe_sources: string[]
  is_custom?: boolean
  excluded?: boolean
  quantity_override?: number
}

interface GroceryList {
  id: string
  shopping_date: string
  items: GroceryItem[]
  status: string
  instacart_cart_url: string | null
  created_at: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function ShoppingList({ menuId, familyId, tenantId, onShoppingComplete, onListReady, creatorPreview = false }: Props) {
  const [list, setList] = useState<GroceryList | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [editingItem, setEditingItem] = useState<number | null>(null)
  const [editQuantity, setEditQuantity] = useState('')
  const [savingItems, setSavingItems] = useState(false)
  const [showPantry, setShowPantry] = useState(false)
  const autoBuildAttempted = useRef<string | null>(null)

  useEffect(() => { fetchList() }, [menuId])

  const fetchList = async () => {
    setLoading(true)
    const [{ data: menu, error: menuError }, { data, error: listError }] = await Promise.all([
      supabase.from('weekly_menus').select('updated_at, menu_data, status').eq('id', menuId).single(),
      supabase.from('grocery_lists').select('*').eq('weekly_menu_id', menuId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (menuError || listError) setError('Could not load the current shopping list. Please retry.')
    const recipeIds = [...new Set(Object.values((menu?.menu_data as any)?.days || {})
      .flatMap((day: any) => [day.breakfast, day.lunch, day.dinner]).filter(Boolean))] as string[]
    const [{ data: edits, error: editsError }, { data: plannedRecipes, error: recipesError }] = await Promise.all([
      recipeIds.length
        ? supabase.from('recipe_overrides').select('updated_at').eq('family_id', familyId).in('recipe_id', recipeIds)
        : Promise.resolve({ data: [], error: null }),
      recipeIds.length
        ? supabase.from('recipes').select('updated_at').in('id', recipeIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (editsError || recipesError) setError('Could not check whether the recipes changed this list. Please retry.')
    const latestEdit = Math.max(0, ...(edits || []).map(edit => new Date(edit.updated_at).getTime()))
    const latestRecipe = Math.max(0, ...(plannedRecipes || []).map(recipe => new Date(recipe.updated_at).getTime()))
    const listIsStale = !!(data?.created_at && (new Date(menu?.updated_at || 0).getTime() > new Date(data.created_at).getTime() ||
      latestEdit > new Date(data.created_at).getTime() || latestRecipe > new Date(data.created_at).getTime()))
    setStale(listIsStale)
    setList(listIsStale ? null : data)
    setLoading(false)
    if (!data && menu?.status === 'approved' && autoBuildAttempted.current !== menuId) {
      autoBuildAttempted.current = menuId
      void generateList()
    }
  }

  const generateList = async () => {
    setGenerating(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in again to build your list.')
      const response = await fetch(`${SUPABASE_URL}/functions/v1/build-shopping-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({ menu_id: menuId, family_id: familyId, tenant_id: tenantId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to generate list')
      setList(result.grocery_list)
      setStale(false)
      onListReady?.()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const markShoppingComplete = async () => {
    if (!list) return
    const { data, error } = await supabase.from('grocery_lists').update({ status: 'complete' }).eq('id', list.id).eq('family_id', familyId).select('id').single()
    if (error || !data) {
      console.error('Failed to mark shopping complete:', error)
      setError('Could not save shopping status — please try again.')
      return
    }
    setList({ ...list, status: 'complete' })
    if (onShoppingComplete) onShoppingComplete()
  }

  const saveItems = async (updatedItems: GroceryItem[], contentsChanged = false) => {
    if (!list) return
    setSavingItems(true)
    const previous = list
    const next = { ...list, items: updatedItems, status: contentsChanged ? 'draft' : list.status, instacart_cart_url: contentsChanged ? null : list.instacart_cart_url }
    setList(next)
    const { data, error } = await supabase.from('grocery_lists')
      .update({ items: updatedItems, ...(contentsChanged ? { instacart_cart_url: null, status: 'draft' } : {}) })
      .eq('id', list.id).eq('family_id', familyId).select('id').single()
    if (error || !data) {
      setList(previous)
      setError('Could not save your shopping change. Please try again.')
    } else setError(null)
    setSavingItems(false)
  }

  const toggleItem = (index: number) => {
    if (!list || savingItems) return
    const updatedItems = list.items.map((item, i) => i === index ? { ...item, checked: !item.checked } : item)
    void saveItems(updatedItems)
  }

  const togglePantry = (index: number) => {
    if (!list || savingItems) return
    void saveItems(list.items.map((item, i) => i === index ? { ...item, excluded: !item.excluded, checked: false } : item), true)
  }

  const saveQuantity = (index: number) => {
    if (!list || savingItems) return
    const quantity = Number(editQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) { setError('Enter a quantity greater than zero.'); return }
    void saveItems(list.items.map((item, i) => i === index ? { ...item, quantity, quantity_override: quantity } : item), true)
    setEditingItem(null)
  }

  const addItem = () => {
    if (!list || savingItems || !newItemName.trim()) return
    const name = newItemName.trim()
    void saveItems([...list.items, { name, quantity: 1, unit: 'each', aisle: 'Other', checked: false, recipe_sources: ['Added by you'], is_custom: true }], true)
    setNewItemName('')
  }

  const deleteCustomItem = (index: number) => {
    if (!list || savingItems) return
    void saveItems(list.items.filter((_, i) => i !== index), true)
  }


  const groupedItems = list?.items.reduce((acc, item, index) => {
    if (item.excluded) return acc
    const aisle = item.aisle || 'Other'
    if (!acc[aisle]) acc[aisle] = []
    acc[aisle].push({ ...item, index })
    return acc
  }, {} as Record<string, (GroceryItem & { index: number })[]>)

  const checkedCount = list?.items.filter(i => !i.excluded && i.checked).length || 0
  const totalCount = list?.items.filter(i => !i.excluded).length || 0
  const pantryItems = list?.items.map((item, index) => ({ ...item, index })).filter(item => item.excluded) || []
  const isTestLink = (() => {
    if (!list?.instacart_cart_url) return false
    try { return new URL(list.instacart_cart_url).hostname === 'customers.dev.instacart.tools' }
    catch { return false }
  })()
  const showInstacartLink = !!list?.instacart_cart_url && (!isTestLink || creatorPreview)
  const reviewItems = list?.items.filter(item => !item.excluded && (
    item.quantity <= 0 || /\b(?:or|and|optional|enough|to taste|for serving)\b/i.test(item.name) ||
    /^(?:arge|rilled|emon|reen|alt)\b/i.test(item.name))
  ) || []

  if (loading) return <p style={{ color: '#52645A' }}>Loading shopping list...</p>

  if (!list) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 2rem', background: 'white', borderRadius: '16px', border: '1px solid #DDCDBB' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛒</div>
        <h3 style={{ fontFamily: 'var(--font-display)', color: '#1F3B30', margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Ready to shop?</h3>
        <p style={{ color: '#52645A', margin: '0 0 1.5rem', fontSize: '0.95rem' }}>
          {stale ? 'A meal or recipe changed. Rebuild to get the right ingredients while keeping your shopping adjustments.' : "We'll gather the ingredients from your plan."}
        </p>
        <button
          onClick={generateList}
          disabled={generating}
          style={{ background: '#C9471F', color: 'white', border: 'none', padding: '0.875rem 2rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1, fontFamily: 'var(--font-sans)' }}
        >
          {generating ? 'Building list...' : '✨ Build Shopping List'}
        </button>
        {error && <p style={{ color: '#dc2626', marginTop: '1rem', fontSize: '0.9rem' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div>
      {error && <p role="alert" style={{ color: '#B42318', background: '#FFF0ED', padding: '0.75rem 1rem', borderRadius: '8px' }}>{error}</p>}
      {/* Header */}
      <div className="shopping-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', color: '#1F3B30', margin: '0 0 0.25rem' }}>Shopping List</h2>
          <p style={{ color: '#52645A', margin: 0, fontSize: '0.9rem' }}>
            {checkedCount} of {totalCount} items checked
          </p>
        </div>
        <div className="shopping-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {showInstacartLink ? (
            // Instacart-approved CTA: Dark theme spec (exact text, colors, sizing required for IDP review)
            <a
              href={list.instacart_cart_url!}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: '#003D29', color: '#FAF1E5', border: 'none', height: '46px', padding: '0 18px', borderRadius: '29.5px', fontSize: '0.875rem', fontWeight: '600', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'sans-serif' }}
            >
              <img src="/instacart-logo.svg" alt="" style={{ width: '22px', height: '22px', display: 'block' }} />
              Shop on Instacart
            </a>
          ) : null}
          <button onClick={() => window.print()} style={{ background: "#C9471F", color: "white", border: "none", padding: "0.6rem 1rem", borderRadius: "8px", fontSize: "0.875rem", fontWeight: "600", cursor: "pointer", fontFamily: "sans-serif" }}>🖨️ Print List</button>

          <button
            onClick={generateList}
            disabled={generating}
            style={{ background: 'white', color: '#52645A', border: '1.5px solid #DDCDBB', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.875rem', cursor: generating ? 'not-allowed' : 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' }}
          >
            {generating ? 'Rebuilding...' : '↺ Rebuild'}
          </button>
        </div>
      </div>

      {isTestLink && creatorPreview && (
        <p role="status" style={{ color: '#8a4b20', background: '#fff4e6', padding: '0.75rem 1rem', borderRadius: '8px' }}>
          Instacart test link: this opens the developer environment. It cannot be used for a real grocery order.
        </p>
      )}
      {isTestLink && !creatorPreview && (
        <p role="status" style={{ color: '#8a4b20', background: '#fff4e6', padding: '0.75rem 1rem', borderRadius: '8px' }}>
          Your shopping list is ready to use here or print. Instacart ordering is coming October 2026.
        </p>
      )}
      {!showInstacartLink && !isTestLink && !creatorPreview && (
        <p role="status" style={{ color: '#52645A', fontSize: '0.84rem' }}>Instacart ordering is coming October 2026. This list is ready to use or print now.</p>
      )}
      {showInstacartLink && (
        <div role="note" style={{ background: '#f0f7f3', border: '1px solid #c9dfd1', borderRadius: '10px', padding: '1rem', marginBottom: '1rem', color: '#244438' }}>
          <strong>Review matches before adding to cart</strong>
          <p style={{ margin: '0.35rem 0 0', lineHeight: 1.5, fontSize: '0.9rem' }}>
            This list has {totalCount} ingredient lines. After choosing a store on Instacart, compare its suggested products and package amounts with this list. Search for missing items or choose alternatives there. Availability and quantities depend on the store; this link does not confirm a complete cart.
          </p>
        </div>
      )}
      {!list.instacart_cart_url && reviewItems.length === 0 && creatorPreview && (
        <p role="status" style={{ color: '#8a4b20', background: '#fff4e6', padding: '0.75rem 1rem', borderRadius: '8px' }}>
          Instacart could not create a link. You can still use or print this list; try Rebuild later.
        </p>
      )}
      {reviewItems.length > 0 && !list.instacart_cart_url && (
        <p role="alert" style={{ color: '#8a4b20', background: '#fff4e6', padding: '0.75rem 1rem', borderRadius: '8px' }}>
          {reviewItems.length} ingredient lines need a clearer quantity or choice. Review the source recipes, then rebuild this list.
        </p>
      )}

      <div style={{ background: 'white', border: '1px solid #DDCDBB', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem' }}>
        <label htmlFor="extra-shopping-item" style={{ display: 'block', fontWeight: 700, color: '#1F3B30', marginBottom: '0.5rem' }}>Add something else</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input id="extra-shopping-item" value={newItemName} onChange={e => setNewItemName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addItem() }} placeholder="Milk, paper towels…"
            style={{ flex: 1, minWidth: 0, padding: '0.7rem', border: '1px solid #DDCDBB', borderRadius: '8px', fontSize: '0.9rem' }} />
          <button onClick={addItem} disabled={savingItems || !newItemName.trim()} className="btn-primary">Add</button>
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={{ background: '#DDCDBB', borderRadius: '4px', height: '6px', marginBottom: '1.5rem', overflow: 'hidden' }}>
          <div style={{ background: '#16a34a', height: '6px', width: `${(checkedCount / totalCount) * 100}%`, transition: 'width 0.3s ease', borderRadius: '4px' }} />
        </div>
      )}

      {/* Aisle groups */}
      {groupedItems && Object.entries(groupedItems)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([aisle, items]) => (
          <div key={aisle} style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#687A70', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700' }}>
              {aisle}
            </h3>
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #DDCDBB', overflow: 'hidden' }}>
              {items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '0.875rem 1rem',
                    borderBottom: i < items.length - 1 ? '1px solid #F5E8D7' : 'none',
                    background: item.checked ? '#FAFAF8' : 'white',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <button type="button" onClick={() => toggleItem(item.index)} disabled={savingItems} role="checkbox" aria-checked={item.checked} aria-label={`${item.name} ${item.checked ? 'checked' : 'not checked'}`}
                    style={{
                    width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0, marginRight: '0.5rem', cursor: 'pointer',
                    border: `2px solid ${item.checked ? '#16a34a' : '#DDCDBB'}`,
                    background: item.checked ? '#16a34a' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '0.7rem', fontWeight: '700', transition: 'all 0.15s ease',
                  }}>
                    {item.checked && '✓'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.95rem', color: item.checked ? '#687A70' : '#1F3B30', textDecoration: item.checked ? 'line-through' : 'none', fontWeight: '500' }}>
                      {item.name}
                    </span>
                    {(item.quantity > 0 || item.unit) && (
                      <span style={{ color: '#687A70', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                        {item.quantity > 0 ? `${item.quantity} ${item.unit}` : item.unit}
                      </span>
                    )}
                    {item.recipe_sources.length > 0 && <div style={{ color: '#8A9A8F', fontSize: '0.7rem', marginTop: '0.15rem' }}>{item.recipe_sources.slice(0, 2).join(', ')}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {editingItem === item.index ? <>
                      <input type="number" min="0.01" step="any" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} aria-label={`Quantity for ${item.name}`} style={{ width: '64px', padding: '0.35rem' }} />
                      <button onClick={() => saveQuantity(item.index)} disabled={savingItems} className="btn-secondary">Save</button>
                      <button onClick={() => setEditingItem(null)} className="btn-secondary">Cancel</button>
                    </> : <>
                      <button onClick={() => { setEditingItem(item.index); setEditQuantity(String(item.quantity || 1)) }} className="btn-secondary" aria-label={`Change quantity for ${item.name}`}>Edit amount</button>
                      {item.is_custom ? <button onClick={() => deleteCustomItem(item.index)} disabled={savingItems} className="btn-secondary" aria-label={`Remove ${item.name}`}>Remove</button>
                        : <button onClick={() => togglePantry(item.index)} disabled={savingItems} className="btn-secondary" aria-label={`Mark ${item.name} as already at home`}>Have it</button>}
                    </>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      }
      {pantryItems.length > 0 && <div style={{ margin: '1rem 0' }}>
        <button onClick={() => setShowPantry(!showPantry)} className="btn-secondary" aria-expanded={showPantry}>{showPantry ? 'Hide' : 'Show'} already at home ({pantryItems.length})</button>
        {showPantry && <div style={{ marginTop: '0.5rem', background: 'white', border: '1px solid #DDCDBB', borderRadius: '12px' }}>
          {pantryItems.map(item => <div key={item.index} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #F5E8D7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: '#52645A' }}>{item.name}</span>
            <button onClick={() => togglePantry(item.index)} disabled={savingItems} className="btn-secondary">Put back on list</button>
          </div>)}
        </div>}
      </div>}
      {list.status !== 'complete' && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button
            onClick={markShoppingComplete}
            style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.875rem 2rem', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
          >
            ✓ Shopping Complete
          </button>
        </div>
      )}
      {list.status === 'complete' && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center', padding: '1rem', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #86efac' }}>
          <p style={{ margin: 0, color: '#16a34a', fontWeight: '600', fontSize: '0.95rem' }}>✓ Shopping complete! Enjoy your meals this week.</p>
        </div>
      )}
    </div>
  )
}
