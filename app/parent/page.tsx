'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Mood={id:string;emotion:string;note:string;created_at:string}
type Appointment={id:string;title:string;starts_at:string}
const initialMoods:Mood[]=[
  {id:'1',emotion:'Happy',note:'Art class was enjoyable.',created_at:'2026-08-01'},
  {id:'2',emotion:'Worried',note:'Assembly was noisy.',created_at:'2026-08-02'},
  {id:'3',emotion:'Calm',note:'Used a visual schedule.',created_at:'2026-08-03'}
]
const menu=['dashboard','child-profile','mood-check-in','mood-history','insights','reports','calm-space','resources','appointments','marketplace','notifications','settings']

export default function ParentPortal(){
  const [section,setSection]=useState('dashboard')
  const [moods,setMoods]=useState<Mood[]>(initialMoods)
  const [appointments,setAppointments]=useState<Appointment[]>([{id:'1',title:'Occupational Therapy',starts_at:'2026-08-08T16:00'}])
  const [emotion,setEmotion]=useState('')
  const [note,setNote]=useState('')
  const [db,setDb]=useState<'loading'|'live'|'demo'>('loading')

  useEffect(()=>{ void load() },[])
  async function load(){
    try{
      const supabase=createClient()
      const [{data:m,error:me},{data:a,error:ae}]=await Promise.all([
        supabase.from('mood_entries').select('id,emotion,note,created_at').order('created_at',{ascending:false}),
        supabase.from('appointments').select('id,title,starts_at').order('starts_at')
      ])
      if(me||ae) throw me||ae
      if(m?.length) setMoods(m as Mood[])
      if(a?.length) setAppointments(a as Appointment[])
      setDb('live')
    }catch{ setDb('demo') }
  }
  async function saveMood(){
    if(!emotion) return alert('Choose a mood')
    const entry={id:crypto.randomUUID(),emotion,note,created_at:new Date().toISOString()}
    setMoods(v=>[entry,...v]); setEmotion(''); setNote('')
    if(db==='live'){
      const supabase=createClient(); const {error}=await supabase.from('mood_entries').insert({emotion:entry.emotion,note:entry.note})
      if(error) alert(error.message)
    }
    setSection('dashboard')
  }
  async function addAppointment(){
    const title=prompt('Appointment title'); const starts_at=prompt('Date and time (YYYY-MM-DDTHH:mm)')
    if(!title||!starts_at) return
    const item={id:crypto.randomUUID(),title,starts_at}; setAppointments(v=>[...v,item])
    if(db==='live'){const supabase=createClient(); await supabase.from('appointments').insert({title,starts_at})}
  }
  const common=useMemo(()=>moods.reduce<Record<string,number>>((a,m)=>(a[m.emotion]=(a[m.emotion]||0)+1,a),{}),[moods])

  return <>
    <header className="nav"><div className="brand"><span className="logo">N</span>AUTIC Parent Portal</div><div><span className="muted">Database: {db}</span> &nbsp; <Link className="btn soft" href="/login">Logout</Link></div></header>
    <div className="shell"><aside className="side">{menu.map(x=><a key={x} href="#" onClick={e=>{e.preventDefault();setSection(x)}}>{x.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')}</a>)}</aside>
    <main className="main">{render()}</main></div>
  </>

  function render(){
    if(section==='dashboard') return <><div className="hero" style={{padding:28,borderRadius:24}}><h2>Good morning, Riya</h2><p>Aarav’s calm support workspace is ready.</p></div><div className="grid" style={{marginTop:16}}>
      <div className="card c3"><span className="muted">Latest mood</span><div className="kpi">😊 {moods[0]?.emotion||'—'}</div></div>
      <div className="card c3"><span className="muted">Check-ins</span><div className="kpi">{moods.length}</div></div>
      <div className="card c3"><span className="muted">Appointments</span><div className="kpi">{appointments.length}</div></div>
      <div className="card c3"><span className="muted">Common mood</span><div className="kpi">{Object.entries(common).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—'}</div></div>
      <div className="card c8"><h3>Recent check-ins</h3>{moods.slice(0,5).map(m=><p key={m.id}><b>{m.emotion}</b> · {new Date(m.created_at).toLocaleDateString()}<br/><span className="muted">{m.note}</span></p>)}</div>
      <div className="card c4"><h3>Pattern insight</h3><p>Aarav appears calmer on days with visual preparation and predictable transitions.</p></div>
    </>
    if(section==='child-profile') return <><h1>Child Profile</h1><div className="grid"><div className="card c4"><h3>Aarav Sharma</h3><p>Age 8 · Grade 3</p><p>Bright Future Inclusive School</p></div><div className="card c4"><h3>Interests</h3><p>Animals, drawing and swings</p></div><div className="card c4"><h3>Sensory profile</h3><p>Loud sounds are uncomfortable. Visual schedules and deep pressure can help.</p></div></div></>
    if(section==='mood-check-in') return <><h1>How is Aarav feeling?</h1><div className="card"><div className="moods">{['Happy','Calm','Okay','Worried','Sad','Angry','Overwhelmed','Tired'].map(x=><button className={'mood '+(emotion===x?'active':'')} onClick={()=>setEmotion(x)} key={x}>{x}</button>)}</div><textarea className="field" value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note" rows={4}/><button className="btn primary" onClick={saveMood}>Save Mood</button></div></>
    if(section==='mood-history') return <><h1>Mood History</h1><div className="card"><table className="table"><thead><tr><th>Date</th><th>Mood</th><th>Note</th></tr></thead><tbody>{moods.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString()}</td><td>{m.emotion}</td><td>{m.note}</td></tr>)}</tbody></table></div></>
    if(section==='insights') return <><h1>Pattern Insights</h1><div className="grid"><div className="card c6"><h3>Calmer after visual preparation</h3><p>Recent entries suggest smoother transitions when Aarav receives advance visual cues.</p></div><div className="card c6"><h3>Noise may increase stress</h3><p>Worried entries have appeared after assemblies and unexpected loud environments.</p></div></div></>
    if(section==='reports') return <><h1>Weekly Report</h1><div className="grid"><div className="card c8"><h3>Mood summary</h3>{Object.entries(common).map(([k,v])=><p key={k}>{k}: {v}</p>)}</div><div className="card c4"><button className="btn primary" onClick={()=>window.print()}>Print / Save PDF</button></div></div></>
    if(section==='calm-space') return <><h1>Calm Space</h1><div className="card"><h2>Box Breathing</h2><p>Breathe in for 4 · Hold for 4 · Breathe out for 4 · Hold for 4.</p><button className="btn primary" onClick={()=>alert('One-minute calming session started.')}>Start Exercise</button></div></>
    if(section==='resources') return <><h1>Resource Centre</h1><div className="grid">{['Understanding Autism','Sensory Support at School','Using Visual Schedules','Meltdown vs Tantrum','Communication Strategies','Parent Wellbeing'].map(x=><div className="card c4" key={x}><h3>{x}</h3><p className="muted">6 min read</p><button className="btn soft">Open</button></div>)}</div></>
    if(section==='appointments') return <><div style={{display:'flex',justifyContent:'space-between'}}><h1>Appointments</h1><button className="btn primary" onClick={addAppointment}>Add Appointment</button></div><div className="grid">{appointments.map(a=><div className="card c4" key={a.id}><h3>{a.title}</h3><p>{new Date(a.starts_at).toLocaleString()}</p></div>)}</div></>
    if(section==='marketplace') return <><h1>Creator Marketplace</h1><div className="grid">{[['🎨','Sunrise Garden Painting','₹450'],['💌','Handmade Greeting Cards','₹299'],['📷','Nature Photography Print','₹599']].map(x=><div className="card c4" key={x[1]}><div style={{fontSize:54}}>{x[0]}</div><h3>{x[1]}</h3><b>{x[2]}</b><p><button className="btn primary" onClick={()=>alert('Added to demo cart')}>Add to Cart</button></p></div>)}</div></>
    if(section==='notifications') return <><h1>Notifications</h1><div className="card"><p><b>Teacher observation shared</b><br/><span className="muted">Neha Sharma added a classroom observation.</span></p><p><b>Weekly report ready</b><br/><span className="muted">Aarav’s weekly report is available.</span></p></div></>
    return <><h1>Settings</h1><div className="card"><label><input type="checkbox"/> Large text</label><p><label><input type="checkbox"/> Reduce motion</label></p><p><label><input type="checkbox"/> High contrast</label></p></div></>
  }
}
