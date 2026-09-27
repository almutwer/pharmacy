import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SQLiteService } from './database';

export class BackupService {
  constructor(private readonly db: SQLiteService) {}

  createBackup(type: 'auto' | 'manual' | 'usb' | 'cloud' | 'restore' = 'manual', destinationDir?: string, username = 'admin'): string {
    this.db.persist();
    const destDir = destinationDir || this.db.backupDir;
    fs.mkdirSync(destDir, { recursive: true });
    const stamp = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').slice(0, 19);
    const destPath = path.join(destDir, `pharmacy_${stamp}.db`);
    fs.copyFileSync(this.db.dbPath, destPath);
    const size = fs.statSync(destPath).size;
    const checksum = sha256(destPath);
    this.db.transaction(username, 'backup', () => {
      this.db.run(
        `INSERT INTO backup_history (backup_type, backup_file_name, backup_path, database_size_bytes, checksum, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'success', ?)`,
        [type, path.basename(destPath), destPath, size, checksum, username],
      );
    });
    return destPath;
  }

  copyLatestToUsb(destinationDir: string, username = 'admin'): string {
    const backups = this.listBackups();
    const source = backups.length ? String(backups[0].backup_path) : this.createBackup('manual', undefined, username);
    fs.mkdirSync(destinationDir, { recursive: true });
    const destPath = path.join(destinationDir, path.basename(source));
    fs.copyFileSync(source, destPath);
    const size = fs.statSync(destPath).size;
    const checksum = sha256(destPath);
    this.db.transaction(username, 'usb_backup', () => {
      this.db.run(
        `INSERT INTO backup_history (backup_type, backup_file_name, backup_path, database_size_bytes, checksum, status, created_by)
         VALUES ('usb', ?, ?, ?, ?, 'success', ?)`,
        [path.basename(destPath), destPath, size, checksum, username],
      );
    });
    return destPath;
  }

  listBackups(): Record<string, unknown>[] {
    return this.db.all(`SELECT * FROM backup_history WHERE status = 'success' AND is_active = 1 ORDER BY backup_date DESC`);
  }

  daysSinceLastBackup(): number | null {
    const row = this.db.one<{ backup_date: string }>(
      `SELECT backup_date FROM backup_history
       WHERE status='success' AND backup_type IN ('auto','manual','usb')
       ORDER BY backup_date DESC LIMIT 1`,
    );
    if (!row) return null;
    const last = new Date(String(row.backup_date).replace(' ', 'T'));
    return Math.floor((Date.now() - last.getTime()) / (24 * 60 * 60 * 1000));
  }

  needsWarning(warningDays = 3): boolean {
    const days = this.daysSinceLastBackup();
    return days === null || days >= warningDays;
  }
}

function sha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}
