import {Model} from '@nozbe/watermelondb';
import {date, field, readonly, text} from '@nozbe/watermelondb/decorators';
import {NOTES_TABLE} from '../schema';

export class NoteModel extends Model {
  static table = NOTES_TABLE;

  @text('title') title!: string;
  @field('content') content!: string;
  @field('color') color!: string;
  @field('pinned') pinned!: boolean;
  @field('locked') locked!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
