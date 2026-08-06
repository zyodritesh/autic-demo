'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type Role='child'|'therapist'|'teacher'|'school-admin'|'platform-admin'

const menus:Record<Role,string[]>={
  child:['Dashboard','Mood Check-In','Calm Space','Achievements','Goals','Resources'],
  therapist:['Dashboard','Assigned Children','Session Notes','Progress','Recommendations','Reports'],
  teacher:['Dashboard','Students','Observations','Reports','Resources','Notifications'],
  'school-admin':['Dashboard','Students','Teachers','Parents','Reports','Analytics'],
  'platform-admin':['Dashboard','All Users','Schools','Resources','Marketplace','Audit Logs']
}

const names:Record<Role,string>={child:'Aarav',therapist:'Dr. Priya',teacher:'Neha','school-admin':'Mrs. Mehta','platform-admin':'Platform Admin'}

export function Workspace({role}:{role:Role}){
  const [section,setSection]=useState('Dashboard')
  const [entries,setEntries]=useState<string[]>(role==='therapist'?['Visual schedule supported today’s transition.']:role==='teacher'?['Aarav participated after a two-minute warning.']:[])
  const [text,setText]=useState('')
  const title=role.split('-').map(x=>x[0].toUpperCase()+x.slice(1)).join(' ')
  const stats=useMemo(()=>role==='platform-admin'?[['Users','1,248'],['Schools','18'],['Reports','89'],['Alerts','3']]:role==='school-admin'?[['Students','126'],['Teachers','24'],['Check-ins','96%'],['Reports','17']]:[['Today’s Mood','Calm'],['Streak','12 days'],['Calm Sessions','8'],['Alerts','2']],[role])

  function addEntry(){if(!text.trim())return;setEntries(v=>[text.trim(),...v]);setText('')}

  return <>
    <header className="nav"><div className="brand"><span className="logo">N</span>AUTIC {title}</div><Link className="btn soft" href="/login">Switch Role</Link></header>
    <div className="shell"><aside className="side">{menus[role].map(item=><a href="#" className={section===item?'active':''} key={item} onClick={e=>{e.preventDefault();setSection(item)}}>{item}</a>)}</aside>
    <main className="main">
      <div className="hero" style={{padding:28,borderRadius:24}}><h1>Welcome, {names[role]}</h1><p>{section}</p></div>
      {section==='Dashboard'&&<div className="grid" style={{marginTop:18}}>{stats.map(x=><div className="card c3" key={x[0]}><span className="muted">{x[0]}</span><div className="kpi">{x[1]}</div></div>)}<div className="card c8"><h3>Weekly activity</h3><p>Mon ███████</p><p>Tue █████</p><p>Wed ████████</p><p>Thu ████</p><p>Fri █████████</p></div><div className="card c4"><h3>Latest update</h3><p>{entries[0]||'Everything is ready for the demo.'}</p></div></div>}
      {(section==='Session Notes'||section==='Observations')&&<div className="grid" style={{marginTop:18}}><div className="card c6"><textarea className="field" rows={7} value={text} onChange={e=>setText(e.target.value)} placeholder={`Write ${section.toLowerCase()}`}/><button className="btn primary" onClick={addEntry}>Save</button></div><div className="card c6">{entries.map((entry,index)=><p key={index}><b>{index===0?'Latest':'Previous'}</b><br/>{entry}</p>)}</div></div>}
      {section!=='Dashboard'&&section!=='Session Notes'&&section!=='Observations'&&<div className="grid" style={{marginTop:18}}><div className="card c8"><h2>{section}</h2><p>This workflow is interactive demo data inside the real Next.js application.</p><button className="btn primary" onClick={()=>alert(`${section} action completed in demo mode.`)}>Complete Demo Action</button></div><div className="card c4"><h3>Database mode</h3><p>Supabase-backed data becomes live after the migration is installed.</p><Link className="btn soft" href="/setup">Check Setup</Link></div></div>}
    </main></div>
  </>
}
