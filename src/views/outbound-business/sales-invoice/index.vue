<template>
  <ArtPermissionGuard permission="WmsSalesInvoice:View" resource-name="销售发票草稿">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        title="销售发票草稿"
        eyebrow="SALES INVOICE"
        icon="ri:bill-line"
        density="compact"
        description="销售出库下推开票草稿，销售退货下推红字冲减草稿。核对来源明细后完善拟开票日期与备注。"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        focusable
        :table-props="{
          rowKey: 'id',
          emptyText: '暂无销售发票草稿',
          emptyDescription: '在销售出库单或销售退货单中勾选已审核记录，通过下推生成。'
        }"
      />
      <ArtDrawer ref="drawerRef" size="85%" :show-footer="editing">
        <ArtEmptyState
          v-if="loadError"
          title="发票草稿加载失败"
          description="请重新加载；如仍失败，请检查当前单据的查看权限。"
        >
          <ElButton type="primary" @click="reload">重新加载</ElButton>
        </ArtEmptyState>
        <div v-else-if="record" class="grid min-w-0 gap-5">
          <ArtSectionCard title="发票资料" subtitle="此记录为待核对草稿，拟开票日期与备注可修改。">
            <ArtDescriptions :data="record" :items="descriptionItems" :columns="3" />
            <ArtForm
              v-if="editing"
              ref="formRef"
              v-model="form"
              :items="formItems"
              :rules="rules"
              :span="12"
              label-position="top"
              :show-submit="false"
              :show-reset="false"
            />
          </ArtSectionCard>
          <ArtSectionCard
            title="来源明细"
            :subtitle="`共 ${record.lines.length} 行 · 价税合计 ${formatCurrencyValue(total(record))}`"
          >
            <ArtTable
              :data="record.lines"
              :columns="lineColumns"
              :pagination="false"
              row-key="id"
              :cell-class-name="invoiceCellClassName"
            />
          </ArtSectionCard>
        </div>
      </ArtDrawer>
    </div>
  </ArtPermissionGuard>
</template>
<script setup lang="tsx">
  import { ElMessage, ElTag } from 'element-plus'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRouteDocumentDrawer } from '@/hooks/core/useRouteDocumentDrawer'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { formatCurrencyValue, formatNumberValue } from '@/utils/ui/format'
  import {
    fetchWmsSalesInvoices,
    fetchWmsSalesInvoice,
    editWmsSalesInvoice,
    type WmsSalesInvoice,
    type WmsSalesInvoiceLine
  } from '@wms/api'

  defineOptions({ name: 'WmsSalesInvoice' })
  const { hasAuth } = useAuth()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const drawerRef = ref<ArtDrawerExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const record = ref<WmsSalesInvoice>()
  const editing = ref(false)
  const loadError = ref(false)
  const form = ref({ issueDate: '', remark: '' })
  let requestVersion = 0
  const searchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '草稿编号',
      type: 'input',
      props: { clearable: true, placeholder: '输入销售发票草稿编号' }
    }
  ]
  const formItems: FormItem[] = [
    { key: 'issueDate', label: '拟开票日期', type: 'date', props: { valueFormat: 'YYYY-MM-DD' } },
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      props: { type: 'textarea', maxlength: 500, showWordLimit: true }
    }
  ]
  const rules = { issueDate: [{ required: true, message: '请选择拟开票日期', trigger: 'change' }] }
  const descriptionItems: ArtDescriptionItem<WmsSalesInvoice>[] = [
    { key: 'documentNo', label: '草稿编号', field: 'documentNo', copyable: true },
    {
      key: 'invoiceType',
      label: '发票类型',
      field: 'invoiceType',
      dictCode: 'wmsSalesInvoiceType',
      dictDisplay: 'text'
    },
    {
      key: 'redLetter',
      label: '业务方向',
      value: (data: WmsSalesInvoice) => (data.redLetter ? '红字冲减' : '销售开票')
    },
    {
      key: 'customer',
      label: '客户',
      value: (data: WmsSalesInvoice) => data.customer.customerName
    },
    { key: 'source', label: '来源单据', value: (data: WmsSalesInvoice) => data.source.documentNo },
    { key: 'issueDate', label: '拟开票日期', field: 'issueDate' },
    { key: 'remark', label: '备注', field: 'remark', span: 3 }
  ]
  function total(row: WmsSalesInvoice): number {
    return row.lines.reduce((sum, line) => sum + Number(line.totalAmount), 0)
  }
  function fetchRows(query: { current: number; size: number; keyword?: string }) {
    return fetchWmsSalesInvoices({ ...query, tenantId: effectiveTenantId.value || undefined })
  }
  const lineColumns: ColumnOption<WmsSalesInvoiceLine>[] = [
    { prop: 'source.lineNo', label: '源行号', width: 85, formatter: (row) => row.source.lineNo },
    {
      prop: 'materialCode',
      label: '物料编码',
      minWidth: 140,
      formatter: (row) => row.source.material.materialCode
    },
    {
      prop: 'materialDescription',
      label: '物料描述',
      minWidth: 200,
      formatter: (row) => row.source.material.description || row.source.material.materialName
    },
    {
      prop: 'project',
      label: '项目 / 施工号',
      minWidth: 180,
      formatter: (row) =>
        `${row.source.project?.projectName || '—'} / ${row.source.constructionNo || '—'}`
    },
    {
      prop: 'quantity',
      label: '数量',
      minWidth: 120,
      align: 'right',
      formatter: (row) => formatNumberValue(row.quantity)
    },
    {
      prop: 'inventoryUnit',
      label: '库存单位',
      minWidth: 110,
      formatter: (row) => row.source.inventoryUnit?.unitName || '—'
    },
    {
      prop: 'amount',
      label: '金额(元)',
      minWidth: 130,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.amount)
    },
    {
      prop: 'taxAmount',
      label: '税额(元)',
      minWidth: 130,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.taxAmount)
    },
    {
      prop: 'totalAmount',
      label: '价税合计(元)',
      minWidth: 140,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.totalAmount)
    },
    {
      prop: 'batchNo',
      label: '批次号',
      minWidth: 130,
      formatter: (row) => row.source.batchNo || '—'
    }
  ]
  function invoiceCellClassName({
    row,
    column
  }: {
    row: Record<string, unknown>
    column: { property?: string }
  }): string {
    return Number(row.quantity) < 0 &&
      ['quantity', 'amount', 'taxAmount', 'totalAmount'].includes(column.property || '')
      ? 'sales-invoice-negative'
      : ''
  }
  function columnsFactory(): ColumnOption<WmsSalesInvoice>[] {
    return [
      { prop: 'documentNo', label: '草稿编号', minWidth: 220 },
      {
        prop: 'source',
        label: '来源单据',
        minWidth: 180,
        formatter: (row) => row.source.documentNo
      },
      {
        prop: 'customer',
        label: '客户',
        minWidth: 180,
        formatter: (row) => row.customer.customerName
      },
      {
        prop: 'invoiceType',
        label: '发票类型',
        minWidth: 120,
        dictCode: 'wmsSalesInvoiceType',
        dictDisplay: 'text'
      },
      {
        prop: 'redLetter',
        label: '业务方向',
        minWidth: 120,
        formatter: (row) => (
          <ElTag type={row.redLetter ? 'danger' : 'info'}>
            {row.redLetter ? '红字冲减' : '销售开票'}
          </ElTag>
        )
      },
      { prop: 'issueDate', label: '拟开票日期', minWidth: 130 },
      {
        prop: 'total',
        label: '价税合计(元)',
        minWidth: 150,
        align: 'right',
        formatter: (row) => (
          <span
            class={row.redLetter ? 'text-[var(--el-color-danger)] tabular-nums' : 'tabular-nums'}
          >
            {formatCurrencyValue(total(row))}
          </span>
        )
      },
      {
        prop: 'operation',
        label: '操作',
        fixed: 'right',
        width: 112,
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              permission="WmsSalesInvoice:View"
              onClick={() => open(row, false)}
            />
            <ArtButtonTable
              type="edit"
              permission="WmsSalesInvoice:Edit"
              onClick={() => open(row, true)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
  }
  async function open(data: WmsSalesInvoice, edit: boolean): Promise<void> {
    record.value = data
    editing.value = edit
    form.value = { issueDate: data.issueDate, remark: data.remark || '' }
    loadError.value = false
    await drawerRef.value?.handleOpen(undefined, {
      title: `${edit ? '编辑' : '查看'}销售发票草稿`,
      subtitle: data.documentNo,
      showFooter: edit,
      confirmText: '保存草稿',
      onConfirm: save,
      onClose: () => {
        requestVersion++
      }
    })
  }
  async function reload(): Promise<void> {
    if (!record.value) return
    const version = ++requestVersion
    drawerRef.value?.setLoading(true)
    try {
      const data = await fetchWmsSalesInvoice(record.value.id)
      if (version !== requestVersion) return
      record.value = data
      loadError.value = false
    } catch (error) {
      loadError.value = true
      notifyFriendlyError(error, '发票草稿加载失败，请重试')
    } finally {
      if (version === requestVersion) drawerRef.value?.setLoading(false)
    }
  }
  async function save(): Promise<boolean> {
    if (
      !record.value ||
      !hasAuth('WmsSalesInvoice:Edit') ||
      !(await validateArtFormForSubmit(formRef.value))
    )
      return false
    try {
      await editWmsSalesInvoice(record.value.id, form.value.issueDate, form.value.remark)
      ElMessage.success('销售发票草稿已保存')
      await tableRef.value?.refreshUpdate()
      return true
    } catch (error) {
      notifyFriendlyError(error, '草稿保存失败，请重试')
      return false
    }
  }
  useRouteDocumentDrawer({
    routeName: 'WmsSalesInvoice',
    canOpen: () => hasAuth('WmsSalesInvoice:View'),
    fetchDocument: fetchWmsSalesInvoice,
    openDocument: (data) => open(data, false)
  })
</script>
<style scoped lang="scss">
  :deep(td.sales-invoice-negative) {
    color: var(--el-color-danger);
  }
</style>
