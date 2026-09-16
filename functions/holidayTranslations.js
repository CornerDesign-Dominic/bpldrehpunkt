// Pure shared data: the lookup key is always countryCode + sourceName.
// It is intentionally independent of API or AI services.
const COMMON = Object.freeze({
  "New Year's Day": 'Neujahr',
  'Day after New Year\'s Day': 'Neujahrstag',
  Epiphany: 'Heilige Drei Könige',
  'Good Friday': 'Karfreitag',
  'Easter Sunday': 'Ostersonntag',
  'Easter Monday': 'Ostermontag',
  'Maundy Thursday': 'Gründonnerstag',
  'Labour Day': 'Tag der Arbeit',
  'Labour day': 'Tag der Arbeit',
  'International Workers\' Day': 'Tag der Arbeit',
  'International Workers Day': 'Tag der Arbeit',
  'May Day': 'Tag der Arbeit',
  'Ascension Day': 'Christi Himmelfahrt',
  Pentecost: 'Pfingstsonntag',
  'Whit Monday': 'Pfingstmontag',
  'Corpus Christi': 'Fronleichnam',
  'Assumption Day': 'Mariä Himmelfahrt',
  Assumption: 'Mariä Himmelfahrt',
  'Assumption of the Virgin Mary': 'Mariä Himmelfahrt',
  'All Saints\' Day': 'Allerheiligen',
  'All Saints Day': 'Allerheiligen',
  'Immaculate Conception': 'Mariä Empfängnis',
  'Christmas Eve': 'Heiligabend',
  'Christmas Day': '1. Weihnachtstag',
  'Second Day of Christmas': '2. Weihnachtstag',
  'St. Stephen\'s Day': '2. Weihnachtstag',
})

export const HOLIDAY_TRANSLATIONS_DE = Object.freeze({
  DE: { ...COMMON, 'German Unity Day': 'Tag der Deutschen Einheit', 'Reformation Day': 'Reformationstag', 'Repentance and Prayer Day': 'Buß- und Bettag', 'Day of Repentance and Prayer': 'Buß- und Bettag', 'International Women\'s Day': 'Internationaler Frauentag', 'World Children\'s Day': 'Weltkindertag', '75th anniversary of the uprising of June 17, 1953': '75. Jahrestag des Volksaufstands vom 17. Juni 1953' },
  NL: { ...COMMON, 'King\'s Day': 'Königstag' },
  BE: { ...COMMON, 'Armistice Day': 'Waffenstillstandstag', 'Belgian National Day': 'Belgischer Nationalfeiertag' },
  LU: { ...COMMON, 'Europe Day': 'Europatag', 'Sovereign\'s birthday': 'Geburtstag des Großherzogs' },
  FR: { ...COMMON, 'Armistice Day': 'Waffenstillstandstag', 'Bastille Day': 'Französischer Nationalfeiertag', 'Victory in Europe Day': 'Tag des Sieges in Europa' },
  AT: { ...COMMON, 'National Holiday': 'Österreichischer Nationalfeiertag' },
  CH: { ...COMMON, 'Federal Fast Monday': 'Eidgenössischer Dank-, Buß- und Bettag', 'Geneva Prayday': 'Genfer Bettag', 'Näfels procession': 'Näfelser Fahrt', 'Republic Day': 'Republiktag', 'Restoration Day': 'Restaurationstag', 'Saint Joseph\'s Day': 'Josefstag', 'St. Berchtold\'s Day': 'Berchtoldstag', 'Swiss National Day': 'Schweizer Bundesfeier' },
  IT: { ...COMMON, 'Liberation Day': 'Tag der Befreiung', 'Republic Day': 'Tag der Republik', 'St. Francis of Assisi\'s Day': 'Franziskustag' },
  ES: {
    ...COMMON,
    'Castile and León Day': 'Tag von Kastilien und León',
    'Constitution Day': 'Tag der Verfassung',
    'Day of Andalucía': 'Tag von Andalusien',
    'Day of Aragón': 'Tag von Aragón',
    'Day of Asturias': 'Tag von Asturien',
    'Day of Castilla-La Mancha': 'Tag von Kastilien-La Mancha',
    'Day of Extremadura': 'Tag der Extremadura',
    'Day of La Rioja': 'Tag von La Rioja',
    'Day of Madrid': 'Tag von Madrid',
    'Day of Murcia': 'Tag von Murcia',
    'Day of the Balearic Islands': 'Tag der Balearischen Inseln',
    'Day of the Canary Islands': 'Tag der Kanarischen Inseln',
    'Day of the Cantabrian Institutions': 'Tag der kantabrischen Institutionen',
    'Day of the Valencian Community': 'Tag der Valencianischen Gemeinschaft',
    'Feast of Our Lady of Bien Aparecida': 'Fest Unserer Lieben Frau von Bien Aparecida',
    'Galician Literature Day': 'Tag der galicischen Literatur',
    'National Day of Catalonia': 'Nationalfeiertag Kataloniens',
    'National Day of Spain': 'Spanischer Nationalfeiertag',
    'Santiago Apóstol': 'Jakobustag',
    'St. John\'s Day': 'Johannistag',
  },
  PT: { ...COMMON, 'Azores Day': 'Tag der Azoren', 'Freedom Day': 'Tag der Freiheit', 'Madeira Day': 'Tag von Madeira', 'National Day': 'Nationalfeiertag', 'Republic Day': 'Tag der Republik', 'Restoration of Independence': 'Wiederherstellung der Unabhängigkeit' },
  PL: { ...COMMON, 'Constitution Day': 'Tag der Verfassung', 'Independence Day': 'Unabhängigkeitstag' },
  CZ: { ...COMMON, 'Independent Czechoslovak State Day': 'Tag der Entstehung des selbstständigen tschechoslowakischen Staates', 'Jan Hus Day': 'Jan-Hus-Tag', 'Liberation Day': 'Tag der Befreiung', 'Saints Cyril and Methodius Day': 'Tag der Heiligen Kyrill und Method', 'St. Wenceslas Day': 'Tag des heiligen Wenzel', 'Struggle for Freedom and Democracy Day': 'Tag des Kampfes für Freiheit und Demokratie' },
  SK: { ...COMMON, 'All Saints’ Day': 'Allerheiligen', 'Day of Our Lady of the Seven Sorrows': 'Tag Unserer Lieben Frau der sieben Schmerzen', 'Day of the Establishment of the Slovak Republic': 'Tag der Gründung der Slowakischen Republik', 'Day of victory over fascism': 'Tag des Sieges über den Faschismus', 'International Workers\' Day': 'Tag der Arbeit', 'Slovak National Uprising anniversary': 'Jahrestag des Slowakischen Nationalaufstands', 'St. Cyril and Methodius Day': 'Tag der Heiligen Kyrill und Method' },
  HU: { ...COMMON, '1848 Revolution Memorial Day': 'Gedenktag der Revolution von 1848', '1956 Revolution Memorial Day': 'Gedenktag der Revolution von 1956', 'All Saints Day': 'Allerheiligen', 'State Foundation Day': 'Tag der Staatsgründung' },
  DK: { ...COMMON },
  GB: { ...COMMON, '2 January': '2. Januar', 'Battle of the Boyne': 'Schlacht am Boyne', 'Early May Bank Holiday': 'Bankfeiertag Anfang Mai', 'Saint Andrew\'s Day': 'Andreastag', 'Saint Patrick\'s Day': 'St.-Patrick-Tag', 'Spring Bank Holiday': 'Bankfeiertag im Frühling', 'Summer Bank Holiday': 'Bankfeiertag im Sommer', 'World Cup Bank Holiday': 'Bankfeiertag zur Weltmeisterschaft' },
  IE: { ...COMMON, 'August Holiday': 'Feiertag im August', 'June Holiday': 'Feiertag im Juni', 'October Holiday': 'Feiertag im Oktober', 'Saint Brigid\'s Day': 'St.-Brigid-Tag', 'Saint Patrick\'s Day': 'St.-Patrick-Tag' },
  SI: { ...COMMON, 'Day of Uprising Against Occupation': 'Tag des Aufstands gegen die Besatzung', 'Day of the Dead': 'Totengedenktag', 'Independence and Unity Day': 'Tag der Unabhängigkeit und Einheit', 'Prešeren Day': 'Prešeren-Tag', 'Reformation Day': 'Reformationstag', 'Statehood Day': 'Tag der Staatlichkeit' },
  HR: { ...COMMON, 'Anti-Fascist Struggle Day': 'Tag des antifaschistischen Kampfes', 'National Day': 'Nationalfeiertag', 'Remembrance Day': 'Gedenktag', 'Victory and Homeland Thanksgiving Day and the Day of Croatian defenders': 'Tag des Sieges und der heimatlichen Dankbarkeit sowie Tag der kroatischen Verteidiger' },
  RO: { ...COMMON, 'Children\'s Day': 'Kindertag', 'Dormition of the Theotokos': 'Mariä Entschlafung', 'National Day/Great Union': 'Nationalfeiertag / Große Vereinigung', 'Saint John the Baptist': 'Johannistag', 'St. Andrew\'s Day': 'Andreastag', 'Union Day/Small Union': 'Tag der Vereinigung / Kleine Vereinigung' },
})

export function holidayTranslationKey(countryCode, sourceName) {
  return `${countryCode || ''}\u0000${sourceName || ''}`
}

export function getHolidayDisplayNameDe(countryCode, sourceName) {
  // The nested table is deliberately addressed by the compound country/name key.
  const [keyCountryCode, keySourceName] = holidayTranslationKey(countryCode, sourceName).split('\u0000')
  return HOLIDAY_TRANSLATIONS_DE[keyCountryCode]?.[keySourceName] || null
}
