import { serveOnlineRpc } from '../_shared/online-rpc.ts';

serveOnlineRpc('report_player_location', (body) => ({
  p_public_session_id: body.sessionId,
  p_chunk_id: body.chunkId,
  p_region: body.region,
  p_local_x: body.localX,
  p_local_y: body.localY,
  p_layer: body.layer ?? 0,
  p_heading: body.heading ?? 0,
  p_reason: body.reason
}));
