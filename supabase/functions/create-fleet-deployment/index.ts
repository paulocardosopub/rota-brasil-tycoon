import { serveOnlineRpc } from '../_shared/online-rpc.ts';

serveOnlineRpc('create_fleet_public_deployment', (body) => ({
  p_shift_id: body.shiftId,
  p_vehicle_id: body.vehicleId,
  p_driver_id: body.driverId,
  p_region: body.region,
  p_chunk_id: body.chunkId,
  p_starts_at: body.startsAt,
  p_ends_at: body.endsAt,
  p_version: body.version
}));
