async function waitForDocumentAssets(element) {
  await document.fonts?.ready
  await Promise.all([...element.querySelectorAll('img')].map(async (image) => {
    if (!image.complete) await new Promise((resolve) => image.addEventListener('load', resolve, { once: true }))
    await image.decode?.().catch(() => {})
  }))
}

export async function downloadDocumentShellPdf(element, fileName) {
  if (!element) throw new Error('Die Dokumentansicht ist nicht verfügbar.')
  await waitForDocumentAssets(element)
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  const canvas = await html2canvas(element, { backgroundColor: '#ffffff', logging: false, scale: 2, useCORS: true })
  const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  pdf.save(fileName)
}

export function documentPdfFileName(documentName, reference) {
  const safeReference = reference?.trim().replace(/[\\/:*?"<>|]/g, '-') || 'ohne-Auftragsnummer'
  return `${documentName}_${safeReference}.pdf`
}
