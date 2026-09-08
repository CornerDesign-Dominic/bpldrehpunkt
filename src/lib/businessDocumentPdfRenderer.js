import { BPL_FOOTER_COLUMNS, BPL_SENDER_LINE } from '../templates/bplDocumentDetails.js'
import { businessDocumentRecipientLines, formatBusinessDocumentDate } from '../templates/businessDocumentData.js'

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

export function renderBusinessDocumentPdf({ JsPdf, documentData, headerImage }) {
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
  addText(BPL_SENDER_LINE, PAGE.left, recipientTop, { bold: true, fontSize: 7.4 })
  const recipientY = recipientTop + 6.2
  const recipient = businessDocumentRecipientLines(documentData)
  recipient.forEach((line, index) => addText(line, PAGE.left, recipientY + index * 5.35))
  const documentDate = formatBusinessDocumentDate(documentData.date)
  if (documentDate) addText(documentDate, PAGE.right, recipientY, { align: 'right' })
  y = Math.max(recipientY + Math.max(recipient.length, documentDate ? 1 : 0) * 5.35, recipientY) + 17

  writeParagraph(documentData.subject.trim(), { bold: true, fontSize: 13, lineHeight: 5.7, spacingAfter: 10 })
  writeParagraph(documentData.content.trim())

  for (let index = 1; index < pages.length; index += 1) pdf.addPage('a4', 'portrait')
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    pdf.setPage(index + 1)
    pdf.addImage(headerImage, 'PNG', PAGE.left, LETTERHEAD.top, LETTERHEAD.width, LETTERHEAD.height)
    writeFooter(pdf)
    pages[index].forEach((entry) => {
      pdf.setFont('helvetica', entry.bold ? 'bold' : 'normal')
      pdf.setFontSize(entry.fontSize)
      pdf.text(entry.text, entry.x, entry.y, entry.align ? { align: entry.align } : undefined)
    })
  }
  return pdf
}
