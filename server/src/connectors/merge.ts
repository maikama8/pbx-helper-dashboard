import type { Extension, Trunk } from "../domain/types.js";

/** AMI registration wins over the inventory row when the names match. Inventory keeps the label. */
export function overlayTrunks(inventory: readonly Trunk[], observed: readonly Trunk[]): Trunk[] {
  if (inventory.length === 0) return [...observed];
  return inventory.map((row) => {
    const live = observed.find((item) => item.name === row.name || item.id === row.id || item.host === row.host);
    if (!live) return row;
    return {
      ...row,
      status: live.status,
      rttMs: live.rttMs ?? row.rttMs,
      channelsInUse: live.channelsInUse || row.channelsInUse,
      detail: live.detail || row.detail,
      lastRegistration: live.lastRegistration ?? row.lastRegistration,
    };
  });
}

export function overlayExtensions(inventory: readonly Extension[], observed: readonly Extension[]): Extension[] {
  if (inventory.length === 0) return [...observed];
  const extras = observed.filter(
    (item) => !inventory.some((row) => row.extension === item.extension || row.id === item.id),
  );
  const merged = inventory.map((row) => {
    const live = observed.find((item) => item.extension === row.extension || item.id === row.id);
    if (!live) return row;
    return {
      ...row,
      status: live.status,
      address: live.address ?? row.address,
    };
  });
  return [...merged, ...extras];
}
