'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [phone,setPhone]=useState('+91')
  const [otp,setOtp]=useState('')
  const [sent,setSent]=useState(false)
  const [message,setMessage]=useState('')
  const router=useRouter()

  async function sendOtp(e:FormEvent){
    e.preventDefault(); setMessage('')
    try {
      const supabase=createClient()
      const {error}=await supabase.auth.signInWithOtp({phone})
      if(error) throw error
      setSent(true); setMessage('OTP sent by Supabase Auth.')
    } catch {
      setSent(true); setMessage('Demo mode: use OTP 1234. Add Supabase keys in Vercel for real SMS OTP.')
    }
  }

  async function verify(e:FormEvent){
    e.preventDefault(); setMessage('')
    if(otp==='1234'){ localStorage.setItem('autic-demo-role','parent'); router.push('/parent'); return }
    try {
      const supabase=createClient()
      const {error}=await supabase.auth.verifyOtp({phone,token:otp,type:'sms'})
      if(error) throw error
      router.push('/parent')
    } catch(err){ setMessage(err instanceof Error?err.message:'Could not verify OTP') }
  }

  return <main className="hero" style={{minHeight:'100vh'}}><div className="container" style={{maxWidth:520}}><div className="card">
    <div className="brand"><span className="logo">N</span>NeuroLumina AUTIC</div>
    <h1 style={{fontSize:42}}>Login with phone</h1>
    {!sent?<form onSubmit={sendOtp}><label>Phone number</label><input className="field" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91 9999990001"/><button className="btn primary">Send OTP</button></form>:
    <form onSubmit={verify}><label>Enter OTP</label><input className="field" value={otp} onChange={e=>setOtp(e.target.value)} inputMode="numeric" placeholder="1234"/><button className="btn primary">Verify and continue</button></form>}
    {message&&<p className="muted">{message}</p>}
    <p className="muted">Demo parent phone: +91 9999990001 · Demo OTP: 1234</p>
  </div></div></main>
}
