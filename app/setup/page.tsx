'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Status = { ok:boolean; configured:boolean; tablesReady:boolean; message:string }

export default function SetupPage(){
  const [status,setStatus]=useState<Status|null>(null)
  const [loading,setLoading]=useState(true)

  async function check(){
    setLoading(true)
    try{
      const response=await fetch('/api/health',{cache:'no-store'})
      const data=await response.json() as Status
      setStatus(data)
    }catch{
      setStatus({ok:false,configured:false,tablesReady:false,message:'Unable to reach the health endpoint.'})
    }finally{setLoading(false)}
  }

  useEffect(()=>{void check()},[])

  return <main className="main" style={{maxWidth:900,margin:'0 auto'}}>
    <div className="hero" style={{padding:28,borderRadius:24}}>
      <h1>AUTIC Database Setup</h1>
      <p>Use this screen to verify the Vercel and Supabase connection.</p>
    </div>
    <div className="grid" style={{marginTop:18}}>
      <section className="card c4"><span className="muted">Environment keys</span><div className="kpi">{loading?'…':status?.configured?'Ready':'Missing'}</div></section>
      <section className="card c4"><span className="muted">Database schema</span><div className="kpi">{loading?'…':status?.tablesReady?'Ready':'Not installed'}</div></section>
      <section className="card c4"><span className="muted">Overall status</span><div className="kpi">{loading?'Checking':status?.ok?'Connected':'Action needed'}</div></section>
      <section className="card c12">
        <h2>{status?.message || 'Checking Supabase…'}</h2>
        <p>When the schema is missing, open Supabase → SQL Editor and run <code>supabase/migrations/001_initial_schema.sql</code>.</p>
        <ol>
          <li>Confirm Vercel has <code>NEXT_PUBLIC_SUPABASE_URL</code>.</li>
          <li>Confirm Vercel has <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> or <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.</li>
          <li>Run the migration in the Supabase SQL Editor.</li>
          <li>Return here and click Check Again.</li>
        </ol>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <button className="btn primary" onClick={check}>Check Again</button>
          <Link className="btn soft" href="/login">Open Login</Link>
          <Link className="btn soft" href="/parent">Open Parent Demo</Link>
        </div>
      </section>
    </div>
  </main>
}
