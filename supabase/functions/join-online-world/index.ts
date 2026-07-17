import { serveOnlineRpc } from '../_shared/online-rpc.ts';

serveOnlineRpc('join_online_world', (body) => ({
  p_world_id: body.worldId,
  p_public_player_id: body.publicPlayerId,
  p_driver_name: body.driverName,
  p_avatar_id: body.avatarId,
  p_fleet_public_id: body.fleetPublicId,
  p_fleet_name: body.fleetName,
  p_fleet_tag: body.fleetTag,
  p_fleet_color: body.fleetColor,
  p_fleet_emblem_id: body.fleetEmblemId,
  p_chunk_id: body.chunkId,
  p_authorized_chunks: body.authorizedChunks,
  p_vehicle_id: body.vehicleId,
  p_map_version: body.mapVersion,
  p_protocol_version: body.protocolVersion
}));
