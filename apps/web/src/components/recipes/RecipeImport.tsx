import { useState, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props {
  user: User
  tenantId: string
  onComplete: () => void
  onCancel: () => void
}

interface ParsedRecipe {
  title: string
  description: string
  ingredients: { name: string; quantity: string }[]
  instructions: string
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  servings: number | null
  cuisine_tags: string[]
  meal_type: string[]
  dietary_tags: string[]
  complexity: string
  is_premium: boolean
  source_url: string
  image_url: string
  is_active: boolean
  _errors: string[]
  _row: number
}

interface ImportedRecipe {
  id: string
  title: string
  image_url: string | null
}

const VALID_COMPLEXITY = ['simple', 'moderate', 'complex']
const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') { inQuotes = !inQuotes }
    else if (char === ',' && !inQuotes) { row.push(current.trim()); current = '' }
    else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(current.trim()); rows.push(row); row = []; current = ''
    } else { current += char }
  }
  if (current || row.length) { row.push(current.trim()); rows.push(row) }
  return rows.filter(r => r.some(c => c.length > 0))
}

function parseIngredients(raw: string): { name: string; quantity: string }[] {
  if (!raw) return []
  return raw.split('|').map(item => {
    const trimmed = item.trim()
    const match = trimmed.match(/^([\d\/\.\s]*(cup|tbsp|tsp|oz|lb|g|kg|ml|l|pinch|clove|cloves|slice|slices|can|cans|bunch|bunches|head|heads|pkg|package|packages|piece|pieces)?s?\s*)(.+)/i)
    if (match) return { quantity: match[1].trim(), name: match[3].trim() }
    return { quantity: '', name: trimmed }
  }).filter(i => i.name)
}

function parseBoolean(val: string): boolean {
  return val?.toUpperCase() === 'TRUE' || val === '1'
}

function parseIntOrNull(val: string): number | null {
  const n = parseInt(val)
  return isNaN(n) ? null : n
}

function parseTags(val: string): string[] {
  if (!val || !val.trim()) return []
  return val.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
}

function validateAndParseRows(rows: string[][]): ParsedRecipe[] {
  const header = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'))
  const dataRows = rows.slice(1)
  return dataRows.map((row, idx) => {
    const get = (col: string) => { const i = header.indexOf(col); return i >= 0 ? (row[i] || '') : '' }
    const errors: string[] = []
    const title = get('title')
    const instructions = get('instructions')
    const complexity = get('complexity').toLowerCase()
    const meal_type = parseTags(get('meal_type'))
    if (!title) errors.push('Missing title')
    if (!instructions) errors.push('Missing instructions')
    if (complexity && !VALID_COMPLEXITY.includes(complexity)) errors.push(`Invalid complexity: "${complexity}"`)
    meal_type.forEach(mt => { if (!VALID_MEAL_TYPES.includes(mt)) errors.push(`Invalid meal_type: "${mt}"`) })
    return {
      title, description: get('description'),
      ingredients: parseIngredients(get('ingredients')),
      instructions, prep_time_minutes: parseIntOrNull(get('prep_time_minutes')),
      cook_time_minutes: parseIntOrNull(get('cook_time_minutes')),
      servings: parseIntOrNull(get('servings')),
      cuisine_tags: parseTags(get('cuisine_tags')),
      meal_type, dietary_tags: parseTags(get('dietary_tags')),
      complexity: VALID_COMPLEXITY.includes(complexity) ? complexity : 'moderate',
      is_premium: parseBoolean(get('is_premium')),
      source_url: get('source_url'), image_url: get('image_url'),
      is_active: get('is_active') === '' ? true : parseBoolean(get('is_active')),
      _errors: errors, _row: idx + 2,
    }
  })
}

export default function RecipeImport({ user, tenantId, onComplete, onCancel }: Props) {
  const [stage, setStage] = useState<'upload' | 'preview' | 'importing' | 'images' | 'done'>('upload')
  const [dragging, setDragging] = useState(false)
  const [recipes, setRecipes] = useState<ParsedRecipe[]>([])
  const [fileName, setFileName] = useState('')
  const [importProgress, setImportProgress] = useState(0)
  const [importResults, setImportResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 })
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [importedRecipes, setImportedRecipes] = useState<ImportedRecipe[]>([])
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set())
  const imageInputRef = useRef<HTMLInputElement>(null)
  const activeRecipeIdRef = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) { alert('Please upload a .csv file'); return }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const rows = parseCSV(text)
      if (rows.length < 2) { alert('CSV appears empty or missing data rows'); return }
      const parsed = validateAndParseRows(rows)
      setRecipes(parsed)
      setSelectedRows(new Set(parsed.map((_, i) => i).filter(i => parsed[i]._errors.length === 0)))
      setStage('preview')
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const toggleRow = (i: number) => {
    const next = new Set(selectedRows)
    next.has(i) ? next.delete(i) : next.add(i)
    setSelectedRows(next)
  }

  const toggleAll = () => {
    const validIndices = recipes.map((_, i) => i).filter(i => recipes[i]._errors.length === 0)
    setSelectedRows(selectedRows.size === validIndices.length ? new Set() : new Set(validIndices))
  }

  const runImport = async () => {
    setStage('importing')
    const toImport = recipes.filter((_, i) => selectedRows.has(i))
    let success = 0; let failed = 0
    const inserted: ImportedRecipe[] = []
    const BATCH = 50
    for (let i = 0; i < toImport.length; i += BATCH) {
      const batch = toImport.slice(i, i + BATCH).map(r => ({
        tenant_id: tenantId, created_by: user.id, title: r.title,
        description: r.description || null, ingredients: r.ingredients,
        instructions: r.instructions, prep_time_minutes: r.prep_time_minutes,
        cook_time_minutes: r.cook_time_minutes, servings: r.servings,
        cuisine_tags: r.cuisine_tags, meal_type: r.meal_type,
        dietary_tags: r.dietary_tags, complexity: r.complexity,
        is_premium: r.is_premium, source_url: r.source_url || null,
        image_url: r.image_url || null, is_active: r.is_active,
      }))
      const { data, error } = await supabase.from('recipes').insert(batch).select('id, title, image_url')
      if (error) { console.error('Import error:', error); failed += batch.length }
      else {
        success += batch.length
        inserted.push(...(data || []).map(r => ({ id: r.id, title: r.title, image_url: r.image_url })))
      }
      setImportProgress(Math.round(((i + BATCH) / toImport.length) * 100))
    }
    setImportResults({ success, failed })
    setImportedRecipes(inserted)
    setStage('images')
  }

  const triggerImageUpload = (recipeId: string) => {
    activeRecipeIdRef.current = recipeId
    imageInputRef.current?.click()
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const recipeId = activeRecipeIdRef.current
    if (!file || !recipeId) return
    e.target.value = ''
    setUploadingId(recipeId)
    try {
      const ext = file.name.split('.').pop()
      const path = `${tenantId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('recipe-images')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('recipe-images').getPublicUrl(path)
      const publicUrl = urlData.publicUrl
      const { error: updateError } = await supabase
        .from('recipes')
        .update({ image_url: publicUrl })
        .eq('id', recipeId)
      if (updateError) throw updateError
      setImportedRecipes(prev => prev.map(r => r.id === recipeId ? { ...r, image_url: publicUrl } : r))
      setUploadedIds(prev => new Set([...prev, recipeId]))
    } catch (err) {
      console.error('Image upload error:', err)
      alert('Image upload failed. Please try again.')
    } finally {
      setUploadingId(null)
      activeRecipeIdRef.current = null
    }
  }

  const validCount = recipes.filter(r => r._errors.length === 0).length
  const errorCount = recipes.filter(r => r._errors.length > 0).length

  const s: Record<string, React.CSSProperties> = {
    page: { fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FDF6EE' },
    header: { padding: '1rem 2rem', borderBottom: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2C1810' },
    body: { maxWidth: '960px', margin: '0 auto', padding: '2rem' },
    card: { background: 'white', borderRadius: '16px', border: '1px solid #E8D5B7', padding: '2rem', boxShadow: '0 1px 4px rgba(44,24,16,0.06)' },
    primaryBtn: { background: '#C4622D', color: 'white', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)' } as React.CSSProperties,
    secondaryBtn: { background: 'white', color: '#C4622D', border: '1.5px solid #C4622D', padding: '0.65rem 1.5rem', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' } as React.CSSProperties,
    th: { textAlign: 'left' as const, padding: '0.6rem 0.75rem', borderBottom: '2px solid #E8D5B7', color: '#6B5C52', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', whiteSpace: 'nowrap' as const },
    td: { padding: '0.6rem 0.75rem', borderBottom: '1px solid #F5EFE6', verticalAlign: 'top' as const },
  }

  const badge = (color: string, bg: string): React.CSSProperties => ({ fontSize: '0.7rem', background: bg, color, padding: '0.2rem 0.5rem', borderRadius: '20px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' })

  return (
    <div style={s.page}>
      <div style={s.header}>
        <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}>🍽️ Plate</span>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
      </div>

      <div style={s.body}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', margin: '0 0 0.25rem', color: '#2C1810', fontSize: '1.5rem' }}>Bulk Recipe Import</h2>
          <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>Upload a CSV file to import multiple recipes at once.</p>
        </div>

        {stage === 'upload' && (
          <div style={s.card}>
            <div
              style={{ border: `2px dashed ${dragging ? '#C4622D' : '#E8D5B7'}`, borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center', background: dragging ? '#FEF3EC' : '#FDF6EE', transition: 'all 0.2s ease', cursor: 'pointer' }}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
              <p style={{ margin: '0 0 0.5rem', fontWeight: '600', color: '#2C1810', fontSize: '1rem' }}>Drop your CSV here or click to browse</p>
              <p style={{ margin: 0, color: '#9B8B82', fontSize: '0.85rem' }}>Accepts .csv files only</p>
              <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} style={{ display: 'none' }} />
            </div>
            <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: '#F5EFE6', borderRadius: '10px', border: '1px solid #E8D5B7' }}>
              <p style={{ margin: '0 0 0.5rem', fontWeight: '600', color: '#2C1810', fontSize: '0.85rem' }}>📋 Required columns:</p>
              <p style={{ margin: 0, color: '#6B5C52', fontSize: '0.8rem', lineHeight: 1.7 }}>
                <code style={{ background: '#E8D5B7', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>title</code>{" "}
                <code style={{ background: '#E8D5B7', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>ingredients</code>{" "}(pipe-separated){" "}
                <code style={{ background: '#E8D5B7', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>instructions</code>{" "}
                <code style={{ background: '#E8D5B7', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>complexity</code>{" "}(simple/moderate/complex)
              </p>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ ...s.card, padding: '0.75rem 1.25rem', display: 'flex', gap: '1.5rem', flex: 1, minWidth: '260px' }}>
                <div><span style={{ fontSize: '1.4rem', fontWeight: '700', color: '#16a34a' }}>{validCount}</span><span style={{ color: '#6B5C52', fontSize: '0.8rem', marginLeft: '0.3rem' }}>ready</span></div>
                {errorCount > 0 && <div><span style={{ fontSize: '1.4rem', fontWeight: '700', color: '#dc2626' }}>{errorCount}</span><span style={{ color: '#6B5C52', fontSize: '0.8rem', marginLeft: '0.3rem' }}>with errors</span></div>}
                <div><span style={{ fontSize: '1.4rem', fontWeight: '700', color: '#C4622D' }}>{selectedRows.size}</span><span style={{ color: '#6B5C52', fontSize: '0.8rem', marginLeft: '0.3rem' }}>selected</span></div>
                <div style={{ color: '#9B8B82', fontSize: '0.8rem', alignSelf: 'center' }}>📄 {fileName}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => { setStage('upload'); setRecipes([]) }} style={s.secondaryBtn}>← Re-upload</button>
                <button onClick={runImport} disabled={selectedRows.size === 0} style={{ ...s.primaryBtn, opacity: selectedRows.size === 0 ? 0.5 : 1, cursor: selectedRows.size === 0 ? 'not-allowed' : 'pointer' }}>
                  Import {selectedRows.size} Recipe{selectedRows.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>

            <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
                    <tr>
                      <th style={s.th}><input type="checkbox" checked={selectedRows.size === validCount && validCount > 0} onChange={toggleAll} style={{ cursor: 'pointer' }} /></th>
                      <th style={s.th}>Row</th>
                      <th style={s.th}>Title</th>
                      <th style={s.th}>Complexity</th>
                      <th style={s.th}>Meal Type</th>
                      <th style={s.th}>Cuisine</th>
                      <th style={s.th}>Dietary</th>
                      <th style={s.th}>Prep</th>
                      <th style={s.th}>Cook</th>
                      <th style={s.th}>Servings</th>
                      <th style={s.th}>Ingredients</th>
                      <th style={s.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map((r, i) => {
                      const hasErrors = r._errors.length > 0
                      return (
                        <tr key={i} style={{ background: hasErrors ? '#FFF5F5' : selectedRows.has(i) ? '#F0FFF4' : 'white' }}>
                          <td style={s.td}><input type="checkbox" checked={selectedRows.has(i)} disabled={hasErrors} onChange={() => toggleRow(i)} style={{ cursor: hasErrors ? 'not-allowed' : 'pointer' }} /></td>
                          <td style={{ ...s.td, color: '#9B8B82', fontSize: '0.75rem' }}>{r._row}</td>
                          <td style={{ ...s.td, fontWeight: '600', color: '#2C1810', maxWidth: '200px' }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || <span style={{ color: '#dc2626' }}>—</span>}</div></td>
                          <td style={s.td}>{r.complexity && <span style={badge(r.complexity === 'easy' ? '#16a34a' : r.complexity === 'medium' ? '#d97706' : '#dc2626', r.complexity === 'easy' ? '#dcfce7' : r.complexity === 'medium' ? '#fef3c7' : '#fee2e2')}>{r.complexity}</span>}</td>
                          <td style={s.td}><div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>{r.meal_type.map(t => <span key={t} style={badge('#C4622D', '#FEF3EC')}>{t}</span>)}</div></td>
                          <td style={s.td}><div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>{r.cuisine_tags.slice(0, 2).map(t => <span key={t} style={badge('#6B5C52', '#F5EFE6')}>{t}</span>)}</div></td>
                          <td style={s.td}><div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>{r.dietary_tags.slice(0, 2).map(t => <span key={t} style={badge('#16a34a', '#dcfce7')}>{t}</span>)}</div></td>
                          <td style={{ ...s.td, color: '#6B5C52' }}>{r.prep_time_minutes != null ? `${r.prep_time_minutes}m` : '—'}</td>
                          <td style={{ ...s.td, color: '#6B5C52' }}>{r.cook_time_minutes != null ? `${r.cook_time_minutes}m` : '—'}</td>
                          <td style={{ ...s.td, color: '#6B5C52' }}>{r.servings ?? '—'}</td>
                          <td style={{ ...s.td, color: '#6B5C52' }}>{r.ingredients.length}</td>
                          <td style={s.td}>{hasErrors ? <div style={{ color: '#dc2626', fontSize: '0.75rem' }}>{r._errors.map((e, ei) => <div key={ei}>⚠ {e}</div>)}</div> : <span style={badge('#16a34a', '#dcfce7')}>✓ Ready</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {stage === 'importing' && (
          <div style={{ ...s.card, textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
            <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem' }}>Importing recipes...</h3>
            <p style={{ color: '#6B5C52', margin: '0 0 1.5rem', fontSize: '0.9rem' }}>Please don't close this page.</p>
            <div style={{ background: '#F5EFE6', borderRadius: '999px', height: '10px', overflow: 'hidden', maxWidth: '400px', margin: '0 auto' }}>
              <div style={{ background: '#C4622D', height: '100%', width: `${importProgress}%`, borderRadius: '999px', transition: 'width 0.3s ease' }} />
            </div>
            <p style={{ color: '#9B8B82', marginTop: '0.75rem', fontSize: '0.85rem' }}>{importProgress}%</p>
          </div>
        )}

        {stage === 'images' && (
          <div>
            <div style={{ ...s.card, marginBottom: '1.5rem', padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem', fontSize: '1.2rem' }}>
                    🎉 {importResults.success} recipe{importResults.success !== 1 ? 's' : ''} imported!
                  </h3>
                  <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.875rem' }}>
                    Add photos to your recipes now, or skip and do it later from the recipe editor.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {uploadedIds.size > 0 && (
                    <span style={{ alignSelf: 'center', fontSize: '0.82rem', color: '#16a34a', fontWeight: '600' }}>
                      ✓ {uploadedIds.size} photo{uploadedIds.size !== 1 ? 's' : ''} added
                    </span>
                  )}
                  <button onClick={onComplete} style={s.secondaryBtn}>Skip → Done</button>
                </div>
              </div>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {importedRecipes.map(recipe => {
                const isUploading = uploadingId === recipe.id
                const hasImage = !!recipe.image_url
                const wasUploaded = uploadedIds.has(recipe.id)
                return (
                  <div
                    key={recipe.id}
                    style={{
                      background: 'white',
                      border: `1.5px solid ${wasUploaded ? '#86efac' : '#E8D5B7'}`,
                      borderRadius: '12px',
                      overflow: 'hidden',
                      boxShadow: '0 1px 4px rgba(44,24,16,0.06)',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div
                      style={{
                        height: '130px',
                        background: hasImage ? '#000' : '#F5EFE6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: isUploading ? 'wait' : 'pointer',
                      }}
                      onClick={() => !isUploading && triggerImageUpload(recipe.id)}
                    >
                      {hasImage ? (
                        <img
                          src={recipe.image_url!}
                          alt={recipe.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: isUploading ? 0.5 : 1 }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#C8BAB2' }}>
                          <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>📷</div>
                          <div style={{ fontSize: '0.75rem', fontWeight: '600' }}>Add Photo</div>
                        </div>
                      )}
                      {isUploading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#C4622D', fontWeight: '600' }}>
                          Uploading…
                        </div>
                      )}
                      {wasUploaded && !isUploading && (
                        <div style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', background: '#16a34a', color: 'white', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700' }}>✓</div>
                      )}
                    </div>
                    <div style={{ padding: '0.65rem 0.75rem' }}>
                      <div style={{ fontWeight: '600', fontSize: '0.82rem', color: '#2C1810', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {recipe.title}
                      </div>
                      <button
                        onClick={() => !isUploading && triggerImageUpload(recipe.id)}
                        disabled={isUploading}
                        style={{
                          marginTop: '0.4rem',
                          width: '100%',
                          padding: '0.35rem',
                          border: '1.5px solid #E8D5B7',
                          borderRadius: '6px',
                          background: '#FDF6EE',
                          color: '#6B5C52',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: isUploading ? 'wait' : 'pointer',
                        }}
                      >
                        {isUploading ? 'Uploading…' : hasImage ? 'Change Photo' : '+ Add Photo'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <button onClick={onComplete} style={s.primaryBtn}>
                Finish → View Recipes
              </button>
            </div>
          </div>
        )}

        {stage === 'done' && (
          <div style={{ ...s.card, textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{importResults.failed === 0 ? '🎉' : '⚠️'}</div>
            <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.5rem', fontSize: '1.5rem' }}>Import Complete</h3>
            <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', margin: '1.5rem 0' }}>
              <div><div style={{ fontSize: '2rem', fontWeight: '700', color: '#16a34a' }}>{importResults.success}</div><div style={{ color: '#6B5C52', fontSize: '0.85rem' }}>imported successfully</div></div>
              {importResults.failed > 0 && <div><div style={{ fontSize: '2rem', fontWeight: '700', color: '#dc2626' }}>{importResults.failed}</div><div style={{ color: '#6B5C52', fontSize: '0.85rem' }}>failed</div></div>}
            </div>
            <button onClick={onComplete} style={s.primaryBtn}>Back to Recipes</button>
          </div>
        )}
      </div>
    </div>
  )
}
