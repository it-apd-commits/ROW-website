// Supabase Edge Function: admin-invite-user
//
// Lets an Admin add a new user from the Admin Control Center without needing
// the user to self-register first. Creates the auth user via Supabase's
// admin API (which emails them an invite link to set their own password)
// and writes the profiles row with the chosen name/role.
//
// Deploy: paste this file's contents into Supabase Dashboard > Edge Functions
// > New Function (name it "admin-invite-user"). SUPABASE_URL, SUPABASE_ANON_KEY
// and SUPABASE_SERVICE_ROLE_KEY are injected automatically by the platform —
// no manual secrets needed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ROLES = ['Admin', 'Manager', 'Staff', 'MIS', 'Fleet'];
const EMERGENCY_ADMIN_EMAILS = ['it@apd-india.org', 'shaikazeem@apd-india.org'];

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return json({ error: 'Missing Authorization header' }, 401);
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Scoped to the caller's own JWT — only used to figure out who is calling.
        const callerClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
        if (callerError || !caller) {
            return json({ error: 'Invalid session.' }, 401);
        }

        // Service-role client for privileged operations (bypasses RLS).
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const { data: callerProfile } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', caller.id)
            .single();

        const isEmergencyAdmin = EMERGENCY_ADMIN_EMAILS.includes((caller.email || '').toLowerCase().trim());
        if (callerProfile?.role !== 'Admin' && !isEmergencyAdmin) {
            return json({ error: 'Only Admins can add users.' }, 403);
        }

        const body = await req.json().catch(() => ({}));
        const email = (body.email || '').trim().toLowerCase();
        const fullName = (body.full_name || '').trim();
        const role = body.role;
        const redirectTo = body.redirectTo;

        if (!email || !fullName || !ALLOWED_ROLES.includes(role)) {
            return json({ error: 'email, full_name, and a valid role are required.' }, 400);
        }

        const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
            data: { full_name: fullName },
            redirectTo,
        });

        if (inviteError) {
            return json({ error: inviteError.message }, 400);
        }

        const { error: upsertError } = await adminClient
            .from('profiles')
            .upsert(
                { id: invited.user.id, email, full_name: fullName, role, is_active: true },
                { onConflict: 'id' }
            );

        if (upsertError) {
            return json({ error: `User invited but profile setup failed: ${upsertError.message}` }, 500);
        }

        return json({ success: true, user_id: invited.user.id }, 200);
    } catch (err) {
        return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
    }
});
