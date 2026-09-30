const replacementCharacter = '\uFFFD'

/**
 * DyCoS exports are commonly Windows-1252 while browser File.text() always
 * assumes UTF-8. Decode UTF-8 first and fall back only when it is invalid, so
 * genuine UTF-8 files remain untouched.
 */
export function decodeCsvBytes(bytes) {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes(replacementCharacter) ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

export async function readCsvFile(file) {
  if (!file?.arrayBuffer) throw new Error('Die CSV-Datei konnte nicht gelesen werden.')
  return decodeCsvBytes(new Uint8Array(await file.arrayBuffer()))
}
