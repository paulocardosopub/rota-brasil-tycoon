import { serveOnlineRpc } from '../_shared/online-rpc.ts';

serveOnlineRpc('report_online_incident', (body) => ({
  p_public_session_id: body.sessionId,
  p_public_incident_id: body.incidentId,
  p_incident_type: body.incidentType,
  p_subject: body.subjectPublicPlayerId ?? null,
  p_chunk_id: body.chunkId,
  p_payload: body.payload ?? {}
}));
