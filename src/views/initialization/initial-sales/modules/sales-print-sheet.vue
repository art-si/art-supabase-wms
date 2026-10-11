<template>
  <Teleport to="body">
    <div class="wms-sales-print-batch" aria-hidden="true">
      <article v-for="record in records" :key="record.id" class="wms-sales-print-sheet">
        <h1>{{ printTitle(record) }}</h1>
        <div class="wms-sales-print-sheet__meta">
          <span>{{ isReturn(record) ? '退货' : '出货' }}单号：{{ record.documentNo }}</span>
          <span>{{ isReturn(record) ? '退货' : '出货' }}日期：{{ record.businessDate }}</span>
          <span>仓库：{{ warehouseName(record) }}</span>
        </div>
        <div class="wms-sales-print-sheet__meta">
          <span>客户：{{ record.customer?.customerName || '—' }}</span>
          <span v-if="record.kind.startsWith('other_')"
            >领用部门：{{ record.usingDepartment?.organizationName || '—' }}</span
          >
          <span>项目：{{ projectNames(record) }}</span>
          <span>业务类型：{{ businessType(record) }}</span>
        </div>
        <table>
          <thead
            ><tr
              ><th>物料编号</th><th>物料描述 / 规格型号</th><th>单位</th><th>数量</th><th>单价</th
              ><th>金额</th><th>项目 / 施工号</th><th>批次 / 库位 / 序列号</th><th>税额</th
              ><th>价税合计</th></tr
            ></thead
          >
          <tbody>
            <tr v-for="line in record.lines" :key="line.id || line.lineNo">
              <td>{{ line.material?.code || '—' }}</td
              ><td
                >{{ line.material?.description || line.material?.name || '—' }}<br />{{
                  line.material?.specificationModel || '—'
                }}</td
              >
              <td>{{ unitDisplayName(record.tenantId, line.inventoryUnitId) }}</td
              ><td :class="{ negative: line.quantity < 0 }">{{
                isReturn(record)
                  ? formatCurrencyValue(line.quantity)
                  : formatNumberValue(line.quantity)
              }}</td>
              <td>{{ formatCurrencyValue(line.unitPrice) }}</td
              ><td :class="{ negative: line.amount < 0 }">{{
                formatCurrencyValue(line.amount)
              }}</td>
              <td>{{ line.project?.name || '—' }} / {{ line.constructionNo || '—' }}</td>
              <td
                >{{ line.batchNo || '—' }} / {{ line.bin?.binName || '—' }}<br />{{
                  line.serialNos.join('、') || '—'
                }}</td
              >
              <td :class="{ negative: line.taxAmount < 0 }">{{
                formatCurrencyValue(line.taxAmount)
              }}</td
              ><td :class="{ negative: line.totalAmount < 0 }">{{
                formatCurrencyValue(line.totalAmount)
              }}</td>
            </tr>
            <tr
              ><td>总计：</td
              ><td :colspan="9"
                >{{
                  formatCurrencyValue(record.lines.reduce((sum, line) => sum + line.amount, 0))
                }}；价税合计：{{
                  formatCurrencyValue(record.lines.reduce((sum, line) => sum + line.totalAmount, 0))
                }}</td
              ></tr
            >
          </tbody>
        </table>
        <p v-if="Boolean(record.remark)"
          >{{ isReturn(record) ? '退货原因 / 备注' : '加工事项 / 备注' }}：{{
            record.remark || '—'
          }}</p
        >
        <div class="wms-sales-print-sheet__meta"
          ><span>负责人：</span><span>库管员：{{ record.keeper?.employeeName || '' }}</span
          ><span>销售员：{{ record.salesperson?.employeeName || '' }}</span
          ><span>客户签收：</span></div
        >
      </article>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
  import type { WmsInitialSalesDocument, WmsWarehouse } from '@wms/api'
  import { fetchWmsWarehouses } from '@wms/api'
  import { usePrintSheet } from '@/hooks/core/usePrintSheet'
  import { useUnitDisplayNames } from '@/hooks/core/useUnitDisplayNames'
  import { formatCurrencyValue, formatNumberValue } from '@/utils/ui/format'
  import { uniq } from 'lodash-es'
  function isReturn(record: WmsInitialSalesDocument): boolean {
    return ['return', 'other_return'].includes(record.kind)
  }
  function businessType(record: WmsInitialSalesDocument): string {
    return record.kind.startsWith('other_')
      ? isReturn(record)
        ? '其他出库退回'
        : '其他出库'
      : isReturn(record)
        ? '销售退货'
        : '销售出库'
  }
  function printTitle(record: WmsInitialSalesDocument): string {
    return record.kind.startsWith('other_')
      ? isReturn(record)
        ? '其他出库退回单'
        : '其他出库单'
      : isReturn(record)
        ? '销售退货单'
        : '销售出货单'
  }
  const records = ref<WmsInitialSalesDocument[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const { loadUnitDisplayNames, unitDisplayName } = useUnitDisplayNames()
  const { print: printSheet } = usePrintSheet('is-wms-sales-printing', () => {
    records.value = []
  })
  function warehouseName(record: WmsInitialSalesDocument): string {
    return (
      uniq(
        [record.warehouseId, ...record.lines.map((line) => line.warehouseId)]
          .filter(Boolean)
          .map(
            (id) => warehouses.value.find((warehouse) => warehouse.id === id)?.warehouseName || '—'
          )
      ).join('、') || '—'
    )
  }
  function projectNames(record: WmsInitialSalesDocument): string {
    return uniq(record.lines.map((line) => line.project?.name).filter(Boolean)).join('、') || '—'
  }
  async function print(rows: WmsInitialSalesDocument[]): Promise<void> {
    const [, warehouseRows] = await Promise.all([
      loadUnitDisplayNames(rows.map((row) => row.tenantId)),
      fetchWmsWarehouses()
    ])
    warehouses.value = warehouseRows
    records.value = rows
    await printSheet()
  }
  defineExpose({ print })
</script>
<style lang="scss">
  .wms-sales-print-batch {
    display: none;
  }

  @media print {
    body.is-wms-sales-printing {
      background: #fff;

      > *:not(.wms-sales-print-batch) {
        display: none !important;
      }

      > .wms-sales-print-batch {
        display: block !important;
      }
    }

    .wms-sales-print-sheet {
      padding: 8mm;
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      font-size: 12px;
      color: #000;
      break-after: page;

      &:last-child {
        break-after: auto;
      }

      h1 {
        margin: 0 0 8mm;
        font-size: 28px;
        text-align: center;
        text-decoration: underline;
      }

      &__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4mm;
        justify-content: space-between;
        margin: 5mm 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 4mm 2mm;
        overflow-wrap: anywhere;
        border: 1px solid #000;
      }

      thead {
        display: table-header-group;
      }

      tr {
        break-inside: avoid;
      }

      .negative {
        color: #c00;
      }
    }
  }
</style>
