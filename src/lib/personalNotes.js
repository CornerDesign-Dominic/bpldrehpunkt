import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import { personalNoteDraft } from './personalNotesPresentation.js'

export const PERSONAL_NOTES_COLLECTION = 'personalNotes'

function notesReference(userId) {
  return collection(db, 'users', userId, PERSONAL_NOTES_COLLECTION)
}

function noteRecord(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

export function watchPersonalNotes(userId, onNotes, onError) {
  return onSnapshot(query(notesReference(userId), orderBy('createdAt', 'desc')), (snapshot) => {
    onNotes(snapshot.docs.map(noteRecord))
  }, onError)
}

export async function createPersonalNote(userId, values) {
  const note = personalNoteDraft(values)
  return addDoc(notesReference(userId), {
    title: note.title,
    text: note.text,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updatePersonalNote(userId, noteId, values) {
  const note = personalNoteDraft(values)
  return updateDoc(doc(db, 'users', userId, PERSONAL_NOTES_COLLECTION, noteId), {
    title: note.title,
    text: note.text,
    updatedAt: serverTimestamp(),
  })
}
