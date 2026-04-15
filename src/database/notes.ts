import {Database, Q} from '@nozbe/watermelondb';
import {NoteModel} from './model/NoteModel';
import {scheduleSync} from '../sync/syncEngine';
import {NOTES_OBSERVABLE_COLUMNS, NOTES_TABLE} from './schema';

export interface NoteDraft {
  id?: string;
  title: string;
  content: string;
  color: string;
  pinned?: boolean;
  locked?: boolean;
}

export const notesCollection = (database: Database) =>
  database.get<NoteModel>(NOTES_TABLE);

export const notesQuery = (database: Database) =>
  notesCollection(database).query(Q.sortBy('updated_at', Q.desc));

export const observeNotes = (database: Database) =>
  notesQuery(database).observeWithColumns([...NOTES_OBSERVABLE_COLUMNS]);

export const getNoteById = (database: Database, noteId: string) =>
  notesCollection(database).find(noteId);

export const hasAnyNotes = async (database: Database): Promise<boolean> => {
  const count = await notesCollection(database).query().fetchCount();
  return count > 0;
};

const triggerWidgetRefresh = () => {
};

export const saveNote = async (
  database: Database,
  note: NoteDraft,
): Promise<NoteModel> => {
  const collection = notesCollection(database);

  const saved = await database.write(async () => {
    if (note.id) {
      const existing = await collection.find(note.id);

      return existing.update(record => {
        record.title = note.title;
        record.content = note.content;
        record.color = note.color;
        record.pinned = note.pinned ?? false;
        record.locked = note.locked ?? false;
      });
    }

    return collection.create(record => {
      record.title = note.title;
      record.content = note.content;
      record.color = note.color;
      record.pinned = note.pinned ?? false;
      record.locked = note.locked ?? false;
    });
  });

  triggerWidgetRefresh();
  scheduleSync(database);
  return saved;
};

export const deleteNoteById = async (
  database: Database,
  noteId: string,
): Promise<void> => {
  const collection = notesCollection(database);

  await database.write(async () => {
    const existing = await collection.find(noteId);
    await existing.destroyPermanently();
  });

  triggerWidgetRefresh();
  scheduleSync(database);
};
