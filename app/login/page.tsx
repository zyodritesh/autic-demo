'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const demoUsers:Record<string,{role:string;name:string;route:string}>={
  '9999990001':{role:'parent',name:'Riya Sharma',route:'/parent'},
  '9999990002':{role:'child',name:'Aarav Sharma',route:'/child'},
  '9999990003':{role:'therapist',name:'Dr. Priya Gupta',route:'/therapist'},
  '9999990004':{role:'teacher',name:'Neha Sharma',route:'/teacher'},
  '9999990005':{role:'school_admin',name:'Mrs. Kavita Mehta',route:'/school-admin'},
  '9999990006':{role:'platform_admin',name:'Platform Admin',route:'/platform-admin'}
}

function digits(value:string){return value.replace(/\D/g,'').slice(-10)}

export default function LoginPage() {
  const [phone,setPhone]=useState('+91 9999990001')
  const [otp,setOtp]=useState('')
  const [sent,setSent]=useState(false)
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const router=useRouter()
  const demo=useMemo(()=>demoUsers[digits(phone)],[phone])

  async function sendOtp(e:FormEvent){
    e.preventDefault(); setMessage(''); setBusy(true)
    const normalized=`+91${digits(phone)}`
    try {
      const supabase=createClient()
      const {error}=await supabase.auth.signInWithOtp({phone:normalized,options:{data:{role:demo?.role||'parent',full_name:demo?.name||''}}})
      if(error) throw error
      setMessage('OTP sent by Supabase Auth.')
    } catch {
      setMessage('Demo mode is active. Use OTP 1234.')
    } finally {setSent(true);setBusy(false)}
  }

  async function verify(e:FormEvent){
    e.preventDefault(); setMessage(''); setBusy(true)
    const normalized=`+91${digits(phone)}`
    if(otp==='1234'&&demo){
      localStorage.setItem('autic-demo-session',JSON.stringify({phone:digits(phone),role:demo.role,name:demo.name}))
      router.push(demo.route); return
    }
    try {
      const supabase=createClient()
      const {data,error}=await supabase.auth.verifyOtp({phone:normalized,token:otp,type:'sms'})
      if(error) throw error
      const role=(data.user?.user_metadata?.role||'parent') as string
      const route={parent:'/parent',child:'/child',therapist:'/therapist',teacher:'/teacher',school_admin:'/school-admin',platform_admin:'/platform-admin'}[role]||'/parent'
      router.push(route)
    } catch(err){setMessage(err instanceof Error?err.message:'Could not verify OTP')} finally {setBusy(false)}
  }

  return <main className="hero" style={{minHeight:'100vh'}}><div className="container" style={{maxWidth:620}}><div className="card">
    <div className="brand"><span className="logo">N</span>NeuroLumina AUTIC</div>
    <h1 style={{fontSize:42}}>Login with phone</h1>
    <p className="muted">One login automatically opens the workspace assigned to that phone number.</p>
    {!sent?<form onSubmit={sendOtp}><label>Phone number</label><input className="field" value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel"/><button className="btn primary" disabled={busy}>{busy?'Sending…':'Send OTP'}</button></form>:
    <form onSubmit={verify}><label>Enter OTP</label><input className="field" value={otp} onChange={e=>setOtp(e.target.value)} inputMode="numeric" placeholder="1234"/><div style={{display:'flex',gap:10}}><button className="btn primary" disabled={busy}>{busy?'Verifying…':'Verify and continue'}</button><button type="button" className="btn soft" onClick={()=>{setSent(false);setOtp('')}}>Change number</button></div></form>}
    {demo&&<p><b>Detected demo user:</b> {demo.name} · {demo.role.replace('_',' ')}</p>}
    {message&&<p className="muted">{message}</p>}
    <div className="card" style={{marginTop:18,background:'#f8fafc'}}><b>Demo numbers</b><p className="muted">0001 Parent · 0002 Child · 0003 Therapist · 0004 Teacher · 0005 School Admin · 0006 Platform Admin<br/>All start with 999999. Demo OTP: 1234</p></div>
  </div></div></main>
}
