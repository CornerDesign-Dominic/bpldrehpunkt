import letterheadImage from '../assets/documents/bpl-letterhead.png'
import { renderBusinessDocumentPdf } from './businessDocumentPdfRenderer.js'

async function imageData(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Der BPL-Briefkopf konnte nicht geladen werden.')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Der BPL-Briefkopf konnte nicht verarbeitet werden.'))
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

export async function downloadBusinessDocumentPdf(documentData, fileName) {
  const [{ jsPDF }, headerImage] = await Promise.all([import('jspdf'), imageData(letterheadImage)])
  renderBusinessDocumentPdf({ JsPdf: jsPDF, documentData, headerImage }).save(fileName)
}
