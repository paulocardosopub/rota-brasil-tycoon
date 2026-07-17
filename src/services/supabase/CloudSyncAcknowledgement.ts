import type { PlayerSave } from '../../types/game';

/**
 * Keeps the latest cloud acknowledgement available to the in-memory game
 * snapshot. Phaser owns its save object between autosaves, while React writes
 * cloud acknowledgements back to localStorage asynchronously. Without this
 * bridge, the next Phaser autosave can overwrite that acknowledgement with an
 * older lastCloudRevision and report a conflict against its own previous
 * upload.
 */
export class CloudSyncAcknowledgement {
  private lineageId: string | null = null;
  private revision = 0;

  merge(save: PlayerSave): PlayerSave {
    if (this.lineageId !== save.cloudLineageId) {
      this.lineageId = save.cloudLineageId;
      this.revision = save.lastCloudRevision;
      return save;
    }

    this.revision = Math.max(this.revision, save.lastCloudRevision);
    return save.lastCloudRevision >= this.revision
      ? save
      : { ...save, lastCloudRevision: this.revision };
  }

  remember(save: PlayerSave) {
    if (this.lineageId !== save.cloudLineageId) {
      this.lineageId = save.cloudLineageId;
      this.revision = save.lastCloudRevision;
      return;
    }
    this.revision = Math.max(this.revision, save.lastCloudRevision);
  }
}
