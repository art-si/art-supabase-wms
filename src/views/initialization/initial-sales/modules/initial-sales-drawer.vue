<template>
  <ArtDrawer ref="drawerRef" size="88%" :show-footer="mode !== 'view'">
    <div class="initialization-document-stack min-w-0">
      <ArtEntitySummary
        :icon="isReturn ? 'ri:arrow-go-back-line' : 'ri:logout-box-r-line'"
        eyebrow="OPENING SALES DOCUMENT"
        :title="form.documentNo || `${mode === 'copy' ? '复制' : '新增'}${title}`"
        description="按单据表头、物料明细、税价和仓储信息依次填写。编号在保存时生成。"
      >
        <template #aside
          ><ElTag
            :type="
              form.status === 'approved'
                ? 'success'
                : form.status === 'submitted'
                  ? 'warning'
                  : 'info'
            "
            >{{ statusLabel }}</ElTag
          ></template
        >
      </ArtEntitySummary>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon>
        基础资料加载失败，请重试后再保存。<ElButton link type="primary" @click="loadOptions"
          >重新加载</ElButton
        >
      </ElAlert>
      <ElAlert v-else type="info" :closable="false" show-icon>
        业务日期不得晚于库存组织启用日期。物料价格、税额、折扣与辅助数量由系统核算；退货以负数入账。
      </ElAlert>
      <ElAlert v-if="importIntent" type="success" :closable="false" show-icon>
        先选择库存组织及客户，再在“物料明细”中点击“导入明细”；导入后请核对仓储和价格信息。
      </ElAlert>
      <ArtSectionCard
        title="单据表头"
        subtitle="客户、业务日期和库存组织是必填信息；记账日期由系统记录。"
      >
        <ArtDescriptions v-if="mode === 'view'" :data="viewData" :items="viewItems" :columns="3" />
        <ArtForm
          v-else
          ref="formRef"
          v-model="form"
          :items="headerItems"
          :rules="headerRules"
          :span="8"
          :gutter="18"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #customerId>
            <ArtTableSingleSelect
              :model-value="form.customerId || undefined"
              :selected-data="selectedCustomer"
              :data="customers"
              :columns="partyColumns"
              row-key="id"
              label-key="name"
              description-key="code"
              title="选择客户"
              placeholder="从销售主数据选择"
              :disabled="!form.tenantId"
              @update:model-value="form.customerId = String($event || '')"
              @update:selected-data="selectedCustomer = $event"
            />
          </template>
          <template #salespersonId>
            <ArtEmployeeSelect
              :model-value="form.salespersonId || undefined"
              :selected-data="selectedSalesperson"
              :tenant-id="form.tenantId || undefined"
              title="选择销售员"
              :disabled="!form.tenantId"
              @update:model-value="form.salespersonId = $event || null"
              @update:selected-data="onSalespersonSelected"
            />
          </template>
          <template #keeperId>
            <ArtEmployeeSelect
              :model-value="form.keeperId || undefined"
              :selected-data="selectedKeeper"
              :tenant-id="form.tenantId || undefined"
              title="选择仓管员"
              :disabled="!form.tenantId"
              @update:model-value="form.keeperId = $event || null"
              @update:selected-data="selectedKeeper = $event"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ArtSectionCard
        title="物料明细"
        :subtitle="`共 ${lines.length} 行 · 数量 ${quantityTotal.toFixed(4)} · 价税合计 ${totalAmount.toFixed(2)} 元`"
        :empty="lines.length === 0"
        empty-title="尚未选择物料"
        empty-description="先选择库存组织，再从物料编码中添加明细。"
      >
        <template #actions>
          <div
            v-if="mode !== 'view' && form.tenantId"
            class="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap"
          >
            <ArtTableMultipleSelect
              v-model="materialPickerIds"
              v-model:selected-data="materialPickerRows"
              class="w-auto! shrink-0"
              title="选择销售物料"
              subtitle="可按物料编码、名称和描述检索并多选。"
              search-placeholder="搜索物料编码或描述"
              row-key="id"
              label-key="name"
              description-key="code"
              :columns="materialColumns"
              :api-fn="materialApi"
              @confirm="addMaterials"
            >
              <template #trigger="{ open }"
                ><ElButton type="primary" @click="open"
                  ><ArtSvgIcon icon="ri:add-line" />添加物料</ElButton
                ></template
              >
            </ArtTableMultipleSelect>
            <span
              v-auth="importPermission"
              class="shrink-0"
              :title="form.organizationId ? '' : '请先选择库存组织'"
            >
              <ArtExcelImport
                accept=".xlsx,.xls,.csv"
                :disabled="!form.organizationId"
                :button-props="{ type: 'success', plain: true }"
                icon="ri:upload-2-line"
                @import-success="importLines"
                @import-error="onImportError"
                >导入明细</ArtExcelImport
              >
            </span>
          </div>
        </template>
        <ElScrollbar v-if="lines.length">
          <ArtTable
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            :cell-class-name="salesLineCellClassName"
            row-key="lineNo"
            table-layout="fixed"
          >
            <template #material="{ row }">
              <strong class="block truncate text-sm">{{ row.material?.name || '物料' }}</strong>
              <small class="text-[var(--el-text-color-secondary)]">{{
                row.material?.code || row.materialId
              }}</small>
            </template>
            <template #returnType="{ row }">
              <ElSelect v-if="mode !== 'view'" v-model="row.returnType" placeholder="退货类型">
                <ElOption
                  v-for="option in returnTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
              <span v-else>{{ returnTypeLabel(row.returnType) }}</span>
            </template>
            <template #projectId="{ row }">
              <ArtTableSingleSelect
                v-if="mode !== 'view'"
                :model-value="row.projectId || undefined"
                :selected-data="row.project ? [row.project] : []"
                :data="projects"
                :columns="partyColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择销售项目"
                placeholder="选择项目"
                clearable
                @update:model-value="onInlineProjectChange(row, String($event || '') || null)"
                @update:selected-data="row.project = $event[0] || null"
              />
              <span v-else>{{ projectName(row.projectId) }}</span>
            </template>
            <template #constructionNo="{ row }">
              <ElInput
                v-if="mode !== 'view'"
                v-model="row.constructionNo"
                :disabled="!row.projectId"
                placeholder="施工号"
              />
              <span v-else>{{ row.constructionNo || '—' }}</span>
            </template>
            <template #quantity="{ row }">
              <ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.quantity"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
              />
              <strong v-else :class="isReturn ? 'sales-return-quantity' : 'tabular-nums'">{{
                displayQuantity(Number(row.quantity)).toFixed(4)
              }}</strong>
            </template>
            <template #inventoryUnitId="{ row }">
              <ElSelect
                v-if="mode !== 'view'"
                v-model="row.inventoryUnitId"
                filterable
                placeholder="库存单位"
                ><ElOption
                  v-for="unit in salesUnitOptions"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value"
              /></ElSelect>
              <span v-else>{{ unitName(row.inventoryUnitId) }}</span>
            </template>
            <template #baseUnitId="{ row }">
              <ElSelect
                v-if="mode !== 'view'"
                v-model="row.baseUnitId"
                filterable
                placeholder="基本单位"
              >
                <ElOption
                  v-for="unit in salesUnitOptions"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value"
                />
              </ElSelect>
              <span v-else>{{ unitName(row.baseUnitId) }}</span>
            </template>
            <template #baseQuantity="{ row }">{{ baseQuantity(row) }}</template>
            <template #auxiliaryUnitId="{ row }">{{ unitName(row.auxiliaryUnitId) }}</template>
            <template #auxiliaryQuantity="{ row }">{{
              auxQuantity(row, row.auxiliaryUnitId)
            }}</template>
            <template #auxiliaryUnit2Id="{ row }">{{ unitName(row.auxiliaryUnit2Id) }}</template>
            <template #auxiliaryQuantity2="{ row }">{{
              auxQuantity(row, row.auxiliaryUnit2Id)
            }}</template>
            <template #unitPrice="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.unitPrice"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
                @change="updatePrice(row, 'untaxed')"
              /><span v-else>{{ Number(row.unitPrice).toFixed(4) }}</span></template
            >
            <template #taxInclusiveUnitPrice="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.taxInclusiveUnitPrice"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
                @change="updatePrice(row, 'taxed')"
              /><span v-else>{{ Number(row.taxInclusiveUnitPrice).toFixed(4) }}</span></template
            >
            <template #taxRate="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.taxRate"
                @change="updatePrice(row, row.priceBasis)"
                ><ElOption
                  v-for="rate in taxRates"
                  :key="rate"
                  :label="`${rate}%`"
                  :value="rate" /></ElSelect
              ><span v-else>{{ row.taxRate }}%</span></template
            >
            <template #discountMethod="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.discountMethod"
                @change="row.unitDiscountRate = 0"
                ><ElOption
                  v-for="option in wmsLineDiscountModeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{ row.discountMethod }}</span></template
            >
            <template #unitDiscountRate="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.unitDiscountRate"
                :min="0"
                :max="1"
                :precision="4"
                :controls="false"
                :disabled="row.discountMethod === 'none'"
                class="w-full!"
              /><span v-else>{{ row.unitDiscountRate }}</span></template
            >
            <template #totalAmount="{ row }">{{ lineFinancial(row).total.toFixed(2) }}</template>
            <template #gift="{ row }"
              ><ElCheckbox v-if="mode !== 'view'" v-model="row.gift" aria-label="赠品" /><span
                v-else
                >{{ row.gift ? '✓' : '—' }}</span
              ></template
            >
            <template #batchNo="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.batchNo" placeholder="批号" /><span
                v-else
                >{{ row.batchNo || '—' }}</span
              ></template
            >
            <template #warehouseId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.warehouseId"
                filterable
                clearable
                placeholder="仓库"
                @change="onInlineWarehouseChange(row)"
                ><ElOption
                  v-for="warehouse in currentWarehouses"
                  :key="warehouse.id"
                  :label="`${warehouse.warehouseName} · ${warehouse.warehouseCode}`"
                  :value="warehouse.id" /></ElSelect
              ><span v-else>{{
                currentWarehouses.find((item) => item.id === row.warehouseId)?.warehouseName || '—'
              }}</span></template
            >
            <template #binId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.binId"
                filterable
                clearable
                :disabled="!row.warehouseId"
                placeholder="仓位"
                @visible-change="($event) => $event && loadInlineBins(row)"
                ><ElOption
                  v-for="bin in bins"
                  :key="bin.id"
                  :label="`${bin.binName} · ${bin.binCode}`"
                  :value="bin.id" /></ElSelect
              ><span v-else>{{ row.binId || '—' }}</span></template
            >
            <template #stockType="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.stockType"
                ><ElOption
                  v-for="option in stockTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                stockTypes.find((item) => item.value === row.stockType)?.label || row.stockType
              }}</span></template
            >
            <template #ownerType="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.ownerType"
                @change="onInlineOwnerTypeChange(row)"
                ><ElOption
                  v-for="option in ownerTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                ownerTypes.find((item) => item.value === row.ownerType)?.label || row.ownerType
              }}</span></template
            >
            <template #ownerId="{ row }"
              ><ArtTableSingleSelect
                v-if="mode !== 'view' && row.ownerType !== 'self'"
                :model-value="row.ownerId || undefined"
                :data="row.ownerType === 'supplier' ? suppliers : customers"
                :columns="partyColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择货主"
                @update:model-value="onInlineOwnerChange(row, String($event || '') || null)"
              /><span v-else>{{
                row.ownerType === 'self' ? '自有' : row.ownerId || '—'
              }}</span></template
            >
            <template #stockStatus="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.stockStatus"
                ><ElOption
                  v-for="option in stockStatuses"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                stockStatuses.find((item) => item.value === row.stockStatus)?.label ||
                row.stockStatus
              }}</span></template
            >
            <template #keeperId="{ row }">
              <ArtEmployeeSelect
                v-if="mode !== 'view'"
                :model-value="row.keeperId || undefined"
                :tenant-id="form.tenantId || undefined"
                title="选择行仓管员"
                @update:model-value="row.keeperId = $event || null"
              />
              <span v-else>{{ row.keeperId || '—' }}</span>
            </template>
            <template #productionDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.productionDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="生产日期"
                class="w-full!"
              /><span v-else>{{ row.productionDate || '—' }}</span></template
            >
            <template #expiryDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.expiryDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="有效期至"
                class="w-full!"
              /><span v-else>{{ row.expiryDate || '—' }}</span></template
            >
            <template #trackingNo="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.trackingNo" placeholder="跟踪号" /><span
                v-else
                >{{ row.trackingNo || '—' }}</span
              ></template
            >
            <template #sourceDocument="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.sourceDocument"
                placeholder="来源单据"
              /><span v-else>{{ row.sourceDocument || '—' }}</span></template
            >
            <template #sourceLineNo="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.sourceLineNo"
                placeholder="源行号"
              /><span v-else>{{ row.sourceLineNo || '—' }}</span></template
            >
            <template #remark="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.remark" placeholder="备注" /><span
                v-else
                >{{ row.remark || '—' }}</span
              ></template
            >
            <template #operation="{ row }">
              <ElButton
                v-if="row.material?.serialManagementEnabled"
                link
                type="primary"
                @click="openInlineSerials(row)"
                >序列号 {{ row.serialNos.length }}</ElButton
              >
              <ArtButtonMore
                v-if="mode !== 'view'"
                :list="lineMoreActions"
                trigger="click"
                @click="(item) => onLineMoreAction(item, row)"
              />
            </template>
          </ArtTable>
        </ElScrollbar>
      </ArtSectionCard>
    </div>
  </ArtDrawer>

  <ArtDialog ref="serialEntryDialogRef" size="sm" :show-footer="mode !== 'view'">
    <ArtExcelImport
      accept=".txt,.csv"
      :parse-excel="false"
      :button-props="{ link: true, type: 'primary' }"
      @file-change="importSerials"
      >导入序列号</ArtExcelImport
    >
    <ArtForm
      v-model="serialEntryForm"
      :items="serialEntryItems"
      :show-reset="false"
      :show-submit="false"
      label-position="top"
    />
  </ArtDialog>
  <ArtDialog ref="serialViewDialogRef" size="sm" :show-footer="false">
    <ArtEmptyState
      v-if="!serialList.length"
      size="compact"
      title="暂无序列号"
      description="录入或导入序列号后可在这里查看。"
    />
    <ElScrollbar
      v-else
      max-height="24rem"
      class="rounded-xl bg-[var(--el-fill-color-light)] font-mono text-sm whitespace-pre-wrap"
      ><div class="p-4">{{ serialList.join('\n') }}</div></ElScrollbar
    >
  </ArtDialog>
</template>

<script setup lang="ts">
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { parseSerialNumberText } from '@/utils/file/serial-number-text'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import dayjs from 'dayjs'
  import { cloneDeep } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type {
    DataSelectRecord,
    DataSelectFetchParams
  } from '@/components/core/forms/art-data-select/types'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { fetchEnabledOrganizationTree } from '@/api/system-manage'
  import type { ColumnOption } from '@/types'
  import {
    fetchWmsBins,
    fetchWmsInitialDocumentTypes,
    fetchWmsInitialMaterials,
    fetchWmsInitialOptions,
    fetchWmsInitialSalesDocument,
    fetchWmsInventoryOrganizations,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    saveWmsInitialSalesDocument,
    type WmsBin,
    type WmsInitialMaterial,
    type WmsInitialSalesDocument,
    type WmsInitialSalesKind,
    type WmsInitialSalesLine,
    type WmsInitializationOption,
    type WmsInventoryOrganization,
    type WmsUnitOption,
    type WmsWarehouse
  } from '@wms/api'

  const commonDocumentReviewStatusOptions = useDictionaryOptions('commonDocumentReviewStatus')
  const wmsLineDiscountModeOptions = useDictionaryOptions('wmsLineDiscountMode')

  type OpenMode = 'create' | 'copy' | 'edit' | 'view'
  interface OpenData {
    mode: OpenMode
    document?: WmsInitialSalesDocument
    documentId?: string
    importIntent?: boolean
  }
  const props = defineProps<{ kind: WmsInitialSalesKind; importPermission: string }>()
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const serialEntryDialogRef = ref<ArtDialogExpose>()
  const serialViewDialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const mode = ref<OpenMode>('create')
  const importIntent = ref(false)
  const currentDocument = shallowRef<WmsInitialSalesDocument | null>(null)
  const optionError = ref(false)
  const organizations = ref<WmsInventoryOrganization[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const units = ref<WmsUnitOption[]>([])
  const documentTypes = ref<WmsInitializationOption[]>([])
  const businessTypes = ref<WmsInitializationOption[]>([])
  const customers = ref<WmsInitializationOption[]>([])
  const suppliers = ref<WmsInitializationOption[]>([])
  const projects = ref<WmsInitializationOption[]>([])
  const bins = ref<WmsBin[]>([])
  const lines = ref<WmsInitialSalesLine[]>([])
  const selectableOrganizationTree = computed(() => {
    const selectableIds = new Set(
      organizations.value
        .filter(
          (item) =>
            item.enabledOn &&
            (isInitial.value ? !item.initializationClosedAt : item.initializationClosedAt)
        )
        .map((item) => item.id)
    )
    const decorate = (
      nodes: Api.SystemManage.OrganizationListItem[]
    ): Array<Api.SystemManage.OrganizationListItem & { disabled: boolean }> =>
      nodes.map((node) => ({
        ...node,
        disabled: !node.id || !selectableIds.has(node.id),
        children: node.children ? decorate(node.children) : undefined
      }))
    return decorate(organizationTree.value)
  })
  const permissionPrefix = computed(
    () =>
      ({
        initial_outbound: 'WmsInitialSalesOutbound',
        initial_return: 'WmsInitialSalesReturn',
        outbound: 'WmsSalesOutbound',
        return: 'WmsSalesReturnDocument',
        other_outbound: 'WmsOtherOutbound',
        other_return: 'WmsOtherOutbound'
      })[props.kind]
  )
  const lineEditPermission = computed(
    () =>
      `${permissionPrefix.value}:${mode.value === 'create' ? 'Add' : mode.value === 'copy' ? 'Copy' : 'Edit'}`
  )
  const lineMoreActions = computed<ButtonMoreItem[]>(() => [
    {
      key: 'copy-line',
      label: '复制明细',
      icon: 'ri:file-copy-line',
      auth: lineEditPermission.value
    },
    {
      key: 'delete-line',
      label: '删除明细',
      icon: 'ri:delete-bin-line',
      color: 'var(--el-color-danger)',
      auth: lineEditPermission.value
    }
  ])
  const lineColumns = computed<ColumnOption<WmsInitialSalesLine>[]>(() => [
    { prop: 'lineNo', label: '行号', width: 68 },
    { prop: 'material', label: '物料', minWidth: 230, useSlot: true },
    ...(isReturn.value
      ? [{ prop: 'returnType', label: '退货类型', minWidth: 110, useSlot: true }]
      : []),
    { prop: 'projectId', label: '项目名称', minWidth: 150, useSlot: true },
    { prop: 'constructionNo', label: '施工号', width: 150, useSlot: true },
    { prop: 'quantity', label: '数量', width: 132, align: 'right', useSlot: true },
    { prop: 'inventoryUnitId', label: '库存单位', width: 110, useSlot: true },
    { prop: 'baseUnitId', label: '基本单位', width: 130, useSlot: true },
    { prop: 'baseQuantity', label: '基本数量', width: 110, align: 'right', useSlot: true },
    { prop: 'auxiliaryUnitId', label: '辅助单位', width: 110, useSlot: true },
    { prop: 'auxiliaryQuantity', label: '辅助数量', width: 110, useSlot: true },
    { prop: 'auxiliaryUnit2Id', label: '辅助单位2', width: 110, useSlot: true },
    { prop: 'auxiliaryQuantity2', label: '辅助数量2', width: 110, useSlot: true },
    { prop: 'unitPrice', label: '未税单价', width: 132, align: 'right', useSlot: true },
    { prop: 'taxInclusiveUnitPrice', label: '含税单价', width: 132, align: 'right', useSlot: true },
    { prop: 'taxRate', label: '税率', width: 100, align: 'right', useSlot: true },
    { prop: 'discountMethod', label: '折扣方式', width: 130, useSlot: true },
    { prop: 'unitDiscountRate', label: '单位折扣', width: 120, useSlot: true },
    { prop: 'totalAmount', label: '价税合计', width: 124, align: 'right', useSlot: true },
    { prop: 'gift', label: '赠品', width: 68, align: 'center', useSlot: true },
    { prop: 'batchNo', label: '批号', width: 145, useSlot: true },
    { prop: 'warehouseId', label: '仓库', width: 180, useSlot: true },
    { prop: 'binId', label: '仓位', width: 155, useSlot: true },
    { prop: 'stockType', label: '库存类型', width: 130, useSlot: true },
    { prop: 'ownerType', label: '货主类型', width: 130, useSlot: true },
    { prop: 'ownerId', label: '货主', width: 170, useSlot: true },
    { prop: 'stockStatus', label: '库存状态', width: 130, useSlot: true },
    { prop: 'keeperId', label: '仓管员', width: 170, useSlot: true },
    { prop: 'productionDate', label: '生产日期', width: 165, useSlot: true },
    { prop: 'expiryDate', label: '有效期至', width: 165, useSlot: true },
    { prop: 'trackingNo', label: '跟踪号', width: 150, useSlot: true },
    { prop: 'sourceDocument', label: '来源单据', width: 150, useSlot: true },
    { prop: 'sourceLineNo', label: '源行号', width: 120, useSlot: true },
    { prop: 'remark', label: '备注', width: 180, useSlot: true },
    { prop: 'operation', label: '操作', width: 135, fixed: 'right', useSlot: true }
  ])
  const materialPickerIds = ref<string[]>([])
  const materialPickerRows = ref<DataSelectRecord[]>([])
  const selectedCustomer = ref<DataSelectRecord[]>([])
  const selectedSalesperson = ref<EmployeeIntegrationItem[]>([])
  const selectedKeeper = ref<EmployeeIntegrationItem[]>([])
  const serialLine = ref<WmsInitialSalesLine>()
  const serialText = ref('')
  const serialEntryForm = reactive({ serialText: '' })
  const serialEntryItems: FormItem[] = [
    {
      key: 'serialText',
      label: '序列号',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 10, placeholder: '每行一个序列号' }
    }
  ]
  const form = ref({
    id: '',
    tenantId: '',
    organizationId: '',
    documentNo: '',
    documentTypeId: '',
    businessTypeId: '',
    businessDate: '',
    accountingDate: dayjs().format('YYYY-MM-DD'),
    customerId: '',
    salespersonId: null as string | null,
    salesDepartmentId: null as string | null,
    keeperId: null as string | null,
    status: 'draft' as WmsInitialSalesDocument['status'],
    isInitialization: true,
    remark: ''
  })
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  void userStore.ensureDictLoaded('wmsInitialSalesReturnType')
  void userStore.ensureDictLoaded('mdmBusinessOwnerType')
  const stockTypes = computed(() => userStore.getDictMap['wmsInitialStockType'] ?? [])
  const stockStatuses = computed(() => userStore.getDictMap['wmsInitialStockCondition'] ?? [])
  const returnTypes = computed(() => userStore.getDictMap['wmsInitialSalesReturnType'] ?? [])
  const ownerTypes = computed(() => userStore.getDictMap['mdmBusinessOwnerType'] ?? [])
  const taxRates = [0, 1, 3, 6, 9, 13]
  const isReturn = computed(() => ['initial_return', 'return', 'other_return'].includes(props.kind))
  const isInitial = computed(() => props.kind.startsWith('initial_'))
  const title = computed(
    () =>
      ({
        initial_outbound: '期初销售出库单',
        initial_return: '期初销售退货单',
        outbound: '销售出库单',
        return: '销售退货单',
        other_outbound: '其他出库单',
        other_return: '其他出库退回单'
      })[props.kind]
  )
  const statusLabel = computed(
    () => ({ draft: '暂存', submitted: '已提交', approved: '已审核' })[form.value.status]
  )
  const documentTypeMenuName = computed(
    () =>
      ({
        initial_outbound: 'WmsInitialSalesOutbound',
        initial_return: 'WmsInitialSalesReturn',
        outbound: 'WmsSalesOutbound',
        return: 'WmsSalesReturnDocument',
        other_outbound: 'WmsOtherOutbound',
        other_return: 'WmsOtherOutbound'
      })[props.kind]
  )
  const selectedOrganization = computed(() =>
    organizations.value.find((item) => item.id === form.value.organizationId)
  )
  const viewData = computed(() => ({
    documentNo: form.value.documentNo,
    organization:
      currentDocument.value?.organization?.organizationName ||
      selectedOrganization.value?.organizationName ||
      '—',
    organizationCode:
      currentDocument.value?.organization?.organizationCode ||
      selectedOrganization.value?.organizationCode ||
      '—',
    documentType:
      documentTypes.value.find((item) => item.id === form.value.documentTypeId)?.name ||
      title.value,
    businessType:
      businessTypes.value.find((item) => item.id === form.value.businessTypeId)?.name || '—',
    businessDate: form.value.businessDate,
    accountingDate: form.value.accountingDate,
    customer:
      currentDocument.value?.customer?.customerName ||
      customers.value.find((item) => item.id === form.value.customerId)?.name ||
      '—',
    salesDepartment:
      organizations.value.find((item) => item.id === form.value.salesDepartmentId)
        ?.organizationName || '—',
    salesperson:
      currentDocument.value?.salesperson?.employeeName ||
      (form.value.salespersonId ? '已指定' : '未指定'),
    keeper:
      currentDocument.value?.keeper?.employeeName || (form.value.keeperId ? '已指定' : '未指定'),
    initialization: '是',
    remark: form.value.remark || '—'
  }))
  const viewItems: ArtDescriptionItem<typeof viewData.value>[] = [
    { key: 'documentNo', label: '单据编号', field: 'documentNo', copyable: true },
    { key: 'organization', label: '库存组织', field: 'organization' },
    { key: 'organizationCode', label: '组织编码', field: 'organizationCode' },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    { key: 'accountingDate', label: '记账日期', field: 'accountingDate' },
    { key: 'customer', label: '客户', field: 'customer' },
    { key: 'salesDepartment', label: '销售部门', field: 'salesDepartment' },
    { key: 'salesperson', label: '销售员', field: 'salesperson' },
    { key: 'keeper', label: '仓管员', field: 'keeper' },
    { key: 'initialization', label: '初始化单据', field: 'initialization' },
    { key: 'remark', label: '备注', field: 'remark', span: 3 }
  ]
  const currentWarehouses = computed(() =>
    warehouses.value.filter(
      (item) =>
        item.tenantId === form.value.tenantId &&
        item.organizationId === form.value.organizationId &&
        item.status === 'enabled'
    )
  )
  const quantityTotal = computed(() =>
    lines.value.reduce((sum, item) => sum + displayQuantity(item.quantity), 0)
  )
  const totalAmount = computed(() =>
    lines.value.reduce((sum, item) => sum + lineFinancial(item).total, 0)
  )
  function salesLineCellClassName({ column }: { column: { property?: string } }): string {
    return isReturn.value && column.property === 'quantity' ? 'sales-return-quantity-cell' : ''
  }
  const salesUnitOptions = computed(() =>
    units.value.map((item) => ({
      label: `${formatUnitDisplayName(item.unitName)}`,
      value: item.id
    }))
  )
  const headerItems = computed<FormItem[]>(() => [
    {
      key: 'documentNo',
      label: '单据编号',
      type: 'input',
      props: { readonly: true, placeholder: '保存时按月度编号规则生成' }
    },
    {
      key: 'organizationId',
      label: '库存组织',
      type: 'treeSelect',
      options: selectableOrganizationTree.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      labelFn: (item) => `${item.organizationName ?? ''} · ${item.organizationCode ?? ''}`,
      props: {
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        disabled: mode.value === 'view',
        onChange: onOrganizationChange
      }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value
        .filter((item) => item.documentTypeId === form.value.documentTypeId)
        .map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'businessDate',
      label: '业务日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', disabled: mode.value === 'view', class: 'w-full!' }
    },
    {
      key: 'accountingDate',
      label: '记账日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', disabled: true, class: 'w-full!' }
    },
    { key: 'customerId', label: '客户', type: 'input', props: { disabled: mode.value === 'view' } },
    {
      key: 'salespersonId',
      label: '销售员',
      type: 'input',
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'salesDepartmentId',
      label: '销售部门',
      type: 'select',
      options: organizations.value
        .filter((item) => item.tenantId === form.value.tenantId)
        .map((item) => ({ label: item.organizationName, value: item.id })),
      props: { filterable: true, clearable: true, disabled: mode.value === 'view' }
    },
    { key: 'keeperId', label: '仓管员', type: 'input', props: { disabled: mode.value === 'view' } },
    {
      key: 'status',
      label: '单据状态',
      type: 'select',
      options: commonDocumentReviewStatusOptions,
      props: { disabled: true }
    },
    { key: 'isInitialization', label: '初始化单据', type: 'switch', props: { disabled: true } },
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 2,
        maxlength: 500,
        showWordLimit: true,
        disabled: mode.value === 'view'
      }
    }
  ])
  const headerRules = {
    organizationId: [{ required: true, message: '请选择已启用的库存组织', trigger: 'change' }],
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    businessDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
    customerId: [{ required: true, message: '请选择客户', trigger: 'change' }]
  }
  const materialColumns = [
    { prop: 'code', label: '物料编码', width: 165 },
    { prop: 'name', label: '物料描述', minWidth: 220 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 140 }
  ]
  const partyColumns = [
    { prop: 'code', label: '编码', width: 150 },
    { prop: 'name', label: '名称', minWidth: 220 }
  ]
  function round(value: number, digits = 4): number {
    const factor = 10 ** digits
    return Math.round((value + Number.EPSILON) * factor) / factor
  }
  function displayQuantity(value: number): number {
    return isReturn.value ? -Math.abs(Number(value || 0)) : Math.abs(Number(value || 0))
  }
  function returnTypeLabel(value: string | null): string {
    return (
      (
        { return: '退货', replace: '退补货', refund_only: '仅退款不退货' } as Record<string, string>
      )[value || 'return'] || '退货'
    )
  }
  function unitName(id: string | null): string {
    return formatUnitDisplayName(units.value.find((item) => item.id === id)?.unitName, '') || '—'
  }
  function projectName(id: string | null): string {
    return projects.value.find((item) => item.id === id)?.name || '—'
  }
  function conversionFactor(
    material: WmsInitialMaterial | null | undefined,
    unitId: string | null
  ): number | null {
    if (!material || !unitId) return null
    if (unitId === material.baseUnitId) return 1
    const entry = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
    return entry && entry.sourceFactor > 0 ? entry.baseFactor / entry.sourceFactor : null
  }
  function baseQuantity(line: WmsInitialSalesLine): number {
    const inventoryFactor = conversionFactor(line.material, line.inventoryUnitId)
    const baseFactor = conversionFactor(line.material, line.baseUnitId)
    return inventoryFactor && baseFactor
      ? round((Math.abs(Number(line.quantity || 0)) * inventoryFactor) / baseFactor)
      : 0
  }
  function auxQuantity(line: WmsInitialSalesLine, unitId: string | null): string {
    const inventoryFactor = conversionFactor(line.material, line.inventoryUnitId)
    const auxFactor = conversionFactor(line.material, unitId)
    return inventoryFactor && auxFactor
      ? round((Math.abs(Number(line.quantity || 0)) * inventoryFactor) / auxFactor).toString()
      : '—'
  }
  function lineFinancial(line: WmsInitialSalesLine): {
    discount: number
    amount: number
    tax: number
    total: number
  } {
    if (line.gift) return { discount: 0, amount: 0, tax: 0, total: 0 }
    const quantity = displayQuantity(line.quantity)
    const rate = line.discountMethod === 'none' ? 0 : Number(line.unitDiscountRate || 0)
    const discount = round(quantity * Number(line.taxInclusiveUnitPrice || 0) * rate, 2)
    const amount = round(quantity * Number(line.unitPrice || 0) - discount, 2)
    const tax = round((quantity * Number(line.unitPrice || 0) * Number(line.taxRate || 0)) / 100, 2)
    return { discount, amount, tax, total: round(amount + tax, 2) }
  }
  function updatePrice(line: WmsInitialSalesLine, basis: 'untaxed' | 'taxed'): void {
    line.priceBasis = basis
    const factor = 1 + Number(line.taxRate || 0) / 100
    if (basis === 'taxed') line.unitPrice = round(Number(line.taxInclusiveUnitPrice || 0) / factor)
    else line.taxInclusiveUnitPrice = round(Number(line.unitPrice || 0) * factor)
  }
  function materialFromRow(row: DataSelectRecord): WmsInitialMaterial | null {
    if (typeof row.id !== 'string' || typeof row.code !== 'string' || typeof row.name !== 'string')
      return null
    return {
      id: row.id,
      tenantId: form.value.tenantId,
      code: row.code,
      name: row.name,
      description: typeof row.description === 'string' ? row.description : null,
      specificationModel:
        typeof row.specificationModel === 'string' ? row.specificationModel : null,
      inventoryUnitId: typeof row.inventoryUnitId === 'string' ? row.inventoryUnitId : null,
      baseUnitId: typeof row.baseUnitId === 'string' ? row.baseUnitId : null,
      auxiliaryUnitId: typeof row.auxiliaryUnitId === 'string' ? row.auxiliaryUnitId : null,
      auxiliaryUnit2Id: typeof row.auxiliaryUnit2Id === 'string' ? row.auxiliaryUnit2Id : null,
      unitConversions: Array.isArray(row.unitConversions) ? row.unitConversions : [],
      serialManagementEnabled: row.serialManagementEnabled === true
    }
  }
  function makeLine(material: WmsInitialMaterial): WmsInitialSalesLine {
    return {
      lineNo: (lines.value.length + 1) * 10,
      returnType: isReturn.value ? 'return' : null,
      materialId: material.id,
      material,
      projectId: null,
      constructionNo: null,
      gift: false,
      inventoryUnitId: material.inventoryUnitId || '',
      quantity: 0,
      baseUnitId: material.baseUnitId,
      baseQuantity: 0,
      unitPrice: 0,
      taxInclusiveUnitPrice: 0,
      priceBasis: 'untaxed',
      taxRate: 13,
      discountMethod: 'none',
      unitDiscountRate: 0,
      discountAmount: 0,
      amount: 0,
      taxAmount: 0,
      totalAmount: 0,
      batchNo: null,
      warehouseId: null,
      binId: null,
      stockType: 'normal',
      ownerType: 'self',
      ownerId: null,
      stockStatus: 'available',
      keeperId: form.value.keeperId,
      auxiliaryUnitId: material.auxiliaryUnitId,
      auxiliaryQuantity: null,
      auxiliaryUnit2Id: material.auxiliaryUnit2Id,
      auxiliaryQuantity2: null,
      productionDate: null,
      expiryDate: null,
      trackingNo: null,
      sourceDocument: null,
      sourceLineNo: null,
      remark: null,
      serialNos: []
    }
  }
  function renumber(): void {
    lines.value.forEach((line, index) => {
      line.lineNo = (index + 1) * 10
    })
  }
  function addMaterials(_ids: unknown, rows: DataSelectRecord[]): void {
    lines.value.push(
      ...rows
        .map(materialFromRow)
        .filter((row): row is WmsInitialMaterial => row !== null)
        .map(makeLine)
    )
    renumber()
    materialPickerIds.value = []
    materialPickerRows.value = []
  }
  function copyLine(index: number): void {
    lines.value.splice(index + 1, 0, cloneDeep(lines.value[index]))
    renumber()
  }
  function removeLine(index: number): void {
    lines.value.splice(index, 1)
    renumber()
  }
  function lineIndex(line: WmsInitialSalesLine): number {
    return lines.value.findIndex((item) => item.lineNo === line.lineNo)
  }
  function onLineMoreAction(item: ButtonMoreItem, line: WmsInitialSalesLine): void {
    const index = lineIndex(line)
    if (index < 0) return
    if (item.key === 'copy-line') copyLine(index)
    else if (item.key === 'delete-line') removeLine(index)
  }
  function onSalespersonSelected(rows: EmployeeIntegrationItem[]): void {
    selectedSalesperson.value = rows
    if (rows[0]?.organizationId) form.value.salesDepartmentId = rows[0].organizationId
  }
  function onInlineProjectChange(line: WmsInitialSalesLine, projectId: string | null): void {
    line.projectId = projectId
    line.constructionNo = null
  }
  async function onInlineWarehouseChange(line: WmsInitialSalesLine): Promise<void> {
    line.binId = null
    await loadInlineBins(line)
  }
  async function loadInlineBins(line: WmsInitialSalesLine): Promise<void> {
    bins.value = line.warehouseId ? await fetchWmsBins(line.warehouseId) : []
  }
  function onInlineOwnerTypeChange(line: WmsInitialSalesLine): void {
    line.ownerId = null
  }
  function onInlineOwnerChange(line: WmsInitialSalesLine, ownerId: string | null): void {
    line.ownerId = ownerId
  }
  const serialList = computed(() => parseSerialNumberText(serialText.value))
  const serialEntryVisible = computed({
    get: () => false,
    set: (value: boolean) => {
      if (value) {
        serialEntryForm.serialText = serialText.value
        void serialEntryDialogRef.value?.handleOpen(undefined, {
          title: '录入序列号',
          showFooter: mode.value !== 'view',
          confirmText: '保存序列号',
          onConfirm: () => {
            serialText.value = serialEntryForm.serialText
            if (serialLine.value) serialLine.value.serialNos = serialList.value
            return true
          }
        })
      }
    }
  })
  const serialViewVisible = computed({
    get: () => false,
    set: (value: boolean) => {
      if (value) void serialViewDialogRef.value?.handleOpen(undefined, { title: '查看序列号' })
    }
  })
  async function importSerials(file: File): Promise<void> {
    try {
      const serials = parseSerialNumberText(await file.text())
      if (!serials.length) {
        ElMessage.warning('文件中没有可用的序列号，请检查文件内容后重试')
        return
      }
      serialText.value = serials.join('\n')
      if (serialLine.value) serialLine.value.serialNos = serials
      ElMessage.success(`已导入 ${serials.length} 个序列号`)
    } catch (error) {
      notifyFriendlyError(error, '序列号文件读取失败，请重新选择文件')
    }
  }
  function openInlineSerials(line: WmsInitialSalesLine): void {
    serialLine.value = line
    serialText.value = line.serialNos.join('\n')
    serialEntryVisible.value = mode.value !== 'view'
    if (mode.value === 'view') serialViewVisible.value = true
  }
  function materialApi(params: DataSelectFetchParams) {
    return fetchWmsInitialMaterials({
      tenantId: form.value.tenantId,
      keyword: params.keyword || '',
      current: params.page,
      size: params.pageSize
    })
  }
  async function loadTenantOptions(tenantId: string): Promise<void> {
    const [unitRows, documentRows, businessRows, projectRows, supplierRows, customerRows] =
      await Promise.all([
        fetchWmsUnitOptions(tenantId),
        fetchWmsInitialDocumentTypes(tenantId, documentTypeMenuName.value),
        fetchWmsInitialOptions('mdm_business_type', tenantId),
        fetchWmsInitialOptions('mdm_project', tenantId),
        fetchWmsInitialOptions('mdm_supplier', tenantId),
        fetchWmsInitialOptions('mdm_customer', tenantId)
      ])
    units.value = unitRows
    documentTypes.value =
      props.kind === 'other_return'
        ? documentRows.filter((item) => item.name.includes('退回'))
        : props.kind === 'other_outbound'
          ? documentRows.filter((item) => !item.name.includes('退回'))
          : documentRows
    businessTypes.value = businessRows
    projects.value = projectRows
    suppliers.value = supplierRows
    customers.value = customerRows
    if (!documentTypes.value.some((item) => item.id === form.value.documentTypeId))
      form.value.documentTypeId = documentTypes.value.find((item) => item.isDefault)?.id || ''
    if (!form.value.businessTypeId)
      form.value.businessTypeId =
        businessRows.find((item) => item.documentTypeId === form.value.documentTypeId)?.id || ''
  }
  async function onOrganizationChange(): Promise<void> {
    const org = selectedOrganization.value
    form.value.tenantId = org?.tenantId || ''
    form.value.businessDate = isInitial.value
      ? org?.enabledOn
        ? (dayjs().isAfter(org.enabledOn, 'day')
            ? dayjs(org.enabledOn).subtract(1, 'day')
            : dayjs()
          ).format('YYYY-MM-DD')
        : ''
      : dayjs().format('YYYY-MM-DD')
    form.value.documentTypeId = ''
    form.value.businessTypeId = ''
    form.value.customerId = ''
    form.value.salespersonId = null
    form.value.salesDepartmentId = null
    lines.value = []
    selectedCustomer.value = []
    selectedSalesperson.value = []
    if (form.value.tenantId) await loadTenantOptions(form.value.tenantId)
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [orgPage, warehouseRows, organizationResult] = await Promise.all([
        fetchWmsInventoryOrganizations({ current: 1, size: 2000 }),
        fetchWmsWarehouses(),
        fetchEnabledOrganizationTree({ tenantId: form.value.tenantId })
      ])
      organizations.value = orgPage.data
      warehouses.value = warehouseRows
      organizationTree.value = organizationResult.data ?? []
      if (form.value.tenantId) await loadTenantOptions(form.value.tenantId)
    } catch {
      optionError.value = true
    }
  }
  function onImportError(): void {
    ElMessage.error('导入失败，请检查 Excel 文件格式')
  }
  async function importLines(rows: Array<Record<string, unknown>>): Promise<void> {
    try {
      let imported = 0
      for (const row of rows.slice(0, 500)) {
        const code = String(row['物料编码'] || row.materialCode || '').trim()
        if (!code) continue
        const result = await fetchWmsInitialMaterials({
          tenantId: form.value.tenantId,
          keyword: code,
          current: 1,
          size: 20
        })
        const material = result.data.find((item) => item.code === code)
        if (!material) continue
        const line = makeLine(material)
        line.quantity = Math.abs(Number(row['数量'] || row.quantity || 0))
        line.unitPrice = Number(row['单价(元)'] || row.unitPrice || 0)
        line.taxRate = Number(row['税率(%)'] || row.taxRate || 13)
        line.taxInclusiveUnitPrice = round(line.unitPrice * (1 + line.taxRate / 100))
        line.batchNo = String(row['批号'] || row.batchNo || '') || null
        lines.value.push(line)
        imported++
      }
      renumber()
      if (imported) ElMessage.success(`已导入 ${imported} 行，请逐行核对仓储与价格信息`)
      else ElMessage.warning('未找到匹配的物料编码，请检查模板和当前租户物料')
    } catch {
      ElMessage.error('导入失败，请检查 Excel 文件格式')
    }
  }
  async function save(): Promise<boolean> {
    if (optionError.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (
        isInitial.value &&
        (!selectedOrganization.value?.enabledOn ||
          form.value.businessDate > selectedOrganization.value.enabledOn)
      ) {
        ElMessage.warning('业务日期不得晚于库存组织启用日期')
        return false
      }
      if (!lines.value.length) {
        ElMessage.warning('请至少添加一行物料')
        return false
      }
      const incomplete = lines.value.find(
        (line) => !line.inventoryUnitId || Math.abs(Number(line.quantity)) <= 0 || !line.stockType
      )
      if (incomplete) {
        ElMessage.warning(`第 ${incomplete.lineNo} 行尚未填写必填信息`)
        return false
      }
      for (const line of lines.value) {
        if (line.projectId && !line.constructionNo?.trim()) {
          ElMessage.warning(`第 ${line.lineNo} 行选择项目后请填写施工号`)
          return false
        }
        if (line.ownerType !== 'self' && !line.ownerId) {
          ElMessage.warning(`第 ${line.lineNo} 行请选择货主`)
          return false
        }
        const serials = line.serialNos
        if (
          line.material?.serialManagementEnabled &&
          (Math.abs(Number(line.quantity)) !== serials.length ||
            new Set(serials).size !== serials.length)
        ) {
          ElMessage.warning(`第 ${line.lineNo} 行序列号数量须与物料数量一致且不能重复`)
          return false
        }
        line.quantity = Math.abs(Number(line.quantity))
        line.baseQuantity = baseQuantity(line)
        const money = lineFinancial(line)
        line.discountAmount = money.discount
        line.amount = money.amount
        line.taxAmount = money.tax
        line.totalAmount = money.total
      }
      await saveWmsInitialSalesDocument({
        id: mode.value === 'edit' ? form.value.id : undefined,
        tenantId: form.value.tenantId,
        organizationId: form.value.organizationId,
        kind: props.kind,
        documentTypeId: form.value.documentTypeId,
        businessTypeId: form.value.businessTypeId,
        businessDate: form.value.businessDate,
        customerId: form.value.customerId,
        salespersonId: form.value.salespersonId,
        salesDepartmentId: form.value.salesDepartmentId,
        keeperId: form.value.keeperId,
        isInitialization: props.kind === 'return' ? true : isInitial.value,
        remark: normalizeNullableText(form.value.remark),
        lines: lines.value
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '期初销售提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: OpenData): Promise<void> {
    mode.value = data.mode
    importIntent.value = Boolean(data.importIntent)
    await drawerRef.value?.handleOpen(data, {
      loading: true,
      loadingText: '正在加载单据资料…',
      showFooter: data.mode !== 'view',
      confirmText: data.mode === 'copy' ? '保存副本' : '保存',
      title:
        data.mode === 'create'
          ? `新增${title.value}`
          : data.mode === 'copy'
            ? `复制${title.value}`
            : data.mode === 'edit'
              ? `编辑${title.value}`
              : `${title.value}详情`,
      subtitle: data.document?.documentNo || '月度三位流水号自动生成',
      onConfirm: save
    })
    try {
      const source =
        data.document ??
        (data.documentId ? await fetchWmsInitialSalesDocument(data.documentId) : undefined)
      currentDocument.value = source ?? null
      Object.assign(form.value, {
        id: data.mode === 'edit' ? source?.id || '' : '',
        tenantId: source?.tenantId || '',
        organizationId: source?.organizationId || '',
        documentNo: data.mode === 'copy' ? '' : source?.documentNo || '',
        documentTypeId: source?.documentTypeId || '',
        businessTypeId: source?.businessTypeId || '',
        businessDate: source?.businessDate || '',
        accountingDate: source?.accountingDate || dayjs().format('YYYY-MM-DD'),
        customerId: source?.customerId || '',
        salespersonId: source?.salespersonId || null,
        salesDepartmentId: source?.salesDepartmentId || null,
        keeperId: source?.keeperId || null,
        status: data.mode === 'copy' ? 'draft' : source?.status || 'draft',
        isInitialization: props.kind === 'return' ? true : isInitial.value,
        remark: source?.remark || ''
      })
      if (data.mode === 'copy' && source?.kind !== props.kind) {
        form.value.documentTypeId = ''
        form.value.businessTypeId = ''
      }
      lines.value = source ? cloneDeep(source.lines) : []
      selectedCustomer.value = []
      selectedSalesperson.value = []
      selectedKeeper.value = []
      await loadOptions()
      drawerRef.value?.setOptions({ subtitle: source?.documentNo || '月度三位流水号自动生成' })
    } finally {
      drawerRef.value?.setLoading(false)
    }
  }
  defineExpose({ handleOpen })
</script>

<style scoped>
  .initialization-document-stack {
    display: grid;
    gap: 20px;
    align-content: start;
  }

  .sales-return-quantity {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }

  :deep(td.el-table__cell.sales-return-quantity-cell) {
    background-color: var(--el-color-warning-light-9) !important;
  }
</style>
