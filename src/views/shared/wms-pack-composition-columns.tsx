import type { ColumnOption } from '@/types'
import { formatCompactNumberValue } from '@/utils/ui/format'
import type { WmsPackComposition } from '../../api/packing-composition'

export function formatWmsPackComposition(
  row: WmsPackComposition,
  field: 'boardNo' | 'lengthMm' | 'pieces'
): string {
  return (
    row.packDetails
      ?.map((item) =>
        field === 'boardNo' ? item.boardNo || '—' : formatCompactNumberValue(item[field], 4, '—')
      )
      .join('\n') || '—'
  )
}

/** Keep original package composition aligned across document and inventory lists. */
export function createWmsPackCompositionColumns<T extends WmsPackComposition>(): ColumnOption<T>[] {
  return [
    {
      prop: 'packNo',
      label: '包号',
      minWidth: 120,
      showOverflowTooltip: true,
      formatter: (row) => row.packNo || '—'
    },
    {
      prop: 'packArea',
      label: '区域',
      minWidth: 120,
      showOverflowTooltip: true,
      formatter: (row) => row.packArea || '—'
    },
    {
      prop: 'packBoardNo',
      label: '编号',
      minWidth: 120,
      showOverflowTooltip: true,
      headerTooltip: '包内原始板材编号，与长度、块数逐行对应。',
      formatter: (row) => (
        <span class="block whitespace-pre leading-6">
          {formatWmsPackComposition(row, 'boardNo')}
        </span>
      )
    },
    {
      prop: 'packLengthMm',
      label: '长度 mm',
      minWidth: 120,
      align: 'right',
      headerTooltip: '包内原始板材长度，与编号、块数逐行对应。',
      formatter: (row) => (
        <span class="block whitespace-pre leading-6 tabular-nums">
          {formatWmsPackComposition(row, 'lengthMm')}
        </span>
      )
    },
    {
      prop: 'packPieces',
      label: '块数',
      minWidth: 100,
      align: 'right',
      headerTooltip: '包内原始排包组成的块数；当前库存和本次出入库数量以对应数量字段为准。',
      formatter: (row) => (
        <span class="block whitespace-pre leading-6 tabular-nums">
          {formatWmsPackComposition(row, 'pieces')}
        </span>
      )
    }
  ]
}
