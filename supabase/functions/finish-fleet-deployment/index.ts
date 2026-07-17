import { serveOnlineRpc } from '../_shared/online-rpc.ts';

serveOnlineRpc('finish_fleet_public_deployment', (body) => ({ p_shift_id: body.shiftId }));
