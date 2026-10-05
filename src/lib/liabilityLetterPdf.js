import letterheadImage from '../assets/documents/bpl-letterhead.png'
import { renderLiabilityLetterPdf } from './liabilityLetterPdfRenderer.js'

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

async function createLiabilityLetterPdf(documentData, company) {
  const [{ jsPDF }, headerImage] = await Promise.all([import('jspdf'), imageData(letterheadImage)])
  return renderLiabilityLetterPdf({ JsPdf: jsPDF, documentData, headerImage, company })
}

export async function downloadLiabilityLetterPdf(documentData, fileName, company) {
  const pdf = await createLiabilityLetterPdf(documentData, company)
  pdf.save(fileName)
}

export async function printLiabilityLetterPdf(documentData, company) {
  const pdf = await createLiabilityLetterPdf(documentData, company)
  pdf.autoPrint()
  const objectUrl = URL.createObjectURL(pdf.output('blob'))
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0;pointer-events:none;'
  document.body.append(frame)
  frame.src = objectUrl
  window.setTimeout(() => {
    frame.remove()
    URL.revokeObjectURL(objectUrl)
  }, 60_000)
}
