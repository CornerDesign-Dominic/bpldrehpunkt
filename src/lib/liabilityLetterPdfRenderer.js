import { BPL_FOOTER_COLUMNS, BPL_SENDER_LINE } from '../templates/bplDocumentDetails.js'
import { formatDocumentDate, getLiabilitySubject } from '../templates/liabilityDocumentData.js'
import { formatLiabilityAddressLine, liabilityRecipientLines, liabilitySignature, LIABILITY_LETTER_TEXT } from '../templates/liabilityLetterContent.js'

const PAGE = { left: 19, right: 191, footerLeft: 16, footerRight: 194 }
const LETTERHEAD = { top: 8, width: 172, height: 33.75 }
const BODY_FONT_SIZE = 10.3
const BODY_LINE_HEIGHT = 5.45
const CONTENT_BOTTOM = 257

function writeFooter(pdf) {
  const footerTop = 263
  const columns = [16, 50, 96, 141]
  pdf.setDrawColor(170)
  pdf.setLineWidth(0.2)
  pdf.line(PAGE.footerLeft, footerTop, PAGE.footerRight, footerTop)
  BPL_FOOTER_COLUMNS.forEach((column, columnIndex) => {
    let y = footerTop + 4.1
    column.forEach((line) => {
      pdf.setFont('helvetica', line.bold ? 'bold' : 'normal')
      pdf.setFontSize(line.text.startsWith('IBAN:') ? 6.85 : 7.15)
      pdf.text(line.text, columns[columnIndex], y)
      y += 3.35
    })
  })
}

function writeLetterhead(pdf, headerImage) {
  pdf.addImage(headerImage, 'PNG', PAGE.left, LETTERHEAD.top, LETTERHEAD.width, LETTERHEAD.height)
  writeFooter(pdf)
}

export function renderLiabilityLetterPdf({ JsPdf, documentData, headerImage }) {
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

  function addSignatureImage(imageData, { width, height } = signatureImageDimensions(imageData)) {
    if (y + height > CONTENT_BOTTOM) newPage()
    pages[pageIndex].push({ type: 'image', imageData, x: PAGE.left, y, width, height })
    y += height
  }

  function writeParagraph(text, { bold = false, fontSize = BODY_FONT_SIZE, lineHeight = BODY_LINE_HEIGHT, spacingAfter = 0 } = {}) {
    layoutPdf.setFont('helvetica', bold ? 'bold' : 'normal')
    layoutPdf.setFontSize(fontSize)
    for (const line of layoutPdf.splitTextToSize(text, PAGE.right - PAGE.left)) {
      if (y + lineHeight > CONTENT_BOTTOM) {
        newPage()
      }
      addText(line, PAGE.left, y, { bold, fontSize })
      y += lineHeight
    }
    y += spacingAfter
  }

  const recipientTop = LETTERHEAD.top + LETTERHEAD.height + 6
  addText(BPL_SENDER_LINE, PAGE.left, recipientTop, { bold: true, fontSize: 7.4 })
  const recipientY = recipientTop + 6.2
  const recipient = liabilityRecipientLines(documentData)
  recipient.forEach((line, index) => addText(line, PAGE.left, recipientY + index * 5.35))
  const documentDate = formatDocumentDate(documentData.date)
  if (documentDate) addText(documentDate, PAGE.right, recipientY, { align: 'right' })
  y = Math.max(recipientY + Math.max(recipient.length, documentDate ? 1 : 0) * 5.35, recipientY) + 17

  writeParagraph(getLiabilitySubject(documentData.orderNumber), { bold: true, fontSize: 13, lineHeight: 5.7, spacingAfter: 10 })
  writeParagraph(LIABILITY_LETTER_TEXT.salutation, { spacingAfter: 5.4 })
  writeParagraph(LIABILITY_LETTER_TEXT.introduction, { spacingAfter: 8 })
  const loadingHeading = [formatDocumentDate(documentData.loadingDate), 'Erste Ladestelle:'].filter(Boolean).join(' ')
  const loadingAddress = formatLiabilityAddressLine({ company: documentData.loadingCompany, street: documentData.loadingStreet, zip: documentData.loadingZip, city: documentData.loadingCity, country: documentData.loadingCountry })
  const unloadingHeading = [formatDocumentDate(documentData.unloadingDate), 'Letzte Entladestelle:'].filter(Boolean).join(' ')
  const unloadingAddress = formatLiabilityAddressLine({ company: documentData.unloadingCompany, street: documentData.unloadingStreet, zip: documentData.unloadingZip, city: documentData.unloadingCity, country: documentData.unloadingCountry })
  writeParagraph([loadingHeading, loadingAddress].filter(Boolean).join('\n'), { spacingAfter: 5.4 })
  writeParagraph([unloadingHeading, unloadingAddress].filter(Boolean).join('\n'), { spacingAfter: 8 })
  if (documentData.incidentText?.trim()) writeParagraph(documentData.incidentText, { spacingAfter: 5.4 })
  writeParagraph(LIABILITY_LETTER_TEXT.reservation, { spacingAfter: 5.4 })
  writeParagraph(LIABILITY_LETTER_TEXT.insuranceNotice, { spacingAfter: 5.4 })
  writeParagraph(LIABILITY_LETTER_TEXT.closing, { spacingAfter: 12 })
  const personalSignature = liabilitySignature(documentData)
  if (personalSignature) {
    const signatureDimensions = signatureImageDimensions(personalSignature.imageData)
    if (y + BODY_LINE_HEIGHT + 2.5 + signatureDimensions.height > CONTENT_BOTTOM) newPage()
    writeParagraph(personalSignature.signerName, { bold: true, spacingAfter: 2.5 })
    addSignatureImage(personalSignature.imageData, signatureDimensions)
  } else {
    writeParagraph(LIABILITY_LETTER_TEXT.company, { bold: true })
  }

  for (let index = 1; index < pages.length; index += 1) pdf.addPage('a4', 'portrait')
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index]
    pdf.setPage(index + 1)
    writeLetterhead(pdf, headerImage)
    page.forEach((entry) => {
      if (entry.type === 'image') {
        pdf.addImage(entry.imageData, 'JPEG', entry.x, entry.y, entry.width, entry.height)
        return
      }
      pdf.setFont('helvetica', entry.bold ? 'bold' : 'normal')
      pdf.setFontSize(entry.fontSize)
      pdf.text(entry.text, entry.x, entry.y, entry.align ? { align: entry.align } : undefined)
    })
  }
  return pdf
}
