import { serveOnlineRpc } from '../_shared/online-rpc.ts';

serveOnlineRpc('online_session_heartbeat', (body) => ({
  p_public_session_id: body.sessionId,
  p_vehicle_id: body.vehicleId,
  p_chunk_id: body.chunkId,
  p_authorized_chunks: body.authorizedChunks,
  p_state_version: body.stateVersion
}));
