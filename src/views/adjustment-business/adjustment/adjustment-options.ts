import type { WmsAdjustmentType } from '@wms/api'

export const adjustmentOptions: Array<{ label: string; value: WmsAdjustmentType }> = [
  { label: '仓位移动', value: 'bin_move' },
  { label: '物料转换', value: 'material_convert' },
  { label: '批次转换', value: 'batch_convert' },
  { label: '库存状态转换', value: 'status_convert' },
  { label: '计量单位转换', value: 'unit_convert' },
  { label: '其他属性转换', value: 'attribute_convert' }
]

export function adjustmentLabel(type: WmsAdjustmentType): string {
  return adjustmentOptions.find((item) => item.value === type)?.label || '库存调整'
}
