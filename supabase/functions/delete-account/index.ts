import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Get the user from the Authorization header (user's own JWT)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create a client with the user's token to verify identity
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

    const userId = user.id

    // Use service role client for privileged operations
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Delete user data from all relevant tables
    const tables = [
      'grocery_lists',
      'weekly_menus',
      'meal_preferences',
      'weekly_schedule',
      'dietary_constraints',
      'user_purchases',
    ]

    // First get family profile IDs so we can delete child records
    const { data: familyProfiles } = await adminClient
      .from('family_profiles')
      .select('id')
      .eq('user_id', userId)

    if (familyProfiles && familyProfiles.length > 0) {
      const familyIds = familyProfiles.map((f: { id: string }) => f.id)

      for (const table of tables) {
        await adminClient.from(table).delete().in('family_id', familyIds)
      }
    }

    // Delete user_purchases by user_id directly (in case schema differs)
    await adminClient.from('user_purchases').delete().eq('user_id', userId)

    // Delete family_profiles
    await adminClient.from('family_profiles').delete().eq('user_id', userId)

    // Delete user_profiles
    await adminClient.from('user_profiles').delete().eq('user_id', userId)

    // Delete the auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('Error deleting auth user:', deleteError)
      return new Response(JSON.stringify({ error: 'Failed to delete account. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('delete-account error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
