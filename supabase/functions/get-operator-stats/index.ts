import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify the caller is a platform admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role to bypass RLS
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check platform_admins using service role (bypasses any RLS on that table)
    const { data: adminRow } = await admin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!adminRow) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch ALL family_profiles (includes default tenant users)
    const { data: familyProfiles, error: fpError } = await admin
      .from('family_profiles')
      .select('tenant_id')

    // Fetch all weekly_menus
    const { data: weeklyMenus } = await admin
      .from('weekly_menus')
      .select('tenant_id')

    console.log('family_profiles count:', familyProfiles?.length, 'error:', fpError)

    // Aggregate users by tenant (all tenants including default)
    const usersByTenant: Record<string, number> = {}
    for (const row of (familyProfiles || [])) {
      const key = row.tenant_id || DEFAULT_TENANT_ID
      usersByTenant[key] = (usersByTenant[key] || 0) + 1
    }

    // Aggregate menus by tenant
    const menusByTenant: Record<string, number> = {}
    for (const row of (weeklyMenus || [])) {
      const key = row.tenant_id || DEFAULT_TENANT_ID
      menusByTenant[key] = (menusByTenant[key] || 0) + 1
    }

    const totalUsers = (familyProfiles || []).length
    const totalMenus = (weeklyMenus || []).length

    return new Response(JSON.stringify({
      total_users: totalUsers,
      total_menus: totalMenus,
      users_by_tenant: usersByTenant,
      menus_by_tenant: menusByTenant,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('get-operator-stats error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
