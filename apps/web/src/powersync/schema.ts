import { column, Schema, Table } from '@powersync/web';

const documents = new Table({
  id: column.text,
  name: column.text,
  status: column.text,
  created_at: column.text,
  specialist_id: column.text,
});

const messages = new Table({
  id: column.text,
  role: column.text,
  content: column.text,
  specialist_id: column.text,
  created_at: column.text,
});

const specialists = new Table({
  id: column.text,
  name: column.text,
  icon: column.text,
  description: column.text,
});

export const AppSchema = new Schema({
  documents,
  messages,
  specialists,
});

export type Database = (typeof AppSchema)['types'];
