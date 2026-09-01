const pageTitles = [
  { path: '/dashboard', title: 'Dashboard' },
  { path: '/kunden-unternehmer', title: 'Kunden & Unternehmer' },
  { path: '/crm', title: 'Customer Relationship Management (CRM)' },
  { path: '/paletten', title: 'Palettenmanagement' },
  { path: '/qm', title: 'Qualitätsmanagement' },
  { path: '/wissen', title: 'Wissen' },
  { path: '/rechtsfaelle', title: 'Rechtsfälle' },
  { path: '/inkassofaelle', title: 'Inkassofälle' },
  { path: '/versicherungsfaelle', title: 'Versicherungsfälle / Schäden' },
]

export function getPageTitle(pathname) {
  return pageTitles.find((page) => pathname === page.path || pathname.startsWith(`${page.path}/`))?.title ?? 'Drehpunkt'
}
