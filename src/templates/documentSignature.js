export function documentSignature(documentData) {
  const signature = documentData?.attachments?.signature
  return signature?.signerName && signature?.imageData ? signature : null
}
