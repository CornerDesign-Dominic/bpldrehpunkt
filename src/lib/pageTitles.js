const pageTitles = [
  { path: '/dashboard', title: 'Dashboard' },
  { path: '/kunden-unternehmer', title: 'Kunden & Unternehmer' },
  { path: '/crm', title: 'Customer Relationship Management (CRM)' },
  { path: '/paletten', title: 'Palettenmanagement' },
  { path: '/dispo-cockpit', title: 'Dispo-Cockpit' },
  { path: '/news', title: 'News' },
  { path: '/dokumente', title: 'Dokumente' },
  { path: '/qm', title: 'Qualitätsmanagement' },
  { path: '/wissen', title: 'Wissen' },
  { path: '/todos', title: 'To-dos' },
  { path: '/rechtsfaelle', title: 'Rechtsfälle' },
  { path: '/inkassofaelle', title: 'Inkassofälle' },
  { path: '/versicherungsfaelle', title: 'Versicherungsfälle / Schäden' },
]

export function getPageTitle(pathname) {
  return pageTitles.find((page) => pathname === page.path || pathname.startsWith(`${page.path}/`))?.title ?? 'Drehpunkt'
}
