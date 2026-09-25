import { useCallback, useRef, useState } from 'react'
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
const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']

const HEADER_ALIASES: Record<string, string[]> = {
  title: ['title', 'recipe_name', 'recipe'],
  description: ['description', 'short_description'],
  ingredients: ['ingredients', 'ingredient_list'],
  instructions: ['instructions', 'directions', 'method'],
  prep_time_minutes: ['prep_time_minutes', 'prep_time', 'prep_time_min', 'prep'],
  cook_time_minutes: ['cook_time_minutes', 'cook_time', 'cook_time_min', 'cook'],
  servings: ['servings', 'serves'],
  cuisine_tags: ['cuisine_tags', 'cuisine'],
  meal_type: ['meal_type', 'category'],
  dietary_tags: ['dietary_tags', 'dietary'],
  complexity: ['complexity', 'difficulty'],
  is_premium: ['is_premium', 'premium'],
  source_url: ['source_url', 'url'],
  image_url: ['image_url', 'image'],
  is_active: ['is_active', 'active'],
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current.trim())
      current = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(current.trim())
      rows.push(row)
      row = []
      current = ''
    } else {
      current += char
    }
  }

  if (current || row.length) {
    row.push(current.trim())
    rows.push(row)
  }

  return rows.filter(r => r.some(cell => cell.length > 0))
}

function splitIngredientItems(raw: string): string[] {
  if (!raw?.trim()) return []

  // Accept the official pipe delimiter, semicolon-delimited exports, and
  // multi-line ingredient cells. This keeps CSV imports forgiving without
  // splitting commas that commonly belong inside a single ingredient.
  return raw
    .split(/\r?\n|\||;/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function parseIngredientLine(line: string): { name: string; quantity: string } {
  const trimmed = line.trim()

  // Supports common quantities including ranges (2-3), decimals (2.5),
  // fractions (1/2), and mixed fractions (1 1/2). Units are optional.
  const match = trimmed.match(
    /^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+|\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?)(?:\s+((?:cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|lbs?|pounds?|g|kg|ml|l|pinches?|cloves?|slices?|cans?|bunch(?:es)?|heads?|pkgs?|packages?|pieces?))\b)?\s+(.+)$/i
  )

  if (!match) return { quantity: '', name: trimmed }

  const amount = match[1].replace(/\s*[-–]\s*/g, '-')
  const unit = match[2] || ''
  const name = match[3].trim()
  return { quantity: [amount, unit].filter(Boolean).join(' '), name }
}

function parseIngredients(raw: string): { name: string; quantity: string }[] {
  return splitIngredientItems(raw).map(parseIngredientLine).filter(item => item.name)
}

function parseBoolean(value: string): boolean {
  const normalized = value?.trim().toLowerCase()
  return ['true', '1', 'yes', 'y'].includes(normalized)
}

function parseIntOrNull(value: string): number | null {
  if (!value?.trim()) return null
  const n = Number.parseInt(value.trim(), 10)
  return Number.isNaN(n) ? null : n
}

function parseTags(value: string): string[] {
  if (!value?.trim()) return []
  return value
    .split(/[,|;]/g)
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeComplexity(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'moderate'
  if (normalized === 'easy') return 'simple'
  if (normalized === 'medium') return 'moderate'
  if (normalized === 'hard') return 'complex'
  return normalized
}

function validateAndParseRows(rows: string[][]): ParsedRecipe[] {
  const headers = rows[0].map(normalizeHeader)
  const dataRows = rows.slice(1)

  const getColumnIndex = (canonical: string) => {
    const aliases = HEADER_ALIASES[canonical] || [canonical]
    for (const alias of aliases) {
      const index = headers.indexOf(alias)
      if (index >= 0) return index
    }
    return -1
  }

  const columnIndexes = Object.fromEntries(
    Object.keys(HEADER_ALIASES).map(key => [key, getColumnIndex(key)])
  ) as Record<string, number>

  return dataRows.map((row, idx) => {
    const get = (column: string) => {
      const index = columnIndexes[column] ?? -1
      return index >= 0 ? (row[index] || '').trim() : ''
    }

    const errors: string[] = []
    const title = get('title')
    const instructions = get('instructions')
    const ingredients = parseIngredients(get('ingredients'))
    const complexity = normalizeComplexity(get('complexity'))
    const mealType = parseTags(get('meal_type'))
    const prepTime = parseIntOrNull(get('prep_time_minutes'))
    const cookTime = parseIntOrNull(get('cook_time_minutes'))
    const servings = parseIntOrNull(get('servings'))

    if (!title) errors.push('Missing title')
    if (!ingredients.length) errors.push('Missing ingredients')
    if (!instructions) errors.push('Missing instructions')
    if (!VALID_COMPLEXITY.includes(complexity)) errors.push(`Invalid complexity: "${complexity}"`)
    mealType.forEach(type => {
      if (!VALID_MEAL_TYPES.includes(type)) errors.push(`Invalid meal type: "${type}"`)
    })
    if (prepTime !== null && prepTime < 0) errors.push('Prep time must be 0 or greater')
    if (cookTime !== null && cookTime < 0) errors.push('Cook time must be 0 or greater')
    if (servings !== null && servings <= 0) errors.push('Servings must be greater than 0')

    return {
      title,
      description: get('description'),
      ingredients,
      instructions,
      prep_time_minutes: prepTime,
      cook_time_minutes: cookTime,
      servings,
      cuisine_tags: parseTags(get('cuisine_tags')),
      meal_type: mealType,
      dietary_tags: parseTags(get('dietary_tags')),
      complexity: VALID_COMPLEXITY.includes(complexity) ? complexity : 'moderate',
      is_premium: parseBoolean(get('is_premium')),
      source_url: get('source_url'),
      image_url: get('image_url'),
      is_active: get('is_active') === '' ? true : parseBoolean(get('is_active')),
      _errors: errors,
      _row: idx + 2,
    }
  })
}

export default function RecipeImport({ user, tenantId, onComplete, onCancel }: Props) {
  const [stage, setStage] = useState<'upload' | 'preview' | 'importing' | 'images'>('upload')
  const [dragging, setDragging] = useState(false)
  const [recipes, setRecipes] = useState<ParsedRecipe[]>([])
  const [fileName, setFileName] = useState('')
  const [importProgress, setImportProgress] = useState(0)
  const [importResults, setImportResults] = useState({ success: 0, failed: 0 })
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [importedRecipes, setImportedRecipes] = useState<ImportedRecipe[]>([])
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set())
  const imageInputRef = useRef<HTMLInputElement>(null)
  const activeRecipeIdRef = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please upload a .csv file')
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = event => {
      const text = event.target?.result as string
      const rows = parseCSV(text)
      if (rows.length < 2) {
        alert('CSV appears empty or missing data rows')
        return
      }

      const parsed = validateAndParseRows(rows)
      setRecipes(parsed)
      setSelectedRows(new Set(parsed.map((_, i) => i).filter(i => parsed[i]._errors.length === 0)))
      setStage('preview')
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  const toggleRow = (index: number) => {
    const next = new Set(selectedRows)
    next.has(index) ? next.delete(index) : next.add(index)
    setSelectedRows(next)
  }

  const toggleAll = () => {
    const validIndexes = recipes.map((_, i) => i).filter(i => recipes[i]._errors.length === 0)
    setSelectedRows(selectedRows.size === validIndexes.length ? new Set() : new Set(validIndexes))
  }

  const runImport = async () => {
    setStage('importing')
    setImportProgress(0)
    const toImport = recipes.filter((_, i) => selectedRows.has(i))
    let success = 0
    let failed = 0
    const inserted: ImportedRecipe[] = []
    const batchSize = 50

    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize).map(recipe => ({
        tenant_id: tenantId,
        created_by: user.id,
        title: recipe.title,
        description: recipe.description || null,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        prep_time_minutes: recipe.prep_time_minutes,
        cook_time_minutes: recipe.cook_time_minutes,
        servings: recipe.servings,
        cuisine_tags: recipe.cuisine_tags,
        meal_type: recipe.meal_type,
        dietary_tags: recipe.dietary_tags,
        complexity: recipe.complexity,
        is_premium: recipe.is_premium,
        source_url: recipe.source_url || null,
        image_url: recipe.image_url || null,
        is_active: recipe.is_active,
        source: 'creator',
      }))

      const { data, error } = await supabase
        .from('recipes')
        .insert(batch)
        .select('id, title, image_url')

      if (error) {
        console.error('Import error:', error)
        failed += batch.length
      } else {
        success += batch.length
        inserted.push(...(data || []).map(recipe => ({
          id: recipe.id,
          title: recipe.title,
          image_url: recipe.image_url,
        })))
      }

      setImportProgress(Math.min(100, Math.round((Math.min(i + batchSize, toImport.length) / toImport.length) * 100)))
    }

    setImportResults({ success, failed })
    setImportedRecipes(inserted)
    setStage('images')
  }

  const triggerImageUpload = (recipeId: string) => {
    activeRecipeIdRef.current = recipeId
    imageInputRef.current?.click()
  }

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const recipeId = activeRecipeIdRef.current
    if (!file || !recipeId) return

    event.target.value = ''
    setUploadingId(recipeId)

    try {
      const extension = file.name.split('.').pop()
      const path = `${tenantId}/${Date.now()}.${extension}`
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

      setImportedRecipes(current => current.map(recipe =>
        recipe.id === recipeId ? { ...recipe, image_url: publicUrl } : recipe
      ))
      setUploadedIds(current => new Set([...current, recipeId]))
    } catch (error) {
      console.error('Image upload error:', error)
      alert('Image upload failed. Please try again.')
    } finally {
      setUploadingId(null)
      activeRecipeIdRef.current = null
    }
  }

  const downloadTemplate = () => {
    const headers = 'Title,Complexity,Meal Type,Cuisine,Dietary,Prep,Cook,Servings,Ingredients,Instructions'
    const example = 'Lemon Herb Chicken,simple,dinner,american,"gluten-free, dairy-free",15,60,4,"2 lbs chicken; 2 lemons; 3 tbsp olive oil; salt and pepper","Preheat oven to 425F. Season chicken. Roast until cooked through."'
    const blob = new Blob([`${headers}\n${example}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'createry_recipe_template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const validCount = recipes.filter(recipe => recipe._errors.length === 0).length
  const errorCount = recipes.filter(recipe => recipe._errors.length > 0).length

  const styles: Record<string, React.CSSProperties> = {
    page: { fontFamily: 'var(--font-sans)', minHeight: '100vh', background: '#FDF6EE' },
    header: { padding: '1rem 2rem', borderBottom: '1px solid #E8D5B7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2C1810' },
    body: { maxWidth: '960px', margin: '0 auto', padding: '2rem' },
    card: { background: 'white', borderRadius: '16px', border: '1px solid #E8D5B7', padding: '2rem', boxShadow: '0 1px 4px rgba(44,24,16,0.06)' },
    primaryBtn: { background: '#C4622D', color: 'white', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: '600', fontFamily: 'var(--font-sans)' },
    secondaryBtn: { background: 'white', color: '#C4622D', border: '1.5px solid #C4622D', padding: '0.65rem 1.5rem', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: '500', fontFamily: 'var(--font-sans)' },
    th: { textAlign: 'left', padding: '0.6rem 0.75rem', borderBottom: '2px solid #E8D5B7', color: '#6B5C52', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
    td: { padding: '0.6rem 0.75rem', borderBottom: '1px solid #F5EFE6', verticalAlign: 'top' },
  }

  const badge = (color: string, background: string): React.CSSProperties => ({
    fontSize: '0.7rem', background, color, padding: '0.2rem 0.5rem',
    borderRadius: '20px', fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: '0.05em', whiteSpace: 'nowrap',
  })

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={{ fontFamily: 'var(--font-serif)', color: 'white', fontWeight: '600', fontSize: '1.1rem' }}>🍽️ Createry</span>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
      </div>

      <div style={styles.body}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', margin: '0 0 0.25rem', color: '#2C1810', fontSize: '1.5rem' }}>Bulk Recipe Import</h2>
          <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.9rem' }}>Upload a CSV file to import multiple recipes at once.</p>
        </div>

        {stage === 'upload' && (
          <div style={styles.card}>
            <div
              style={{ border: `2px dashed ${dragging ? '#C4622D' : '#E8D5B7'}`, borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center', background: dragging ? '#FEF3EC' : '#FDF6EE', cursor: 'pointer' }}
              onDragOver={event => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
              <p style={{ margin: '0 0 0.5rem', fontWeight: '600', color: '#2C1810' }}>Drop your CSV here or click to browse</p>
              <p style={{ margin: 0, color: '#9B8B82', fontSize: '0.85rem' }}>Accepts .csv files only</p>
              <input ref={fileRef} type="file" accept=".csv" onChange={event => { const file = event.target.files?.[0]; if (file) processFile(file) }} style={{ display: 'none' }} />
            </div>

            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button onClick={downloadTemplate} style={styles.secondaryBtn}>⬇️ Download CSV Template</button>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: '#F5EFE6', borderRadius: '10px', border: '1px solid #E8D5B7' }}>
              <p style={{ margin: '0 0 0.4rem', fontWeight: '600', color: '#2C1810', fontSize: '0.85rem' }}>📋 Import notes</p>
              <p style={{ margin: 0, color: '#6B5C52', fontSize: '0.8rem', lineHeight: 1.6 }}>
                Required: Title, Ingredients, Instructions. Ingredients can be separated by semicolons, pipes, or line breaks. Complexity accepts simple/moderate/complex and automatically maps easy/medium/hard.
              </p>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ ...styles.card, padding: '0.75rem 1.25rem', display: 'flex', gap: '1.5rem', flex: 1, minWidth: '260px' }}>
                <div><strong style={{ color: '#16a34a', fontSize: '1.3rem' }}>{validCount}</strong> <span style={{ color: '#6B5C52', fontSize: '0.8rem' }}>ready</span></div>
                {errorCount > 0 && <div><strong style={{ color: '#dc2626', fontSize: '1.3rem' }}>{errorCount}</strong> <span style={{ color: '#6B5C52', fontSize: '0.8rem' }}>with errors</span></div>}
                <div><strong style={{ color: '#C4622D', fontSize: '1.3rem' }}>{selectedRows.size}</strong> <span style={{ color: '#6B5C52', fontSize: '0.8rem' }}>selected</span></div>
                <div style={{ color: '#9B8B82', fontSize: '0.8rem', alignSelf: 'center' }}>📄 {fileName}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => { setStage('upload'); setRecipes([]) }} style={styles.secondaryBtn}>← Re-upload</button>
                <button onClick={runImport} disabled={selectedRows.size === 0} style={{ ...styles.primaryBtn, opacity: selectedRows.size === 0 ? 0.5 : 1 }}>
                  Import {selectedRows.size} Recipe{selectedRows.size === 1 ? '' : 's'}
                </button>
              </div>
            </div>

            <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
                    <tr>
                      <th style={styles.th}><input type="checkbox" checked={selectedRows.size === validCount && validCount > 0} onChange={toggleAll} /></th>
                      <th style={styles.th}>Row</th>
                      <th style={styles.th}>Title</th>
                      <th style={styles.th}>Complexity</th>
                      <th style={styles.th}>Meal Type</th>
                      <th style={styles.th}>Cuisine</th>
                      <th style={styles.th}>Dietary</th>
                      <th style={styles.th}>Prep</th>
                      <th style={styles.th}>Cook</th>
                      <th style={styles.th}>Servings</th>
                      <th style={styles.th}>Ingredients</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map((recipe, index) => {
                      const hasErrors = recipe._errors.length > 0
                      const complexityColor = recipe.complexity === 'simple' ? ['#16a34a', '#dcfce7'] : recipe.complexity === 'moderate' ? ['#d97706', '#fef3c7'] : ['#dc2626', '#fee2e2']
                      return (
                        <tr key={index} style={{ background: hasErrors ? '#FFF5F5' : selectedRows.has(index) ? '#F0FFF4' : 'white' }}>
                          <td style={styles.td}><input type="checkbox" checked={selectedRows.has(index)} disabled={hasErrors} onChange={() => toggleRow(index)} /></td>
                          <td style={{ ...styles.td, color: '#9B8B82' }}>{recipe._row}</td>
                          <td style={{ ...styles.td, fontWeight: '600', color: '#2C1810', minWidth: '180px' }}>{recipe.title || '—'}</td>
                          <td style={styles.td}><span style={badge(complexityColor[0], complexityColor[1])}>{recipe.complexity}</span></td>
                          <td style={styles.td}>{recipe.meal_type.map(tag => <span key={tag} style={badge('#C4622D', '#FEF3EC')}>{tag}</span>)}</td>
                          <td style={styles.td}>{recipe.cuisine_tags.slice(0, 2).map(tag => <span key={tag} style={badge('#6B5C52', '#F5EFE6')}>{tag}</span>)}</td>
                          <td style={styles.td}>{recipe.dietary_tags.slice(0, 2).map(tag => <span key={tag} style={badge('#16a34a', '#dcfce7')}>{tag}</span>)}</td>
                          <td style={styles.td}>{recipe.prep_time_minutes !== null ? `${recipe.prep_time_minutes}m` : '—'}</td>
                          <td style={styles.td}>{recipe.cook_time_minutes !== null ? `${recipe.cook_time_minutes}m` : '—'}</td>
                          <td style={styles.td}>{recipe.servings ?? '—'}</td>
                          <td style={styles.td}>{recipe.ingredients.length}</td>
                          <td style={styles.td}>{hasErrors ? <div style={{ color: '#dc2626', fontSize: '0.75rem' }}>{recipe._errors.map(error => <div key={error}>⚠ {error}</div>)}</div> : <span style={badge('#16a34a', '#dcfce7')}>✓ Ready</span>}</td>
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
          <div style={{ ...styles.card, textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
            <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810' }}>Importing recipes...</h3>
            <div style={{ background: '#F5EFE6', borderRadius: '999px', height: '10px', overflow: 'hidden', maxWidth: '400px', margin: '1.5rem auto 0' }}>
              <div style={{ background: '#C4622D', height: '100%', width: `${importProgress}%`, transition: 'width 0.3s ease' }} />
            </div>
            <p style={{ color: '#9B8B82', fontSize: '0.85rem' }}>{importProgress}%</p>
          </div>
        )}

        {stage === 'images' && (
          <div>
            <div style={{ ...styles.card, marginBottom: '1.5rem', padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-serif)', color: '#2C1810', margin: '0 0 0.25rem' }}>🎉 {importResults.success} recipe{importResults.success === 1 ? '' : 's'} imported!</h3>
                  <p style={{ color: '#6B5C52', margin: 0, fontSize: '0.875rem' }}>Add photos now or skip and add them later.</p>
                  {importResults.failed > 0 && <p style={{ color: '#dc2626', margin: '0.35rem 0 0', fontSize: '0.82rem' }}>{importResults.failed} failed to import.</p>}
                </div>
                <button onClick={onComplete} style={styles.secondaryBtn}>Skip → Done</button>
              </div>
            </div>

            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {importedRecipes.map(recipe => {
                const isUploading = uploadingId === recipe.id
                const hasImage = Boolean(recipe.image_url)
                const wasUploaded = uploadedIds.has(recipe.id)
                return (
                  <div key={recipe.id} style={{ background: 'white', border: `1.5px solid ${wasUploaded ? '#86efac' : '#E8D5B7'}`, borderRadius: '12px', overflow: 'hidden' }}>
                    <div onClick={() => !isUploading && triggerImageUpload(recipe.id)} style={{ height: '130px', background: '#F5EFE6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isUploading ? 'wait' : 'pointer', position: 'relative', overflow: 'hidden' }}>
                      {hasImage ? <img src={recipe.image_url!} alt={recipe.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center', color: '#C8BAB2' }}>📷<div style={{ fontSize: '0.75rem', fontWeight: '600' }}>Add Photo</div></div>}
                      {isUploading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4622D', fontWeight: '600' }}>Uploading…</div>}
                    </div>
                    <div style={{ padding: '0.65rem 0.75rem' }}>
                      <div style={{ fontWeight: '600', color: '#2C1810', fontSize: '0.82rem' }}>{recipe.title}</div>
                      <button onClick={() => !isUploading && triggerImageUpload(recipe.id)} disabled={isUploading} style={{ marginTop: '0.4rem', width: '100%', padding: '0.35rem', border: '1.5px solid #E8D5B7', borderRadius: '6px', background: '#FDF6EE', color: '#6B5C52', fontWeight: '600', cursor: 'pointer' }}>
                        {isUploading ? 'Uploading…' : hasImage ? 'Change Photo' : '+ Add Photo'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <button onClick={onComplete} style={styles.primaryBtn}>Finish → View Recipes</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
