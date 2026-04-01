import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { menu_id, grocery_list_id, user_id, gmail_access_token } = await req.json();

    if (!menu_id || !grocery_list_id || !user_id || !gmail_access_token) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch the menu
    const { data: menu } = await supabase
      .from("weekly_menus")
      .select("*")
      .eq("id", menu_id)
      .single();

    if (!menu) {
      return new Response(
        JSON.stringify({ error: "Menu not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch the grocery list
    const { data: groceryList } = await supabase
      .from("grocery_lists")
      .select("*")
      .eq("id", grocery_list_id)
      .single();

    if (!groceryList) {
      return new Response(
        JSON.stringify({ error: "Grocery list not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch all recipe IDs from menu to get recipe names
    const recipeIds = new Set<string>();
    const menuData = menu.menu_data as any;
    Object.values(menuData.days).forEach((day: any) => {
      if (day.breakfast) recipeIds.add(day.breakfast);
      if (day.lunch) recipeIds.add(day.lunch);
      if (day.dinner) recipeIds.add(day.dinner);
    });

    const { data: recipes } = await supabase
      .from("recipes")
      .select("id, title, prep_time_minutes, cook_time_minutes")
      .in("id", Array.from(recipeIds));

    const recipeMap: Record<string, any> = {};
    (recipes || []).forEach(r => { recipeMap[r.id] = r; });

    // 4. Build HTML email
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const instacartUrl = groceryList.instacart_cart_url;

    const menuRows = Object.entries(menuData.days)
      .map(([dayIndex, day]: [string, any]) => {
        const dayName = DAYS[parseInt(dayIndex)];
        const meals = [];
        if (day.breakfast && recipeMap[day.breakfast]) meals.push(`<strong>Breakfast:</strong> ${recipeMap[day.breakfast].title}`);
        if (day.lunch && recipeMap[day.lunch]) meals.push(`<strong>Lunch:</strong> ${recipeMap[day.lunch].title}`);
        if (day.dinner && recipeMap[day.dinner]) meals.push(`<strong>Dinner:</strong> ${recipeMap[day.dinner].title}`);
        if (meals.length === 0) return '';
        return `
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; font-weight: bold; color: #4f46e5; width: 120px; vertical-align: top;">${dayName}</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; line-height: 1.6;">${meals.join('<br>')}</td>
          </tr>`;
      })
      .filter(Boolean)
      .join('');

    // Group grocery items by aisle
    const items = groceryList.items as any[];
    const groupedItems: Record<string, any[]> = {};
    items.forEach(item => {
      const aisle = item.aisle || 'Other';
      if (!groupedItems[aisle]) groupedItems[aisle] = [];
      groupedItems[aisle].push(item);
    });

    const shoppingRows = Object.entries(groupedItems)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([aisle, aisleItems]) => `
        <tr><td colspan="2" style="padding: 12px 16px 4px; font-size: 11px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 0.05em; border-top: 2px solid #f0f0f0;">${aisle}</td></tr>
        ${aisleItems.map(item => `
          <tr>
            <td style="padding: 4px 16px; color: #333;">☐ ${item.name}</td>
            <td style="padding: 4px 16px; color: #888; text-align: right;">${item.quantity > 0 ? `${item.quantity} ${item.unit}` : item.unit}</td>
          </tr>`).join('')}
      `).join('');

    const weekDate = new Date(menu.week_start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    
    <!-- Header -->
    <div style="background: #4f46e5; border-radius: 12px 12px 0 0; padding: 32px; text-align: center; color: white;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700;">🍽️ Your Weekly Meal Plan</h1>
      <p style="margin: 8px 0 0; opacity: 0.85; font-size: 15px;">Week of ${weekDate}</p>
    </div>

    <!-- Menu Table -->
    <div style="background: white; padding: 0; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
      <div style="padding: 20px 16px 8px;">
        <h2 style="margin: 0; font-size: 16px; color: #111; font-weight: 600;">📅 This Week's Menu</h2>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        ${menuRows}
      </table>
    </div>

    <!-- Instacart Button -->
    ${instacartUrl ? `
    <div style="background: white; padding: 20px 16px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; border-top: 1px solid #f0f0f0; text-align: center;">
      <a href="${instacartUrl}" style="display: inline-block; background: #43b02a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 16px;">🛒 Order Groceries on Instacart</a>
      <p style="margin: 10px 0 0; font-size: 12px; color: #999;">All ${items.length} ingredients added to your cart</p>
    </div>` : ''}

    <!-- Shopping List -->
    <div style="background: white; padding: 0; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; border-top: 1px solid #f0f0f0;">
      <div style="padding: 20px 16px 8px;">
        <h2 style="margin: 0; font-size: 16px; color: #111; font-weight: 600;">🛍️ Shopping List (${items.length} items)</h2>
        <p style="margin: 4px 0 0; font-size: 13px; color: #888;">Shopping day: ${new Date(groceryList.shopping_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        ${shoppingRows}
      </table>
    </div>

    <!-- Footer -->
    <div style="background: #f8f9fa; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 20px; text-align: center; color: #888; font-size: 12px;">
      <p style="margin: 0;">Generated by Meal Plan App · Have a delicious week! 🥗</p>
    </div>

  </div>
</body>
</html>`;

    // 5. Get user email for the draft
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const userEmail = userData?.user?.email || '';

    // 6. Create Gmail draft via Gmail API
    const subject = `Your Meal Plan for the Week of ${weekDate}`;
    const emailContent = [
      `To: ${userEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody
    ].join('\r\n');

    // Base64url encode the email
    const encodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const gmailResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gmail_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: { raw: encodedEmail }
        }),
      }
    );

    if (!gmailResponse.ok) {
      const gmailError = await gmailResponse.text();
      throw new Error(`Gmail API error: ${gmailError}`);
    }

    const draft = await gmailResponse.json();

    // 7. Update grocery list status
    await supabase
      .from("grocery_lists")
      .update({ status: "emailed" })
      .eq("id", grocery_list_id);

    return new Response(
      JSON.stringify({ success: true, draft_id: draft.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
