import { serveOnlineRpc } from '../_shared/online-rpc.ts';

serveOnlineRpc('claim_vehicle_control', (body) => ({
  p_public_session_id: body.sessionId,
  p_vehicle_id: body.vehicleId,
  p_state_version: body.stateVersion
}));
