import { Schema, model } from 'mongoose';

const AccountBackupSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  deviceId: { type: String, required: true },
  deviceName: { type: String, required: true },
  label: { type: String, default: '' },
  kind: { type: String, enum: ['manual', 'before_restore'], default: 'manual' },
  walletCount: { type: Number, required: true },
  transactionCount: { type: Number, required: true },
  reminderCount: { type: Number, required: true },
  sizeBytes: { type: Number, required: true },
  payload: { type: Schema.Types.Mixed, required: true, select: false },
}, { timestamps: true, collection: 'accountBackups' });
AccountBackupSchema.index({ userId: 1, _id: -1 });
export const AccountBackupModel = model('AccountBackup', AccountBackupSchema);

const BackupDeviceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  deviceId: { type: String, required: true },
  backupId: { type: Schema.Types.ObjectId, required: true },
  appliedAt: { type: Date, required: true },
  preferences: { type: Schema.Types.Mixed, default: {} },
}, { collection: 'backupDevices' });
BackupDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
export const BackupDeviceModel = model('BackupDevice', BackupDeviceSchema);

const BackupActivitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  deviceId: { type: String, required: true },
  deviceName: { type: String, required: true },
  backupId: { type: Schema.Types.ObjectId, required: true },
}, { timestamps: true, collection: 'backupActivities' });
export const BackupActivityModel = model('BackupActivity', BackupActivitySchema);
