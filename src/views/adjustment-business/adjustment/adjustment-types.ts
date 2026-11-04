import type { WmsAdjustmentType } from '@wms/api'

const supportedAdjustmentTypes = [
  'bin_move',
  'material_convert',
  'batch_convert',
  'status_convert',
  'unit_convert',
  'attribute_convert'
] as const satisfies readonly WmsAdjustmentType[]

export const isSupportedAdjustmentType = (value: string): value is WmsAdjustmentType =>
  supportedAdjustmentTypes.some((type) => type === value)
