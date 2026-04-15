import type {NetInfoState} from '@react-native-community/netinfo';
import {Database, Q} from '@nozbe/watermelondb';
import {NoteModel} from '../database/model/NoteModel';
import {NOTES_TABLE} from '../database/schema';
import {
  collection,
  doc,
  getDocs,
  getFirestoreInstance,
  writeBatch,
} from './firebaseClient';

type FirestoreNoteRecord = {
  title?: unknown;
  content?: unknown;
  color?: unknown;
  pinned?: unknown;
  locked?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type NoteSnapshot = {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
};

let unsubscribeNetInfo: (() => void) | null = null;
let currentUserId: string | null = null;
let NetInfo:
  | {addEventListener: (listener: (state: NetInfoState) => void) => () => void}
  | false
  | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncRunning = false;
let syncQueued = false;

const loadNetInfo = () => {
  if (NetInfo !== null) {
    return;
  }

  try {
    NetInfo = require('@react-native-community/netinfo').default;
  } catch (error) {
    console.warn(
      'NetInfo not available; sync will not auto-trigger on reconnect.',
      error,
    );
    NetInfo = false;
  }
};

const normalizeRemoteNote = (
  id: string,
  data: FirestoreNoteRecord,
): NoteSnapshot => ({
  id,
  title: typeof data.title === 'string' ? data.title : '',
  content: typeof data.content === 'string' ? data.content : '',
  color: typeof data.color === 'string' ? data.color : '#9D8FE8',
  pinned: Boolean(data.pinned),
  locked: Boolean(data.locked),
  createdAt: typeof data.created_at === 'number' ? data.created_at : Date.now(),
  updatedAt: typeof data.updated_at === 'number' ? data.updated_at : Date.now(),
});

const serializeLocalNote = (note: NoteModel): NoteSnapshot => ({
  id: note.id,
  title: note.title,
  content: note.content,
  color: note.color,
  pinned: Boolean(note.pinned),
  locked: Boolean(note.locked),
  createdAt: note.createdAt?.getTime?.() ?? Date.now(),
  updatedAt: note.updatedAt?.getTime?.() ?? Date.now(),
});

const fetchRemoteNotes = async (userId: string) => {
  const firestore = getFirestoreInstance();
  const notesCollection = collection(firestore, 'users', userId, 'notes');
  const snapshot = await getDocs(notesCollection);
  const remoteNotes = new Map<string, NoteSnapshot>();

  snapshot.forEach((docSnap: {id: string; data: () => FirestoreNoteRecord}) => {
    remoteNotes.set(
      docSnap.id,
      normalizeRemoteNote(docSnap.id, docSnap.data()),
    );
  });

  return {firestore, notesCollection, remoteNotes};
};

const applyRemoteChanges = async (
  database: Database,
  remoteNotes: Map<string, NoteSnapshot>,
) => {
  const collectionRef = database.get<NoteModel>(NOTES_TABLE);
  const localNotes = await collectionRef.query().fetch();
  const localById = new Map(localNotes.map(note => [note.id, note]));

  await database.write(async () => {
    const creates = [];

    for (const remoteNote of remoteNotes.values()) {
      const localNote = localById.get(remoteNote.id);

      if (!localNote) {
        creates.push(
          collectionRef.prepareCreateFromDirtyRaw({
            id: remoteNote.id,
            title: remoteNote.title,
            content: remoteNote.content,
            color: remoteNote.color,
            pinned: remoteNote.pinned,
            locked: remoteNote.locked,
            created_at: remoteNote.createdAt,
            updated_at: remoteNote.updatedAt,
            _status: 'synced',
            _changed: '',
          }),
        );
        continue;
      }

      const localUpdatedAt = localNote.updatedAt?.getTime?.() ?? 0;
      if (remoteNote.updatedAt <= localUpdatedAt) {
        continue;
      }

      await localNote.update(record => {
        record.title = remoteNote.title;
        record.content = remoteNote.content;
        record.color = remoteNote.color;
        record.pinned = remoteNote.pinned;
        record.locked = remoteNote.locked;
      });
    }

    if (creates.length > 0) {
      await database.batch(...creates);
    }
  });
};

const pushLocalChanges = async (
  database: Database,
  userId: string,
  remoteNotes: Map<string, NoteSnapshot>,
  firestore: unknown,
  notesCollection: unknown,
) => {
  const localCollection = database.get<NoteModel>(NOTES_TABLE);
  const localNotes = await localCollection
    .query(Q.sortBy('updated_at', Q.desc))
    .fetch();
  const localSnapshots = localNotes.map(serializeLocalNote);
  const localIds = new Set(localSnapshots.map(note => note.id));
  const batch = writeBatch(firestore);
  let hasWrites = false;

  for (const localNote of localSnapshots) {
    const remoteNote = remoteNotes.get(localNote.id);
    if (remoteNote && remoteNote.updatedAt > localNote.updatedAt) {
      continue;
    }

    batch.set(
      doc(notesCollection, localNote.id),
      {
        title: localNote.title,
        content: localNote.content,
        color: localNote.color,
        pinned: localNote.pinned,
        locked: localNote.locked,
        created_at: localNote.createdAt,
        updated_at: localNote.updatedAt,
      },
      {merge: true},
    );
    hasWrites = true;
  }

  for (const remoteId of remoteNotes.keys()) {
    if (localIds.has(remoteId)) {
      continue;
    }

    batch.delete(doc(notesCollection, remoteId));
    hasWrites = true;
  }

  if (hasWrites) {
    await batch.commit();
  }
};

const runSync = async (database: Database) => {
  if (!currentUserId) {
    return;
  }

  if (isSyncRunning) {
    syncQueued = true;
    return;
  }

  isSyncRunning = true;

  try {
    const {firestore, notesCollection, remoteNotes} = await fetchRemoteNotes(
      currentUserId,
    );
    await applyRemoteChanges(database, remoteNotes);
    await pushLocalChanges(
      database,
      currentUserId,
      remoteNotes,
      firestore,
      notesCollection,
    );
  } catch (error) {
    console.warn('Sync failed.', error);
  } finally {
    isSyncRunning = false;

    if (syncQueued) {
      syncQueued = false;
      await runSync(database);
    }
  }
};

export const scheduleSync = (database: Database, delayMs = 750) => {
  if (!currentUserId) {
    return;
  }

  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    syncTimer = null;
    runSync(database).catch(error => {
      console.warn('Scheduled sync failed.', error);
    });
  }, delayMs);
};

export const startSyncEngine = (database: Database) => {
  if (unsubscribeNetInfo) {
    return;
  }

  loadNetInfo();
  if (!NetInfo) {
    return;
  }

  unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
    if (!currentUserId) {
      return;
    }

    if (state.isConnected && state.isInternetReachable !== false) {
      runSync(database).catch(error => {
        console.warn('Reconnect sync failed.', error);
      });
    }
  });
};

export const stopSyncEngine = () => {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
};

export const enableSyncForUser = async (database: Database, userId: string) => {
  currentUserId = userId;
  startSyncEngine(database);
  await runSync(database);
};

export const disableSync = () => {
  currentUserId = null;
  stopSyncEngine();
};
