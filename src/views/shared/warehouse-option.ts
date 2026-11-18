import type { WmsWarehouse } from '@wms/api'

export function toWarehouseOption({
  id,
  warehouseCode,
  warehouseName
}: Pick<WmsWarehouse, 'id' | 'warehouseCode' | 'warehouseName'>) {
  return {
    value: id,
    label: warehouseCode ? `${warehouseCode} · ${warehouseName}` : warehouseName
  }
}
