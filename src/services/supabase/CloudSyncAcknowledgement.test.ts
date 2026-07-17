import { describe, expect, it } from 'vitest';
import { createNewSave } from '../storage/saveService';
import { CloudSyncAcknowledgement } from './CloudSyncAcknowledgement';

describe('confirmação assíncrona do save em nuvem', () => {
  it('preserva a revisão confirmada quando o jogo emite o próximo autosave', () => {
    const acknowledgement = new CloudSyncAcknowledgement();
    const initial = createNewSave();
    initial.revision = 20;
    initial.lastCloudRevision = 20;
    acknowledgement.merge(initial);

    acknowledgement.remember({ ...initial, revision: 21, lastCloudRevision: 21 });
    const nextAutosave = { ...initial, revision: 22, lastCloudRevision: 20 };

    expect(acknowledgement.merge(nextAutosave).lastCloudRevision).toBe(21);
  });

  it('não transporta confirmações entre linhagens diferentes', () => {
    const acknowledgement = new CloudSyncAcknowledgement();
    const first = createNewSave();
    first.lastCloudRevision = 40;
    acknowledgement.remember(first);

    const replacement = createNewSave();
    replacement.lastCloudRevision = 3;

    expect(acknowledgement.merge(replacement).lastCloudRevision).toBe(3);
  });
});
