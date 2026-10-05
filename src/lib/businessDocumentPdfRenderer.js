import { companyFooterColumns, companySenderLine, DEFAULT_COMPANY_DATA } from './companyDataModel.js'
import { businessDocumentRecipientLines, formatBusinessDocumentDate } from '../templates/businessDocumentData.js'
import { documentSignature } from '../templates/documentSignature.js'

const PAGE = { left: 19, right: 191, footerLeft: 16, footerRight: 194 }
const LETTERHEAD = { top: 8, width: 172, height: 33.75 }
const BODY_FONT_SIZE = 10.3
const BODY_LINE_HEIGHT = 5.45
const CONTENT_BOTTOM = 260

function writeFooter(pdf, company, pageNumber, pageCount) {
  // Matches the fixed bottom spacing of the browser preview. The former
  // position left an unnecessarily large gap below the generated PDF footer.
  const footerTop = 270
  const columns = [16, 50, 96, 141]
  pdf.setDrawColor(170)
  pdf.setLineWidth(0.2)
  pdf.line(PAGE.footerLeft, footerTop, PAGE.footerRight, footerTop)
  companyFooterColumns(company).forEach((column, columnIndex) => {
    let y = footerTop + 4.1
    column.forEach((line) => {
      pdf.setFont('helvetica', line.bold ? 'bold' : 'normal')
      pdf.setFontSize(line.text.startsWith('IBAN:') ? 6.85 : 7.15)
      pdf.text(line.text, columns[columnIndex], y)
      y += 3.35
    })
  })
  if (pageCount > 1) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.text(`Seite ${pageNumber}/${pageCount}`, 105, 290, { align: 'center' })
  }
}

export function renderBusinessDocumentPdf({ JsPdf, documentData, headerImage, company }) {
  const layoutPdf = new JsPdf({ format: 'a4', orientation: 'portrait', unit: 'mm' })
  const pdf = new JsPdf({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' })
  const pages = [[]]
  let pageIndex = 0
  let y = LETTERHEAD.top + LETTERHEAD.height + 10

  function newPage() {
    pages.push([])
    pageIndex += 1
    y = LETTERHEAD.top + LETTERHEAD.height + 10
  }

  function addText(text, x, textY, { bold = false, fontSize = BODY_FONT_SIZE, align } = {}) {
    pages[pageIndex].push({ text, x, y: textY, bold, fontSize, align })
  }

  function signatureImageDimensions(imageData) {
    let width = 46
    let height = 16
    try {
      const image = layoutPdf.getImageProperties(imageData)
      const scale = Math.min(width / image.width, 14 / image.height)
      width = image.width * scale
      height = image.height * scale
    } catch {
      // The browser has already displayed the authenticated JPEG preview.
      // Keep a conservative fallback size if a PDF reader cannot inspect it.
    }
    return { width, height }
  }

  function stampImageDimensions(imageData) {
    let width = 40
    let height = 20
    try {
      const image = layoutPdf.getImageProperties(imageData)
      const scale = Math.min(width / image.width, height / image.height)
      width = image.width * scale
      height = image.height * scale
    } catch { /* Keep bounded fallback. */ }
    return { width, height }
  }

  function writeParagraph(text, { bold = false, fontSize = BODY_FONT_SIZE, lineHeight = BODY_LINE_HEIGHT, spacingAfter = 0 } = {}) {
    if (!text) return
    layoutPdf.setFont('helvetica', bold ? 'bold' : 'normal')
    layoutPdf.setFontSize(fontSize)
    for (const line of layoutPdf.splitTextToSize(text, PAGE.right - PAGE.left)) {
      if (y + lineHeight > CONTENT_BOTTOM) newPage()
      addText(line, PAGE.left, y, { bold, fontSize })
      y += lineHeight
    }
    y += spacingAfter
  }

  const recipientTop = LETTERHEAD.top + LETTERHEAD.height + 6
  addText(companySenderLine(company), PAGE.left, recipientTop, { bold: true, fontSize: 7.4 })
  const recipientY = recipientTop + 6.2
  const recipient = businessDocumentRecipientLines(documentData)
  recipient.forEach((line, index) => addText(line, PAGE.left, recipientY + index * 5.35))
  const documentDate = formatBusinessDocumentDate(documentData.date)
  if (documentDate) addText(documentDate, PAGE.right, recipientY, { align: 'right' })
  y = Math.max(recipientY + Math.max(recipient.length, documentDate ? 1 : 0) * 5.35, recipientY) + 17

  writeParagraph(documentData.subject.trim(), { bold: true, fontSize: 13, lineHeight: 5.7, spacingAfter: 10 })
  writeParagraph(documentData.content.trim(), { spacingAfter: 12 })
  const personalSignature = documentSignature(documentData)
  const stamp = documentData.attachments?.stamp?.imageData
  if (personalSignature) {
    const signatureDimensions = signatureImageDimensions(personalSignature.imageData)
    const stampDimensions = stamp ? stampImageDimensions(stamp) : null
    const imageHeight = Math.max(signatureDimensions.height, stampDimensions?.height || 0)
    if (y + BODY_LINE_HEIGHT + 2.5 + imageHeight > CONTENT_BOTTOM) newPage()
    writeParagraph(personalSignature.signerName, { bold: true, spacingAfter: 2.5 })
    const imageY = y
    pages[pageIndex].push({ type: 'image', imageData: personalSignature.imageData, x: PAGE.left, y: imageY, ...signatureDimensions })
    if (stampDimensions) pages[pageIndex].push({ type: 'image', imageData: stamp, format: stamp.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', x: PAGE.left + signatureDimensions.width + 9, y: imageY, ...stampDimensions })
    y += imageHeight
  } else {
    writeParagraph(company.legalName, { bold: true })
    if (stamp) {
      const stampDimensions = stampImageDimensions(stamp)
      y += 3
      if (y + stampDimensions.height > CONTENT_BOTTOM) newPage()
      pages[pageIndex].push({ type: 'image', imageData: stamp, format: stamp.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', x: PAGE.left, y, ...stampDimensions })
      y += stampDimensions.height
    }
  }

  for (let index = 1; index < pages.length; index += 1) pdf.addPage('a4', 'portrait')
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    pdf.setPage(index + 1)
    if (company.legalName === DEFAULT_COMPANY_DATA.legalName) pdf.addImage(headerImage, 'PNG', PAGE.left, LETTERHEAD.top, LETTERHEAD.width, LETTERHEAD.height)
    else {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(company.legalName.length > 60 ? 11 : 18)
      pdf.text(pdf.splitTextToSize(company.legalName, LETTERHEAD.width), PAGE.left, LETTERHEAD.top + 15)
      pdf.setDrawColor(80); pdf.line(PAGE.left, LETTERHEAD.top + LETTERHEAD.height, PAGE.right, LETTERHEAD.top + LETTERHEAD.height)
    }
    writeFooter(pdf, company, index + 1, pages.length)
    pages[index].forEach((entry) => {
      if (entry.type === 'image') {
        pdf.addImage(entry.imageData, entry.format || 'JPEG', entry.x, entry.y, entry.width, entry.height)
        return
      }
      pdf.setFont('helvetica', entry.bold ? 'bold' : 'normal')
      pdf.setFontSize(entry.fontSize)
      pdf.text(entry.text, entry.x, entry.y, entry.align ? { align: entry.align } : undefined)
    })
  }
  return pdf
}
