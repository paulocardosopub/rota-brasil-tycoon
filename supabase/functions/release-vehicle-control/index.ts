import { serveOnlineRpc } from '../_shared/online-rpc.ts';

serveOnlineRpc('release_vehicle_control', (body) => ({
  p_public_session_id: body.sessionId,
  p_vehicle_id: body.vehicleId
}));
