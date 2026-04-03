import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

async function fetchPageHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeScraper/1.0)' }
  })
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`)
  return await res.text()
}

function extractRecipeLinks(html: string, baseUrl: string): { title: string; url: string }[] {
  const base = new URL(baseUrl)
  const links: { title: string; url: string }[] = []
  const seen = new Set<string>()

  const skipPatterns = [
    '/category/', '/tag/', '/author/', '/page/', '/feed/', '/about',
    '/contact', '/privacy', '/terms', '/search', '/shop', '/cart',
    '/account', '/login', '/register', '/wp-', '#', 'mailto:', 'javascript:',
    '/course/', '/courses/'
  ]

  const anchorRegex = /<a[^>]+href=["'"]([^"'">]+)["'"][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = anchorRegex.exec(html)) !== null) {
    let href = match[1].trim()
    const rawText = match[2].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim()
    if (!href) continue
    if (skipPatterns.some(p => href.includes(p))) continue
    try {
      const absolute = new URL(href, base.origin).href
      if (!absolute.startsWith(base.origin)) continue
      const path = new URL(absolute).pathname
      if (path === '/' || path === '') continue
      const cleanPath = path.replace(/\/$/, '')
      if (seen.has(cleanPath)) continue
      const segments = path.split('/').filter(Boolean)
      if (segments.length < 1) continue
      if (skipPatterns.some(p => path.includes(p))) continue
      if (!rawText || rawText.length < 4) continue
      if (rawText.split(' ').length < 2) continue
      seen.add(cleanPath)
      links.push({ title: rawText, url: absolute })
    } catch { continue }
  }
  return links.slice(0, 60)
}

async function parseRecipeWithClaude(html: string, url: string): Promise<any> {
  const truncated = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                        .replace(/<style[\s\S]*?<\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 12000)

  const prompt = `Extract the recipe from this webpage content and return ONLY a JSON object with no other text.

URL: ${url}

Page content:
${truncated}

Return this exact JSON structure:
{
  "title": "recipe name",
  "description": "brief description or null",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": "full instructions as a single string",
  "prep_time_minutes": null or number,
  "cook_time_minutes": null or number,
  "servings": null or number,
  "cuisine_tags": [],
  "meal_type": ["dinner"],
  "dietary_tags": [],
  "complexity": "simple or moderate or complex",
  "image_url": "main image URL from the page or null"
}

cuisine_tags options: italian, mexican, asian, american, mediterranean, indian, thai, greek, french, japanese, southern, middle_eastern
meal_type options: breakfast, lunch, dinner, snack, dessert
dietary_tags options: vegetarian, vegan, gluten-free, dairy-free, keto, paleo, nut-free
complexity: simple (under 30 min, few steps), moderate (30-60 min), complex (over 60 min or many steps)`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { mode, url, urls, tenant_id } = await req.json()

    if (mode === 'discover') {
      const html = await fetchPageHtml(url)
      const links = extractRecipeLinks(html, url)
      return new Response(JSON.stringify({ links }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (mode === 'parse') {
      const targetUrls: string[] = urls || [url]
      const results = []
      for (const u of targetUrls) {
        try {
          const html = await fetchPageHtml(u)
          const recipe = await parseRecipeWithClaude(html, u)
          results.push({ url: u, recipe, error: null })
        } catch (err: any) {
          results.push({ url: u, recipe: null, error: err.message })
        }
      }
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (mode === 'save') {
      const { recipes, tenant_id: tid } = await req.json().catch(() => ({ recipes: [], tenant_id: tenant_id }))
      return new Response(JSON.stringify({ error: 'Use mode=save with recipes array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid mode' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
