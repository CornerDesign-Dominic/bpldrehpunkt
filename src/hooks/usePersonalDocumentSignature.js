import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { loadCurrentUserSignature, signatureBlobToDataUrl, signatureErrorMessage } from '../lib/userSignature.js'
import { documentAssetDiagnosticCode } from '../lib/diagnosticClassification.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'

function signerName(profile) {
  return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
}

export function usePersonalDocumentSignature(setDocumentData) {
  const { profile } = useAuth()
  const [usePersonalSignature, setUsePersonalSignature] = useState(false)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [signatureMissing, setSignatureMissing] = useState(false)
  const [signatureNoticeVisible, setSignatureNoticeVisible] = useState(false)
  const [signatureNoticeMessage, setSignatureNoticeMessage] = useState('')
  const signaturePreviewUrlRef = useRef('')
  const signatureLoadRequestRef = useRef(0)

  function revokeSignaturePreview() {
    if (signaturePreviewUrlRef.current) URL.revokeObjectURL(signaturePreviewUrlRef.current)
    signaturePreviewUrlRef.current = ''
  }

  function clearPersonalSignature() {
    signatureLoadRequestRef.current += 1
    revokeSignaturePreview()
    setDocumentData((current) => ({ ...current, attachments: { ...current.attachments, signature: null } }))
  }

  useEffect(() => () => {
    signatureLoadRequestRef.current += 1
    revokeSignaturePreview()
  }, [])

  async function loadPersonalSignature() {
    const requestId = ++signatureLoadRequestRef.current
    setSignatureLoading(true)
    try {
      const blob = await loadCurrentUserSignature()
      const imageData = await signatureBlobToDataUrl(blob)
      if (requestId !== signatureLoadRequestRef.current) return false
      revokeSignaturePreview()
      const imageUrl = URL.createObjectURL(blob)
      signaturePreviewUrlRef.current = imageUrl
      setDocumentData((current) => ({
        ...current,
        attachments: {
          ...current.attachments,
          signature: { signerName: signerName(profile), imageUrl, imageData },
        },
      }))
      setSignatureMissing(false)
      return true
    } catch (error) {
      if (requestId === signatureLoadRequestRef.current) {
        const diagnostic = documentAssetDiagnosticCode(error)
        if (diagnostic) void reportTechnicalFailure({ module: 'document-templates', stage: 'personal-signature-load', code: diagnostic })
        setDocumentData((current) => ({ ...current, attachments: { ...current.attachments, signature: null } }))
        const missing = ['storage/object-not-found', 'signature/not-uploaded'].includes(error?.code)
        setSignatureMissing(missing)
        setSignatureNoticeMessage(missing
          ? 'Du hast noch keine persönliche Unterschrift hinterlegt. Bitte hinterlege deine Unterschrift zuerst unter „Mein Profil“.'
          : signatureErrorMessage(error, 'load'))
        setUsePersonalSignature(false)
      }
      return false
    } finally {
      if (requestId === signatureLoadRequestRef.current) setSignatureLoading(false)
    }
  }

  async function togglePersonalSignature(checked) {
    setUsePersonalSignature(checked)
    setSignatureNoticeVisible(false)
    setSignatureNoticeMessage('')
    setSignatureMissing(false)
    if (!checked) {
      clearPersonalSignature()
      return
    }
    const loaded = await loadPersonalSignature()
    if (!loaded) setSignatureNoticeVisible(true)
  }

  async function ensurePersonalSignature(documentData) {
    if (!usePersonalSignature) return true
    if (documentData.attachments?.signature?.imageData) return true
    if (signatureMissing) {
      setSignatureNoticeVisible(true)
      return false
    }
    const loaded = await loadPersonalSignature()
    if (!loaded) setSignatureNoticeVisible(true)
    return loaded
  }

  function resetPersonalSignature() {
    clearPersonalSignature()
    setUsePersonalSignature(false)
    setSignatureMissing(false)
    setSignatureNoticeVisible(false)
    setSignatureNoticeMessage('')
  }

  return {
    usePersonalSignature,
    signatureLoading,
    signatureNoticeVisible,
    signatureNoticeMessage,
    signatureMissing,
    togglePersonalSignature,
    ensurePersonalSignature,
    resetPersonalSignature,
  }
}
