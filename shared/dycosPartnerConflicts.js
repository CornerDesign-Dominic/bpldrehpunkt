const at = (data, path) => path.split('.').reduce((value, key) => value?.[key], data)
const valueKey = value => JSON.stringify(value == null || value === '' ? null : value)
const same = (a, b) => valueKey(a) === valueKey(b)
export const dycosConflictKey = entry => entry.contactId ? `${entry.contactId}:${entry.path.split('.').at(-1)}` : entry.path

export function retainedDycosResolutions(partner) {
  // Partial source responses must not erase an explicit rejection. Keep one
  // decision per field/contact; value matching below still detects new data.
  const contacts = partner?.contacts || []
  const retained = (partner?.dycosImport?.resolutions || []).filter(item => !item.contactId || contacts.some(contact => contact.id === item.contactId))
  return [...new Map(retained.map(item => [dycosConflictKey(item), item])).values()]
}

// Resolve contact indexes through their stable identity before displaying or
// applying a stored comparison. Older comparisons without that identity are
// displayable, but require another source fetch before accepting contact data.
export function dycosConflictRows(partner, conflicts = partner?.dycosImport?.conflicts || [], resolutions = partner?.dycosImport?.resolutions || []) {
  return conflicts.flatMap(entry => {
    let path = entry.path, resolvable = entry.resolvable !== false
    const contact = /^contacts\.(\d+)\.(name|department|departmentOther|phone|mobile)$/.exec(path)
    if (contact) {
      if (entry.contactId) {
        const index = (partner.contacts || []).findIndex(row => row.id === entry.contactId)
        if (index < 0) return []
        path = `contacts.${index}.${contact[2]}`
      } else resolvable = false
    }
    const currentValue = path === 'paymentTermDays' && !partner.paymentTermDays ? partner.paymentTermsOriginal ?? null : at(partner, path) ?? null
    if (same(currentValue, entry.incomingValue)) return []
    const row = { path, label: entry.label, currentValue, incomingValue: entry.incomingValue, resolvable, ...(entry.contactId ? { contactId: entry.contactId } : {}) }
    const kept = resolutions.some(item => item.decision === 'keep' && dycosConflictKey(item) === dycosConflictKey(entry) && same(item.currentValue, currentValue) && same(item.incomingValue, entry.incomingValue))
    return kept ? [] : [row]
  })
}
