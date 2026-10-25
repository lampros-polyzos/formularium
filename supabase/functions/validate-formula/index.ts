import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { profileId, ingredients, targetPh, totalPercentage } = await req.json()

    // 1. Initialize Supabase client using the Auth context of the user calling it
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 2. Fetch the specific constraints for the selected product profile
    const { data: profile, error } = await supabaseClient
      .from('formulation_profiles')
      .select('*')
      .eq('id', profileId)
      .single()

    if (error || !profile) {
      throw new Error('Profile not found')
    }

    const alerts = []

    // 3. Analyze the formula against the constraints
    const hasWater = ingredients.some((i: any) => i.function === 'Solvent' && i.name.toLowerCase().includes('water'))
    const hasOil = ingredients.some((i: any) => i.function === 'Carrier Oil' || i.function === 'Butter')
    const hasEmulsifier = ingredients.some((i: any) => i.function === 'Emulsifier')
    const hasPreservative = ingredients.some((i: any) => i.function === 'Preservative')

    // Profile Requirement Checks
    if (profile.requires_water && !hasWater) {
      alerts.push({ type: 'error', message: `Profile '${profile.name}' requires a water phase.` })
    }
    if (!profile.requires_water && hasWater) {
      alerts.push({ type: 'error', message: `Water detected in an anhydrous profile. This will cause separation.` })
    }
    if (profile.requires_oil && !hasOil) {
      alerts.push({ type: 'warning', message: `Profile '${profile.name}' usually requires an oil or lipid phase.` })
    }
    if (profile.requires_emulsifier && !hasEmulsifier) {
      alerts.push({ type: 'error', message: `Missing emulsifier. The water and oil phases will separate.` })
    }
    if (profile.requires_preservative && !hasPreservative) {
      alerts.push({ type: 'error', message: `Missing broad-spectrum preservative. This formulation is unsafe for long-term storage.` })
    }

    // Basic Math & pH Checks
    if (totalPercentage !== 100) {
      alerts.push({ type: 'warning', message: `Formula total is ${totalPercentage}%. It must equal exactly 100.00%.` })
    }
    if (targetPh && profile.default_ph_min && targetPh < profile.default_ph_min) {
      alerts.push({ type: 'warning', message: `Target pH is below the recommended minimum (${profile.default_ph_min}) for this product type.` })
    }

    // 4. Return the alerts to the frontend
    return new Response(
      JSON.stringify({ alerts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})