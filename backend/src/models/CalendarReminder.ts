import { Schema, model } from 'mongoose';

const CalendarReminderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  note: { type: String, trim: true, maxlength: 500 },
  dateKey: { type: String, required: true, index: true },
  time: { type: String, trim: true, maxlength: 5 },
  kind: { type: String, enum: ['reminder', 'payment', 'income'], default: 'reminder' },
  status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
  repeat: { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'], default: 'none' },
  channels: { type: [String], default: ['in_app'] },
}, { timestamps: true, collection: 'calendarReminders' });

CalendarReminderSchema.index({ userId: 1, dateKey: 1 });
export const CalendarReminderModel = model('CalendarReminder', CalendarReminderSchema);
