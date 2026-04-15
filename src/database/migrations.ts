import {schemaMigrations, addColumns} from '@nozbe/watermelondb/Schema/migrations';
import {NOTES_TABLE} from './schema';

// Migrations: v1 -> v2 (pinned), v2 -> v3 (locked)
export const databaseMigrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: NOTES_TABLE,
          columns: [
            {name: 'pinned', type: 'boolean', isIndexed: true, isOptional: true},
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: NOTES_TABLE,
          columns: [
            {name: 'locked', type: 'boolean', isIndexed: true, isOptional: true},
          ],
        }),
      ],
    },
  ],
});
