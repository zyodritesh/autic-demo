import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  )

  if (!configured) {
    return NextResponse.json({ ok: false, configured: false, tablesReady: false, message: 'Supabase environment variables are missing.' }, { status: 503 })
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('profiles').select('id').limit(1)
    if (error) {
      return NextResponse.json({ ok: false, configured: true, tablesReady: false, message: error.message }, { status: 503 })
    }
    return NextResponse.json({ ok: true, configured: true, tablesReady: true, message: 'Supabase is connected and the AUTIC schema is available.' })
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, tablesReady: false, message: error instanceof Error ? error.message : 'Database check failed.' }, { status: 503 })
  }
}
