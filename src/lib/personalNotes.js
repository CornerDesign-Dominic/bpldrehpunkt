import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from './firebase.js'
import { personalNoteDraft } from './personalNotesPresentation.js'

export const PERSONAL_NOTES_COLLECTION = 'personalNotes'

function notesReference(userId) {
  return collection(db, 'users', userId, PERSONAL_NOTES_COLLECTION)
}

function noteRecord(snapshot) {
  const data = snapshot.data()
  return { id: snapshot.id, ...data, importance: data.importance === 'high' ? 'high' : 'low', urgency: data.urgency === 'high' ? 'high' : 'low' }
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
    importance: note.importance,
    urgency: note.urgency,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updatePersonalNote(userId, noteId, values) {
  const note = personalNoteDraft(values)
  return updateDoc(doc(db, 'users', userId, PERSONAL_NOTES_COLLECTION, noteId), {
    title: note.title,
    text: note.text,
    importance: note.importance,
    urgency: note.urgency,
    updatedAt: serverTimestamp(),
  })
}

export async function deletePersonalNote(userId, noteId) {
  return deleteDoc(doc(db, 'users', userId, PERSONAL_NOTES_COLLECTION, noteId))
}
