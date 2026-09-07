const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { name, email, subject, message } = await req.json()

    if (!name || !email || !subject || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: 'erica@momentummasteryhq.com',
        subject: `[Createry Support] ${subject}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2C1810;">New Support Request</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #6B5C52; width: 80px;">Name</td>
                <td style="padding: 8px 0; color: #2C1810;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #6B5C52;">Email</td>
                <td style="padding: 8px 0; color: #2C1810;"><a href="mailto:${email}">${email}</a></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: 600; color: #6B5C52;">Subject</td>
                <td style="padding: 8px 0; color: #2C1810;">${subject}</td>
              </tr>
            </table>
            <hr style="border: none; border-top: 1px solid #E8D5B7; margin: 16px 0;" />
            <h3 style="color: #2C1810; margin: 0 0 8px;">Message</h3>
            <p style="color: #2C1810; white-space: pre-wrap; line-height: 1.6;">${message}</p>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || 'Resend API error')
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
