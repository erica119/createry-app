import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Instacart Developer Platform (IDP) credentials
const INSTACART_API_KEY = Deno.env.get("INSTACART_API_KEY");
const INSTACART_ENV = Deno.env.get("INSTACART_ENV") || "production";
const INSTACART_BASE_URL = INSTACART_ENV === "development"
  ? "https://connect.dev.instacart.tools"
  : "https://connect.instacart.com";

const UNIT_PATTERN = '(?:cups?|c|tbsp|tablespoons?|tbs|tsp|teaspoons?|tspn|oz|ounces?|lbs?|pounds?|grams?|g|kgs?|kilograms?|mls?|millilit(?:er|re)s?|liters?|litres?|l|pints?|pt|quarts?|qt|gallons?|gal|cans?|bunch(?:es)?|heads?|pkgs?|packages?|packets?|pieces?|slices?|cloves?)';

function parseNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const raw = String(value).trim().replace(/–/g, '-');
  if (!raw) return 0;

  // For ranges, buy the upper end so the list does not under-buy.
  if (/^\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?$/.test(raw)) {
    return parseFloat(raw.split('-')[1].trim()) || 0;
  }

  // Mixed fraction, e.g. 1 1/2
  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  // Simple fraction, e.g. 1/2
  const fraction = raw.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);

  return parseFloat(raw) || 0;
}

function normalizeUnit(rawUnit: string): string {
  const unit = (rawUnit || '').trim().toLowerCase().replace(/\.$/, '');
  if (!unit) return '';

  const aliases: Record<string, string> = {
    c: 'cup', cup: 'cup', cups: 'cup',
    tbsp: 'tablespoon', tbs: 'tablespoon', tablespoon: 'tablespoon', tablespoons: 'tablespoon',
    tsp: 'teaspoon', tspn: 'teaspoon', teaspoon: 'teaspoon', teaspoons: 'teaspoon',
    oz: 'ounce', ounce: 'ounce', ounces: 'ounce',
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    g: 'g', gram: 'g', grams: 'g',
    kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
    ml: 'ml', mls: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
    l: 'liter', liter: 'liter', liters: 'liter', litre: 'liter', litres: 'liter',
    pint: 'pint', pints: 'pint', pt: 'pint',
    quart: 'quart', quarts: 'quart', qt: 'quart',
    gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
    can: 'can', cans: 'can',
    bunch: 'bunch', bunches: 'bunch',
    head: 'head', heads: 'head',
    package: 'package', packages: 'package', pkg: 'package', pkgs: 'package', packet: 'packet', packets: 'packet',
    each: 'each', ea: 'each',
    piece: 'each', pieces: 'each', slice: 'each', slices: 'each', clove: 'each', cloves: 'each',
  };
  return aliases[unit] || '';
}

function normalizeIngredient(ing: any): { name: string; quantity: number; unit: string } {
  let name = String(ing?.name || '').trim();
  let quantity = 0;
  let unit = normalizeUnit(String(ing?.unit || ''));

  // Newer imports may store "2 lbs" in quantity while older/manual recipes may
  // put the entire ingredient line in name. Support both representations.
  const rawQty = ing?.quantity;
  if (rawQty !== undefined && rawQty !== null && String(rawQty).trim()) {
    const qtyText = String(rawQty).trim();
    const qtyMatch = qtyText.match(new RegExp(`^(\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d+(?:\\.\\d+)?\\s*[-–]\\s*\\d+(?:\\.\\d+)?)(?:\\s+(${UNIT_PATTERN}))?$`, 'i'));
    if (qtyMatch) {
      quantity = parseNumber(qtyMatch[1]);
      if (!unit && qtyMatch[2]) unit = normalizeUnit(qtyMatch[2]);
    } else {
      quantity = parseNumber(qtyText);
    }
  }

  // Legacy fallback: parse a leading amount/unit out of the ingredient name.
  // Example: "3 cups basmati rice" -> { name: "basmati rice", quantity: 3, unit: "cup" }
  if (!quantity && name) {
    const withUnit = name.match(new RegExp(`^(\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d+(?:\\.\\d+)?\\s*[-–]\\s*\\d+(?:\\.\\d+)?)\\s+(${UNIT_PATTERN})\\b\\s+(.+)$`, 'i'));
    if (withUnit) {
      quantity = parseNumber(withUnit[1]);
      unit = normalizeUnit(withUnit[2]);
      name = withUnit[3].trim();
    } else {
      const amountOnly = name.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+|\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?)\s+(.+)$/);
      if (amountOnly) {
        quantity = parseNumber(amountOnly[1]);
        name = amountOnly[2].trim();
      }
    }
  }

  return { name, quantity, unit };
}

function instacartSearchName(name: string): string {
  return name
    .replace(/^\d+(?:\.\d+)?(?:\s+\d+\/\d+)?\s+/, '')
    .replace(/\b(cut into strips|cut into pieces|diced|finely diced|chopped|minced|sliced|cubed|shredded|grated|drained|rinsed|divided)\b/gi, '')
    .replace(/\boptional\b/gi, '')
    .replace(/\bfor serving\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { menu_id, family_id, tenant_id } = await req.json();

    if (!menu_id || !family_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: menu_id, family_id, tenant_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return new Response(JSON.stringify({ error: "Sign in required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    // 1. Fetch the menu
    const { data: menu, error: menuError } = await supabase
      .from("weekly_menus")
      .select("*")
      .eq("id", menu_id)
      .single();

    if (menuError || !menu) {
      return new Response(
        JSON.stringify({ error: "Menu not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Never trust IDs supplied by the browser while using a service-role client.
    const { data: family } = await supabase.from("family_profiles")
      .select("id, tenant_id, user_id").eq("id", family_id).single();
    if (menu.family_id !== family_id || menu.tenant_id !== tenant_id ||
        family?.tenant_id !== tenant_id || family?.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "This menu does not belong to your household" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Collect all recipe IDs
    const recipeIds = new Set<string>();
    const menuData = menu.menu_data as any;
    Object.values(menuData.days).forEach((day: any) => {
      if (day.breakfast) recipeIds.add(day.breakfast);
      if (day.lunch) recipeIds.add(day.lunch);
      if (day.dinner) recipeIds.add(day.dinner);
    });

    if (recipeIds.size === 0) {
      return new Response(
        JSON.stringify({ error: "No recipes in menu" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch all recipes
    const { data: recipes, error: recipesError } = await supabase
      .from("recipes")
      .select("id, title, ingredients, servings")
      .in("id", Array.from(recipeIds));

    if (recipesError || !recipes) throw new Error("Failed to fetch recipes");

    const recipeMap: Record<string, any> = {};
    recipes.forEach(r => { recipeMap[r.id] = r; });

    // 4. Aggregate ingredients
    const ingredientMap: Record<string, {
      name: string;
      quantity: number;
      unit: string;
      recipe_sources: string[];
    }> = {};

    Object.values(menuData.days).forEach((day: any) => {
      ['breakfast', 'lunch', 'dinner'].forEach(meal => {
        const recipeId = day[meal];
        if (!recipeId || !recipeMap[recipeId]) return;
        const recipe = recipeMap[recipeId];
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

        ingredients.forEach((rawIng: any) => {
          if (!rawIng || rawIng.shopping_exclude === true) return;
          const ing = typeof rawIng === 'string' ? normalizeIngredient({ name: rawIng }) : normalizeIngredient(rawIng);
          if (rawIng.shopping_name) ing.name = String(rawIng.shopping_name).trim();
          if (!ing.name) return;

          const key = `${ing.name.toLowerCase()}__${ing.unit.toLowerCase()}`;
          if (ingredientMap[key]) {
            ingredientMap[key].quantity += ing.quantity;
            if (!ingredientMap[key].recipe_sources.includes(recipe.title)) {
              ingredientMap[key].recipe_sources.push(recipe.title);
            }
          } else {
            ingredientMap[key] = {
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              recipe_sources: [recipe.title],
            };
          }
        });
      });
    });

    // 5. Build items array
    const items = Object.values(ingredientMap)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => ({
        ...item,
        quantity: item.quantity > 0 ? parseFloat(item.quantity.toFixed(2)) : item.quantity,
        checked: false,
        aisle: guessAisle(item.name),
      }));

    // Withhold a retailer link if any line cannot be purchased reliably.
    // A partial bulk cart looks complete but can leave the family without dinner.
    const needsReview = items.some(item =>
      item.quantity <= 0 ||
      /\b(?:or|and|optional|enough|to taste|for serving)\b/i.test(item.name) ||
      /^(?:arge|rilled|emon|reen|alt)\b/i.test(item.name)
    );
    const instacartUrl = needsReview ? null : await buildInstacartUrl(items, menu.week_start_date);

    // 7. Fetch grocery schedule
    const { data: grocerySchedule } = await supabase
      .from("grocery_schedule")
      .select("day_of_week, order_index")
      .eq("family_id", family_id)
      .order("order_index");

    const shoppingDays = grocerySchedule && grocerySchedule.length > 0
      ? grocerySchedule.map((s: any) => s.day_of_week)
      : [0];

    const weekStart = new Date(menu.week_start_date);
    const primaryShoppingDate = new Date(weekStart);
    primaryShoppingDate.setDate(weekStart.getDate() + shoppingDays[0]);
    const shoppingDateStr = primaryShoppingDate.toISOString().split('T')[0];

    // 8. Save the replacement before removing old lists so a failed insert
    // never destroys a household's existing list.
    // 9. Save grocery list
    const { data: savedList, error: saveError } = await supabase
      .from("grocery_lists")
      .insert({
        tenant_id,
        family_id,
        weekly_menu_id: menu_id,
        shopping_date: shoppingDateStr,
        items,
        instacart_cart_url: instacartUrl,
        status: "draft",
      })
      .select()
      .single();

    if (saveError) throw saveError;
    const { error: cleanupError } = await supabase.from("grocery_lists")
      .delete().eq("weekly_menu_id", menu_id).neq("id", savedList.id);
    if (cleanupError) console.error("Could not remove prior grocery list", cleanupError);

    return new Response(
      JSON.stringify({ success: true, grocery_list: savedList }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function buildInstacartUrl(items: any[], weekStartDate: string): Promise<string | null> {
  if (!INSTACART_API_KEY) {
    console.error("INSTACART_API_KEY is not set; skipping Instacart link generation");
    return null;
  }

  const lineItems = items
    .map(item => {
      const searchName = instacartSearchName(item.name);
      if (!searchName) return null;
      const quantity = item.quantity > 0 ? item.quantity : 1;
      const unit = normalizeUnit(item.unit) || 'each';

      return {
        // Instacart uses name as the search query. Keep quantity, weight,
        // preparation notes, and other noise out of this field.
        name: searchName,
        display_text: searchName,
        line_item_measurements: [{ quantity, unit }],
      };
    })
    .filter(Boolean);

  try {
    const response = await fetch(`${INSTACART_BASE_URL}/idp/v1/products/products_link`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${INSTACART_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        title: `Createry Shopping List - Week of ${weekStartDate}`,
        link_type: "shopping_list",
        line_items: lineItems,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Instacart API error (${response.status}): ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data.products_link_url ?? null;
  } catch (err) {
    console.error("Failed to build Instacart link:", err);
    return null;
  }
}

function guessAisle(name: string): string {
  const n = name.toLowerCase();
  if (/chicken|beef|pork|lamb|turkey|salmon|shrimp|fish|tuna|bacon|sausage/.test(n)) return 'Meat & Seafood';
  if (/milk|cheese|butter|cream|yogurt|egg|mozzarella|parmesan|feta/.test(n)) return 'Dairy & Eggs';
  if (/bread|tortilla|pita|bun|roll|bagel|wrap/.test(n)) return 'Bread & Bakery';
  if (/apple|banana|berry|berries|lemon|lime|orange|tomato|avocado|mango/.test(n)) return 'Produce';
  if (/broccoli|spinach|lettuce|kale|carrot|celery|onion|garlic|pepper|zucchini|cucumber|potato|mushroom|asparagus|cabbage/.test(n)) return 'Produce';
  if (/pasta|rice|noodle|quinoa|oat|flour|bread crumb/.test(n)) return 'Grains & Pasta';
  if (/can|canned|tomato sauce|broth|stock|bean|lentil|chickpea/.test(n)) return 'Canned & Dry Goods';
  if (/olive oil|vegetable oil|coconut oil|sesame oil/.test(n)) return 'Oils & Condiments';
  if (/soy sauce|fish sauce|oyster sauce|hot sauce|salsa|ketchup|mustard|mayo|vinegar/.test(n)) return 'Oils & Condiments';
  if (/salt|pepper|cumin|paprika|turmeric|oregano|basil|thyme|rosemary|cinnamon|ginger|curry|seasoning|spice/.test(n)) return 'Spices & Seasonings';
  if (/sugar|honey|maple syrup|vanilla/.test(n)) return 'Baking';
  if (/coconut milk|almond milk|oat milk/.test(n)) return 'Dairy & Eggs';
  if (/frozen/.test(n)) return 'Frozen';
  return 'Other';
}
