export function documentPdfFileName(documentName, reference) {
  const safeReference = reference?.trim().replace(/[\\/:*?"<>|]/g, '-') || 'ohne-Auftragsnummer'
  return `${documentName}_${safeReference}.pdf`
}
