import {appSchema, tableSchema} from '@nozbe/watermelondb';

export const NOTES_TABLE = 'notes';
export const NOTES_OBSERVABLE_COLUMNS = [
  'title',
  'content',
  'color',
  'updated_at',
  'pinned',
  'locked',
] as const;

export const databaseSchema = appSchema({
  // bumped to v3 to add `locked` column
  version: 3,
  tables: [
    tableSchema({
      name: NOTES_TABLE,
      columns: [
        {name: 'title', type: 'string', isIndexed: true},
        {name: 'content', type: 'string'},
        {name: 'color', type: 'string'},
        {name: 'pinned', type: 'boolean', isIndexed: true, isOptional: true},
        {name: 'locked', type: 'boolean', isIndexed: true, isOptional: true},
        {name: 'created_at', type: 'number', isIndexed: true},
        {name: 'updated_at', type: 'number', isIndexed: true},
      ],
    }),
  ],
});
