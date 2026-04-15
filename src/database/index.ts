import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import {databaseMigrations} from './migrations';
import {NoteModel} from './model/NoteModel';
import {databaseSchema} from './schema';

const adapter = new SQLiteAdapter({
  dbName: 'OfflineNotesApp',
  schema: databaseSchema,
  migrations: databaseMigrations,
  jsi: false,
  onSetUpError: error => {
    console.warn('WatermelonDB failed to initialize.', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [NoteModel],
});
