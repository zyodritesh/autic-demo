import Link from 'next/link'

export default function HomePage() {
  return <>
    <header className="nav"><div className="brand"><span className="logo">N</span>NeuroLumina</div><Link className="btn primary" href="/login">Open AUTIC</Link></header>
    <main>
      <section className="hero"><div className="container"><p className="muted">Technology that adapts to people</p><h1>Helping before the meltdown happens.</h1><p style={{fontSize:20,maxWidth:720}}>AUTIC connects children, parents, therapists and schools through one calm and accessible support ecosystem.</p><p><Link className="btn primary" href="/login">Explore the working demo</Link></p></div></section>
      <section className="container" style={{padding:'64px 0'}}><h2>One connected platform</h2><div className="grid">
        {['Parent Workspace','Child Workspace','Therapist Workspace','School Workspace','Resource Centre','Creator Marketplace'].map((x,i)=><article className="card c4" key={x}><h3>{['👩‍👦','🧒','🩺','🏫','📚','🎨'][i]} {x}</h3><p className="muted">Role-specific workflows, realistic demo data and permission-aware access.</p></article>)}
      </div></section>
    </main>
  </>
}
