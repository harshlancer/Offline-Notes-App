import AsyncStorage from '@react-native-async-storage/async-storage';
import {Database} from '@nozbe/watermelondb';
import {NOTE_COLORS} from '../theme/colors';
import {hasAnyNotes, notesCollection} from './notes';

const LEGACY_STORAGE_KEY = '@notesapp_v1';
const LEGACY_IMPORT_FLAG = 'legacy_notes_imported_v1';

interface LegacyNote {
  id?: unknown;
  title?: unknown;
  content?: unknown;
  color?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const normalizeString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const normalizeTimestamp = (
  value: unknown,
  fallback: number = Date.now(),
): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizeId = (
  value: unknown,
  usedIds: Set<string>,
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const nextValue = value.trim();

  if (!nextValue || usedIds.has(nextValue)) {
    return undefined;
  }

  usedIds.add(nextValue);
  return nextValue;
};

export const migrateLegacyNotes = async (database: Database): Promise<void> => {
  const alreadyImported = await database.localStorage.get(LEGACY_IMPORT_FLAG);

  if (alreadyImported === 'true') {
    return;
  }

  if (await hasAnyNotes(database)) {
    await database.localStorage.set(LEGACY_IMPORT_FLAG, 'true');
    return;
  }

  const rawLegacyNotes = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);

  if (!rawLegacyNotes) {
    await database.localStorage.set(LEGACY_IMPORT_FLAG, 'true');
    return;
  }

  let parsedLegacyNotes: unknown;

  try {
    parsedLegacyNotes = JSON.parse(rawLegacyNotes);
  } catch {
    await database.localStorage.set(LEGACY_IMPORT_FLAG, 'true');
    return;
  }

  if (!Array.isArray(parsedLegacyNotes) || parsedLegacyNotes.length === 0) {
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    await database.localStorage.set(LEGACY_IMPORT_FLAG, 'true');
    return;
  }

  const legacyNotes = parsedLegacyNotes as LegacyNote[];
  const usedIds = new Set<string>();
  const collection = notesCollection(database);

  await database.write(async () => {
    const preparedNotes = legacyNotes.map((legacyNote, index) => {
      const fallbackTimestamp = Date.now() - index;
      const note =
        legacyNote && typeof legacyNote === 'object'
          ? (legacyNote as LegacyNote)
          : {};

      return collection.prepareCreateFromDirtyRaw({
        id: normalizeId(note.id, usedIds),
        title: normalizeString(note.title),
        content: normalizeString(note.content),
        color: normalizeString(note.color, NOTE_COLORS[0]),
        pinned: false,
        locked: false,
        created_at: normalizeTimestamp(note.createdAt, fallbackTimestamp),
        updated_at: normalizeTimestamp(note.updatedAt, fallbackTimestamp),
        _status: 'synced',
        _changed: '',
      });
    });

    await database.batch(...preparedNotes);
  });

  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
  await database.localStorage.set(LEGACY_IMPORT_FLAG, 'true');
};
