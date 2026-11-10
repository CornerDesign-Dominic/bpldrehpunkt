// Templates are copied into drafts. Employee IDs, validity periods and account
// data always remain properties of the selected employee's model.
export function copyTimeTemplateSchedule(template) {
  return {
    holidayCountryCode: template.holidayCountryCode || 'DE',
    holidaySubdivisionCode: template.holidaySubdivisionCode || '',
    weekdays: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, {
      targetMinutes: template.weekdays?.[day]?.targetMinutes || 0,
      breaks: (template.weekdays?.[day]?.breaks || []).map(rule => ({ afterMinutes: rule.afterMinutes, requiredMinutes: rule.requiredMinutes })),
    }])),
  }
}
export function applyTimeTemplateToDraft(draft, template) {
  return { ...draft, ...copyTimeTemplateSchedule(template) }
}
