const pageTitles = [
  { path: '/dashboard', title: 'Dashboard' },
  { path: '/team', title: 'Team Brennpunkt' },
  { path: '/kunden-unternehmer', title: 'Kunden & Unternehmer' },
  { path: '/crm', title: 'Customer Relationship Management (CRM)' },
  { path: '/paletten', title: 'Palettenmanagement' },
  { path: '/news', title: 'News' },
  { path: '/dokumente', title: 'Dokumente' },
  { path: '/todos', title: 'To-dos' },
  { path: '/profil', title: 'Mein Profil' },
]

export function getPageTitle(pathname) {
  return pageTitles.find((page) => pathname === page.path || pathname.startsWith(`${page.path}/`))?.title ?? 'Drehpunkt'
}
