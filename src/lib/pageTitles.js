const pageTitles = [
  { path: '/dashboard', title: 'Dashboard' },
  { path: '/team', title: 'Team Brennpunkt' },
  { path: '/kunden-unternehmer', title: 'Kunden & Unternehmer' },
  { path: '/crm', title: 'Customer Relationship Management (CRM)' },
  { path: '/paletten', title: 'Palettenmanagement' },
  { path: '/news', title: 'News' },
  { path: '/dokumente', title: 'Dokumente' },
  { path: '/vorlagen', title: 'Vorlagen' },
  { path: '/todos', title: 'To-dos' },
  { path: '/profil', title: 'Mein Profil' },
  { path: '/admin/systemmails', title: 'Systemmails' },
  { path: '/admin', title: 'Adminbereich' },
  { path: '/urlaub', title: 'Urlaubsübersicht' },
  { path: '/kalender', title: 'Kalender' },
  { path: '/urlaubsmanagement', title: 'Urlaubsmanagement' },
]

export function getPageTitle(pathname) {
  return pageTitles.find((page) => pathname === page.path || pathname.startsWith(`${page.path}/`))?.title ?? 'Drehpunkt'
}
