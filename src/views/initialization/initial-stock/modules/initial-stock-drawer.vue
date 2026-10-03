<template>
  <ArtDrawer ref="drawerRef" size="88%" :show-footer="mode !== 'view'">
    <div class="initialization-document-stack min-w-0">
      <ArtEntitySummary
        icon="ri:archive-drawer-line"
        eyebrow="OPENING INVENTORY DOCUMENT"
        :title="form.documentNo || (mode === 'copy' ? '复制初始库存单' : '新增初始库存单')"
        :description="
          mode === 'view'
            ? '查看单据表头与物料明细'
            : '填写表头，选择物料，再逐行核对数量、仓位与货权。'
        "
      >
        <template #aside>
          <ElTag
            :type="
              form.status === 'approved'
                ? 'success'
                : form.status === 'submitted'
                  ? 'warning'
                  : 'info'
            "
          >
            {{
              form.status === 'approved'
                ? '已审核'
                : form.status === 'submitted'
                  ? '已提交'
                  : '暂存'
            }}
          </ElTag>
        </template>
      </ArtEntitySummary>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon>
        基础资料加载失败，请重试后再保存。
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ElAlert v-else type="info" :closable="false" show-icon>
        业务日期不得晚于所选库存组织的启用日期；初始库存单审核后将生成在库批次和库存流水。
      </ElAlert>
      <ElAlert
        v-if="
          !optionError &&
          form.tenantId &&
          !documentTypes.some((item) => item.enabled && item.menuIds?.includes(initialStockMenuId))
        "
        type="warning"
        :closable="false"
        show-icon
      >
        当前租户没有关联“初始库存单”菜单功能的已启用单据类型，请先在主数据中配置。
      </ElAlert>
      <ArtSectionCard title="单据表头" subtitle="编号保存时自动生成；记账日期由系统记录。">
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
          <template #keeperId>
            <ArtEmployeeSelect
              :model-value="form.keeperId || undefined"
              :selected-data="selectedKeeper"
              :tenant-id="form.tenantId || undefined"
              title="选择仓管员"
              placeholder="从员工花名册选择"
              :disabled="!form.tenantId"
              @update:model-value="form.keeperId = $event || null"
              @update:selected-data="selectedKeeper = $event"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ArtSectionCard
        title="物料明细"
        :subtitle="`共 ${lines.length} 行 · 期初数量 ${openingTotal}`"
        :empty="lines.length === 0"
        empty-title="尚未选择物料"
        empty-description="从物料编码中多选后，逐行填写期初数量、仓库和库存类型。"
      >
        <template #actions>
          <div class="flex flex-wrap items-center gap-2">
            <ArtTableMultipleSelect
              v-if="mode !== 'view' && form.tenantId"
              v-model="materialPickerIds"
              v-model:selected-data="materialPickerRows"
              title="选择期初物料"
              subtitle="支持按物料编码、名称或描述检索，可一次添加多行。"
              placeholder="添加物料明细"
              search-placeholder="搜索物料编码或描述"
              row-key="id"
              label-key="name"
              description-key="code"
              :columns="materialColumns"
              :api-fn="materialApi"
              @confirm="addMaterials"
            >
              <template #trigger="{ open }">
                <ElButton type="primary" @click="open">
                  <ArtSvgIcon icon="ri:add-line" />新增
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ElButton :disabled="selectedLines.length !== 1" @click="copySelectedLine"
              >复制</ElButton
            >
            <ElButton :disabled="selectedLines.length !== 1" @click="openSelectedLine"
              >编制</ElButton
            >
            <ElButton :disabled="!selectedLines.length" @click="deleteSelectedLines">删除</ElButton>
            <ElButton
              :disabled="
                selectedLines.length !== 1 || !selectedLines[0]?.material?.serialManagementEnabled
              "
              @click="openSelectedLine"
              >序列号</ElButton
            >
          </div>
        </template>
        <ElScrollbar v-if="lines.length">
          <ArtTable
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            row-key="lineNo"
            table-layout="fixed"
            @selection-change="onLineSelectionChange"
          >
            <template #material="{ row }">
              <strong class="block truncate text-sm">{{ row.material?.name || '物料' }}</strong>
              <small class="text-[var(--el-text-color-secondary)]">{{
                row.material?.code || row.materialId
              }}</small>
            </template>
            <template #projectId="{ row }">
              <ArtTableSingleSelect
                v-if="mode !== 'view'"
                :model-value="row.projectId || undefined"
                :selected-data="row.project ? [row.project] : []"
                :data="projects"
                :columns="projectColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择项目"
                clearable
                @update:model-value="onInlineProjectChange(row, String($event || '') || null)"
                @update:selected-data="row.project = $event[0] || null"
              />
              <span v-else>{{ row.project?.name || '—' }}</span>
            </template>
            <template #constructionNo="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.constructionNo"
                :disabled="!row.projectId"
                placeholder="施工号"
              /><span v-else>{{ row.constructionNo || '—' }}</span></template
            >
            <template #gift="{ row }"
              ><ElSwitch v-if="mode !== 'view'" v-model="row.gift" /><span v-else>{{
                row.gift ? '是' : '否'
              }}</span></template
            >
            <template #inventoryUnitId="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.inventoryUnitId" filterable
                ><ElOption
                  v-for="unit in unitOptions"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value" /></ElSelect
              ><span v-else>{{ unitName(row.inventoryUnitId) }}</span></template
            >
            <template #openingQuantity="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.openingQuantity"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
              /><strong v-else class="tabular-nums">{{ row.openingQuantity }}</strong></template
            >
            <template #baseUnitId="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.baseUnitId" filterable
                ><ElOption
                  v-for="unit in unitOptions"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value" /></ElSelect
              ><span v-else>{{ unitName(row.baseUnitId) }}</span></template
            >
            <template #baseQuantity="{ row }">{{ baseQuantity(row) }}</template>
            <template #yearlyOpeningQuantity="{ row }">{{ yearlyOpening(row) }}</template>
            <template #yearlyReceivedQuantity="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.yearlyReceivedQuantity"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
              /><span v-else>{{ row.yearlyReceivedQuantity }}</span></template
            >
            <template #yearlyIssuedQuantity="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.yearlyIssuedQuantity"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
              /><span v-else>{{ row.yearlyIssuedQuantity }}</span></template
            >
            <template #auxiliaryUnitId="{ row }">{{ unitName(row.auxiliaryUnitId) }}</template>
            <template #openingAuxQuantity="{ row }">{{
              auxQuantity(row, row.openingQuantity)
            }}</template>
            <template #unitPrice="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.unitPrice"
                :min="0"
                :precision="4"
                :controls="false"
                class="w-full!"
              /><span v-else>{{ row.unitPrice }}</span></template
            >
            <template #amount="{ row }"
              ><ElInputNumber
                v-if="mode !== 'view' && form.amountEntryEnabled && !row.gift"
                v-model="row.amount"
                :min="0"
                :precision="2"
                :controls="false"
                class="w-full!"
              /><span v-else>{{ lineAmount(row).toFixed(2) }}</span></template
            >
            <template #warehouseId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.warehouseId"
                filterable
                @change="onInlineWarehouseChange(row)"
                ><ElOption
                  v-for="warehouse in currentWarehouses"
                  :key="warehouse.id"
                  :label="`${warehouse.warehouseName} · ${warehouse.warehouseCode}`"
                  :value="warehouse.id" /></ElSelect
              ><span v-else>{{
                row.warehouse?.name || warehouseName(row.warehouseId)
              }}</span></template
            >
            <template #binId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.binId"
                filterable
                clearable
                :disabled="!row.warehouseId"
                @visible-change="($event) => $event && loadInlineBins(row)"
                ><ElOption
                  v-for="bin in bins"
                  :key="bin.id"
                  :label="`${bin.binName} · ${bin.binCode}`"
                  :value="bin.id" /></ElSelect
              ><span v-else>{{ row.bin?.binName || row.binId || '—' }}</span></template
            >
            <template #stockType="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.stockType"
                ><ElOption
                  v-for="option in stockTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{ row.stockType }}</span></template
            >
            <template #stockStatus="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.stockStatus"
                ><ElOption
                  v-for="option in stockStatuses"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{ row.stockStatus }}</span></template
            >
            <template #ownerType="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.ownerType" @change="row.ownerId = null"
                ><ElOption
                  v-for="option in ownerTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{ row.ownerType }}</span></template
            >
            <template #ownerId="{ row }"
              ><ArtTableSingleSelect
                v-if="mode !== 'view' && row.ownerType !== 'self'"
                :model-value="row.ownerId || undefined"
                :data="row.ownerType === 'supplier' ? suppliers : customers"
                :columns="ownerColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择货主"
                @update:model-value="row.ownerId = String($event || '') || null"
              /><span v-else>{{
                row.ownerType === 'self' ? '自有' : row.ownerId || '—'
              }}</span></template
            >
            <template #batchNo="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.batchNo" placeholder="自动生成" /><span
                v-else
                >{{ row.batchNo || '—' }}</span
              ></template
            >
            <template #inboundDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.inboundDate"
                type="date"
                value-format="YYYY-MM-DD"
                class="w-full!"
              /><span v-else>{{ row.inboundDate || '—' }}</span></template
            >
            <template #keeperId="{ row }"
              ><ArtEmployeeSelect
                v-if="mode !== 'view'"
                :model-value="row.keeperId || undefined"
                :tenant-id="form.tenantId || undefined"
                title="选择行仓管员"
                @update:model-value="row.keeperId = $event || null"
              /><span v-else>{{ row.keeperId || '—' }}</span></template
            >
            <template #productionDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.productionDate"
                type="date"
                value-format="YYYY-MM-DD"
                class="w-full!"
              /><span v-else>{{ row.productionDate || '—' }}</span></template
            >
            <template #expiryDate="{ row }"
              ><ElDatePicker
                v-if="mode !== 'view'"
                v-model="row.expiryDate"
                type="date"
                value-format="YYYY-MM-DD"
                class="w-full!"
              /><span v-else>{{ row.expiryDate || '—' }}</span></template
            >
            <template #trackingNo="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.trackingNo" /><span v-else>{{
                row.trackingNo || '—'
              }}</span></template
            >
            <template #sourceDocument="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.sourceDocument" /><span v-else>{{
                row.sourceDocument || '—'
              }}</span></template
            >
            <template #remark="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.remark" /><span v-else>{{
                row.remark || '—'
              }}</span></template
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

  <ArtDialog ref="serialDialogRef" size="sm" :show-footer="mode !== 'view'">
    <ElInput
      v-model="serialText"
      type="textarea"
      :rows="10"
      :readonly="mode === 'view'"
      placeholder="每行一个序列号"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import dayjs from 'dayjs'
  import { cloneDeep } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
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
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import type { ColumnOption } from '@/types'
  import {
    fetchWmsBins,
    fetchWmsInitialMaterials,
    fetchWmsInitialOptions,
    fetchWmsInitialStockMenuId,
    fetchWmsInventoryOrganizations,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    saveWmsInitialStock,
    type WmsBin,
    type WmsInitialMaterial,
    type WmsInitialStockDocument,
    type WmsInitialStockLine,
    type WmsInitializationOption,
    type WmsInventoryOrganization,
    type WmsUnitOption,
    type WmsWarehouse
  } from '@wms/api'

  type OpenMode = 'create' | 'copy' | 'edit' | 'view'
  interface OpenData {
    mode: OpenMode
    document?: WmsInitialStockDocument
  }
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const serialDialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const mode = ref<OpenMode>('create')
  const currentDocument = shallowRef<WmsInitialStockDocument | null>(null)
  const optionError = ref(false)
  const organizations = ref<WmsInventoryOrganization[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const units = ref<WmsUnitOption[]>([])
  const documentTypes = ref<WmsInitializationOption[]>([])
  const businessTypes = ref<WmsInitializationOption[]>([])
  const projects = ref<WmsInitializationOption[]>([])
  const suppliers = ref<WmsInitializationOption[]>([])
  const customers = ref<WmsInitializationOption[]>([])
  const bins = ref<WmsBin[]>([])
  const lines = ref<WmsInitialStockLine[]>([])
  const selectedLines = ref<WmsInitialStockLine[]>([])
  const initialStockMenuId = ref('')
  const selectableOrganizationTree = computed(() => {
    const selectableIds = new Set(
      organizations.value
        .filter((item) => item.enabledOn && !item.initializationClosedAt)
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
  const lineEditPermission = computed(() =>
    mode.value === 'create'
      ? 'WmsInitialStock:Add'
      : mode.value === 'copy'
        ? 'WmsInitialStock:Copy'
        : 'WmsInitialStock:Edit'
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
  const lineColumns: ColumnOption<WmsInitialStockLine>[] = [
    { type: 'selection', width: 48, fixed: 'left' },
    { prop: 'lineNo', label: '行号', width: 68 },
    { prop: 'material', label: '物料', minWidth: 220, useSlot: true },
    { prop: 'material.specificationModel', label: '规格型号', minWidth: 130 },
    { prop: 'projectId', label: '项目', width: 170, useSlot: true },
    { prop: 'constructionNo', label: '施工号', width: 150, useSlot: true },
    { prop: 'gift', label: '赠品', width: 80, useSlot: true },
    { prop: 'inventoryUnitId', label: '库存单位', width: 135, useSlot: true },
    { prop: 'openingQuantity', label: '期初数量', width: 135, align: 'right', useSlot: true },
    { prop: 'baseUnitId', label: '基本单位', width: 135, useSlot: true },
    { prop: 'baseQuantity', label: '基本数量', width: 110, useSlot: true },
    { prop: 'yearlyOpeningQuantity', label: '年初数量', width: 110, useSlot: true },
    { prop: 'yearlyReceivedQuantity', label: '年收入数量', width: 135, useSlot: true },
    { prop: 'yearlyIssuedQuantity', label: '年发出数量', width: 135, useSlot: true },
    { prop: 'auxiliaryUnitId', label: '辅助单位', width: 110, useSlot: true },
    { prop: 'openingAuxQuantity', label: '期初辅助数量', width: 120, useSlot: true },
    { prop: 'unitPrice', label: '单价', width: 130, useSlot: true },
    { prop: 'amount', label: '金额(元)', width: 135, align: 'right', useSlot: true },
    { prop: 'warehouseId', label: '入库仓库', width: 180, useSlot: true },
    { prop: 'binId', label: '仓位', width: 150, useSlot: true },
    { prop: 'stockType', label: '库存类型', width: 130, useSlot: true },
    { prop: 'stockStatus', label: '库存状态', width: 130, useSlot: true },
    { prop: 'ownerType', label: '货主类型', width: 130, useSlot: true },
    { prop: 'ownerId', label: '货主', width: 170, useSlot: true },
    { prop: 'batchNo', label: '批号', width: 150, useSlot: true },
    { prop: 'inboundDate', label: '入库日期', width: 165, useSlot: true },
    { prop: 'keeperId', label: '仓管员', width: 170, useSlot: true },
    { prop: 'productionDate', label: '生产日期', width: 165, useSlot: true },
    { prop: 'expiryDate', label: '有效期至', width: 165, useSlot: true },
    { prop: 'trackingNo', label: '跟踪号', width: 150, useSlot: true },
    { prop: 'sourceDocument', label: '源单据', width: 150, useSlot: true },
    { prop: 'remark', label: '备注', width: 180, useSlot: true },
    { prop: 'operation', label: '操作', width: 135, fixed: 'right', useSlot: true }
  ]
  const materialPickerIds = ref<string[]>([])
  const materialPickerRows = ref<DataSelectRecord[]>([])
  const selectedKeeper = ref<EmployeeIntegrationItem[]>([])
  const serialText = ref('')
  const form = ref({
    id: '',
    tenantId: '',
    organizationId: '',
    documentNo: '',
    documentTypeId: '',
    businessTypeId: '',
    businessDate: '',
    accountingDate: dayjs().format('YYYY-MM-DD'),
    keeperId: null as string | null,
    status: 'draft' as WmsInitialStockDocument['status'],
    remark: '',
    currencyCode: 'CNY',
    amountEntryEnabled: false
  })
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  void userStore.ensureDictLoaded('mdmBusinessOwnerType')
  void userStore.ensureDictLoaded('mdmCurrency')
  const stockTypes = computed(() => userStore.getDictMap['wmsInitialStockType'] ?? [])
  const stockStatuses = computed(() => userStore.getDictMap['wmsInitialStockCondition'] ?? [])
  const ownerTypes = computed(() => userStore.getDictMap['mdmBusinessOwnerType'] ?? [])
  const currencies = computed(() => userStore.getDictMap['mdmCurrency'] ?? [])
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
      '标准初始化库存单',
    businessType:
      businessTypes.value.find((item) => item.id === form.value.businessTypeId)?.name ||
      '初始化库存',
    businessDate: form.value.businessDate,
    accountingDate: form.value.accountingDate,
    keeper:
      currentDocument.value?.keeper?.employeeName || (form.value.keeperId ? '已指定' : '未指定'),
    currency:
      currencies.value.find((item) => item.value === form.value.currencyCode)?.label || '人民币',
    amountEntry: form.value.amountEntryEnabled ? '启用' : '未启用',
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
    { key: 'keeper', label: '仓管员', field: 'keeper' },
    { key: 'currency', label: '币种', field: 'currency' },
    { key: 'amountEntry', label: '录入金额', field: 'amountEntry' },
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
  const openingTotal = computed(() =>
    lines.value.reduce((sum, item) => sum + Number(item.openingQuantity || 0), 0)
  )
  const unitOptions = computed(() =>
    units.value.map((item) => ({ label: `${item.unitName} · ${item.unitCode}`, value: item.id }))
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
      options: documentTypes.value
        .filter((item) => item.enabled && item.menuIds?.includes(initialStockMenuId.value))
        .map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view', onChange: onDocumentTypeChange }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value
        .filter(
          (item) =>
            item.enabled &&
            item.documentTypeId === form.value.documentTypeId &&
            item.menuIds?.includes(initialStockMenuId.value)
        )
        .map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'businessDate',
      label: '业务日期',
      type: 'date',
      props: {
        valueFormat: 'YYYY-MM-DD',
        disabled: mode.value === 'view',
        placeholder: '选择业务日期',
        class: 'w-full!'
      }
    },
    {
      key: 'accountingDate',
      label: '记账日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', disabled: true, class: 'w-full!' }
    },
    { key: 'keeperId', label: '仓管员', type: 'input', props: { disabled: mode.value === 'view' } },
    {
      key: 'currencyCode',
      label: '币种',
      type: 'select',
      options: currencies.value.map((item) => ({ label: item.label, value: item.value })),
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'amountEntryEnabled',
      label: '录入金额',
      type: 'switch',
      props: { disabled: mode.value === 'view' }
    },
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
    businessDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }]
  }
  const materialColumns = [
    { prop: 'code', label: '物料编码', width: 170 },
    { prop: 'name', label: '物料描述', minWidth: 220 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 140 }
  ]
  const projectColumns = [
    { prop: 'code', label: '项目编码', width: 150 },
    { prop: 'name', label: '项目名称', minWidth: 200 }
  ]
  const ownerColumns = [
    { prop: 'code', label: '编码', width: 150 },
    { prop: 'name', label: '名称', minWidth: 220 }
  ]
  function unitName(id: string | null): string {
    return units.value.find((item) => item.id === id)?.unitName ?? '—'
  }
  function warehouseName(id: string): string {
    return warehouses.value.find((item) => item.id === id)?.warehouseName ?? '待选择'
  }
  function yearlyOpening(
    line: Pick<
      WmsInitialStockLine,
      'openingQuantity' | 'yearlyReceivedQuantity' | 'yearlyIssuedQuantity'
    >
  ): number {
    return (
      Number(line.openingQuantity || 0) -
      Number(line.yearlyReceivedQuantity || 0) +
      Number(line.yearlyIssuedQuantity || 0)
    )
  }
  function conversionFactor(
    material: WmsInitialMaterial | null | undefined,
    unitId: string | null
  ): number | null {
    if (!material || !unitId) return null
    if (unitId === material.baseUnitId) return 1
    const item = material.unitConversions.find((entry) => entry.sourceUnitId === unitId)
    return item && item.sourceFactor > 0 ? item.baseFactor / item.sourceFactor : null
  }
  function baseQuantity(line: WmsInitialStockLine): number {
    const inventoryFactor = conversionFactor(line.material, line.inventoryUnitId)
    const baseFactor = conversionFactor(line.material, line.baseUnitId)
    return inventoryFactor && baseFactor
      ? Math.round(((Number(line.openingQuantity || 0) * inventoryFactor) / baseFactor) * 10000) /
          10000
      : 0
  }
  function auxQuantity(line: WmsInitialStockLine, quantity: number): string {
    const inventoryFactor = conversionFactor(line.material, line.inventoryUnitId)
    const auxFactor = conversionFactor(line.material, line.auxiliaryUnitId)
    return inventoryFactor && auxFactor
      ? (
          Math.round(((Number(quantity || 0) * inventoryFactor) / auxFactor) * 10000) / 10000
        ).toString()
      : '—'
  }
  function lineAmount(
    line: Pick<WmsInitialStockLine, 'gift' | 'amount' | 'unitPrice' | 'openingQuantity'>
  ): number {
    return line.gift
      ? 0
      : form.value.amountEntryEnabled
        ? Number(line.amount || 0)
        : Math.round(Number(line.unitPrice || 0) * Number(line.openingQuantity || 0) * 100) / 100
  }
  async function materialApi(params: DataSelectFetchParams) {
    if (!form.value.tenantId) return { data: [], total: 0 }
    return fetchWmsInitialMaterials({
      tenantId: form.value.tenantId,
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
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
  function makeLine(material: WmsInitialMaterial): WmsInitialStockLine {
    return {
      lineNo: (lines.value.length + 1) * 10,
      materialId: material.id,
      material,
      projectId: null,
      constructionNo: null,
      gift: false,
      unitPrice: 0,
      amount: 0,
      inventoryUnitId: material.inventoryUnitId ?? '',
      openingQuantity: 0,
      baseUnitId: material.baseUnitId,
      baseQuantity: 0,
      yearlyOpeningQuantity: 0,
      yearlyReceivedQuantity: 0,
      yearlyIssuedQuantity: 0,
      batchNo: null,
      inboundDate: null,
      warehouseId: '',
      binId: null,
      stockType: 'normal',
      ownerType: 'self',
      ownerId: null,
      stockStatus: 'available',
      keeperId: form.value.keeperId,
      auxiliaryUnitId: material.auxiliaryUnitId,
      openingAuxQuantity: null,
      yearlyOpeningAuxQuantity: null,
      yearlyReceivedAuxQuantity: null,
      yearlyIssuedAuxQuantity: null,
      productionDate: null,
      expiryDate: null,
      trackingNo: null,
      sourceDocument: null,
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
    const materials = rows
      .map(materialFromRow)
      .filter((row): row is WmsInitialMaterial => row !== null)
    lines.value.push(...materials.map(makeLine))
    renumber()
    materialPickerIds.value = []
    materialPickerRows.value = []
  }
  function copyLine(index: number): void {
    lines.value.splice(index + 1, 0, cloneDeep(lines.value[index]))
    renumber()
  }
  function onLineSelectionChange(rows: WmsInitialStockLine[]): void {
    selectedLines.value = rows
  }
  function copySelectedLine(): void {
    const index = selectedLines.value[0] ? lineIndex(selectedLines.value[0]) : -1
    if (index >= 0) copyLine(index)
    selectedLines.value = []
  }
  function openSelectedLine(): void {
    if (selectedLines.value[0]) void openInlineSerials(selectedLines.value[0])
  }
  function deleteSelectedLines(): void {
    const selected = new Set(selectedLines.value)
    lines.value = lines.value.filter((line) => !selected.has(line))
    selectedLines.value = []
    renumber()
  }
  function removeLine(index: number): void {
    lines.value.splice(index, 1)
    renumber()
  }
  function lineIndex(line: WmsInitialStockLine): number {
    return lines.value.findIndex((item) => item.lineNo === line.lineNo)
  }
  function onLineMoreAction(item: ButtonMoreItem, line: WmsInitialStockLine): void {
    const index = lineIndex(line)
    if (index < 0) return
    if (item.key === 'copy-line') copyLine(index)
    else if (item.key === 'delete-line') removeLine(index)
  }
  function onInlineProjectChange(line: WmsInitialStockLine, projectId: string | null): void {
    line.projectId = projectId
    line.constructionNo = null
  }
  async function onInlineWarehouseChange(line: WmsInitialStockLine): Promise<void> {
    line.binId = null
    await loadInlineBins(line)
  }
  async function loadInlineBins(line: WmsInitialStockLine): Promise<void> {
    bins.value = line.warehouseId ? await fetchWmsBins(line.warehouseId) : []
  }
  async function openInlineSerials(line: WmsInitialStockLine): Promise<void> {
    serialText.value = line.serialNos.join('\n')
    await serialDialogRef.value?.handleOpen(undefined, {
      title: `第 ${line.lineNo} 行序列号`,
      showFooter: mode.value !== 'view',
      confirmText: '保存序列号',
      onConfirm: () => {
        const serials = serialText.value
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean)
        if (
          serials.length !== Number(line.openingQuantity) ||
          new Set(serials).size !== serials.length
        ) {
          ElMessage.warning('SN 件数须与期初数量一致且不能重复')
          return false
        }
        line.serialNos = serials
        return true
      }
    })
  }
  async function loadTenantOptions(tenantId: string): Promise<void> {
    const [unitRows, documentRows, businessRows, projectRows, supplierRows, customerRows] =
      await Promise.all([
        fetchWmsUnitOptions(tenantId),
        fetchWmsInitialOptions('mdm_document_type', tenantId),
        fetchWmsInitialOptions('mdm_business_type', tenantId),
        fetchWmsInitialOptions('mdm_project', tenantId),
        fetchWmsInitialOptions('mdm_supplier', tenantId),
        fetchWmsInitialOptions('mdm_customer', tenantId)
      ])
    units.value = unitRows
    documentTypes.value = documentRows
    businessTypes.value = businessRows
    projects.value = projectRows
    suppliers.value = supplierRows
    customers.value = customerRows
    const availableDocuments = documentRows.filter(
      (item) => item.enabled && item.menuIds?.includes(initialStockMenuId.value)
    )
    if (!availableDocuments.some((item) => item.id === form.value.documentTypeId))
      form.value.documentTypeId = availableDocuments.find((item) => item.isDefault)?.id ?? ''
    onDocumentTypeChange()
  }
  function onDocumentTypeChange(): void {
    const available = businessTypes.value.filter(
      (item) =>
        item.enabled &&
        item.documentTypeId === form.value.documentTypeId &&
        item.menuIds?.includes(initialStockMenuId.value)
    )
    if (!available.some((item) => item.id === form.value.businessTypeId))
      form.value.businessTypeId =
        available.find((item) => item.isDefault)?.id ?? available[0]?.id ?? ''
  }
  async function onOrganizationChange(): Promise<void> {
    const organization = selectedOrganization.value
    form.value.tenantId = organization?.tenantId ?? ''
    form.value.businessDate = dayjs().format('YYYY-MM-DD')
    form.value.documentTypeId = ''
    form.value.businessTypeId = ''
    lines.value = []
    if (form.value.tenantId) await loadTenantOptions(form.value.tenantId)
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const tenantId =
        form.value.tenantId || effectiveTenantId.value || userStore.getUserInfo.tenantId
      const [orgPage, warehouseRows, organizationResult, menuId] = await Promise.all([
        fetchWmsInventoryOrganizations({ current: 1, size: 2000, tenantId }),
        fetchWmsWarehouses(),
        fetchEnabledOrganizationTree({ tenantId }),
        fetchWmsInitialStockMenuId()
      ])
      organizations.value = orgPage.data
      initialStockMenuId.value = menuId
      warehouses.value = warehouseRows
      organizationTree.value = organizationResult.data ?? []
      if (mode.value === 'create' && !form.value.organizationId) {
        const defaultOrganization = orgPage.data.find(
          (item) => item.enabledOn && item.isDefault && !item.initializationClosedAt
        )
        if (defaultOrganization) {
          form.value.organizationId = defaultOrganization.id
          await onOrganizationChange()
        }
      }
      if (form.value.tenantId) await loadTenantOptions(form.value.tenantId)
    } catch {
      optionError.value = true
    }
  }
  async function save(): Promise<boolean> {
    if (optionError.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (
        !selectedOrganization.value?.enabledOn ||
        form.value.businessDate > selectedOrganization.value.enabledOn
      ) {
        ElMessage.warning('业务日期不得晚于库存组织启用日期')
        return false
      }
      if (!lines.value.length) {
        ElMessage.warning('请至少添加一行物料')
        return false
      }
      const incomplete = lines.value.find(
        (line) =>
          !line.inventoryUnitId ||
          Number(line.openingQuantity) <= 0 ||
          !line.warehouseId ||
          !line.stockType
      )
      if (incomplete) {
        ElMessage.warning(`第 ${incomplete.lineNo} 行尚未填写必填信息`)
        return false
      }
      for (const line of lines.value) {
        if (yearlyOpening(line) < 0) {
          ElMessage.warning(`第 ${line.lineNo} 行年初数量不能小于零`)
          return false
        }
        if (line.projectId && !line.constructionNo?.trim()) {
          ElMessage.warning(`第 ${line.lineNo} 行选择项目后请填写施工号`)
          return false
        }
        if (line.ownerType !== 'self' && !line.ownerId) {
          ElMessage.warning(`第 ${line.lineNo} 行请选择货主`)
          return false
        }
        if (
          line.material?.serialManagementEnabled &&
          (line.serialNos.length !== Number(line.openingQuantity) ||
            new Set(line.serialNos).size !== line.serialNos.length)
        ) {
          ElMessage.warning(`第 ${line.lineNo} 行 SN 件数须与期初数量一致且不能重复`)
          return false
        }
        line.baseQuantity = baseQuantity(line)
        line.yearlyOpeningQuantity = yearlyOpening(line)
        line.amount = lineAmount(line)
      }
      await saveWmsInitialStock({
        id: mode.value === 'edit' ? form.value.id : undefined,
        tenantId: form.value.tenantId,
        organizationId: form.value.organizationId,
        documentTypeId: form.value.documentTypeId,
        businessTypeId: form.value.businessTypeId,
        businessDate: form.value.businessDate,
        keeperId: form.value.keeperId,
        remark: normalizeNullableText(form.value.remark),
        currencyCode: form.value.currencyCode,
        amountEntryEnabled: form.value.amountEntryEnabled,
        lines: lines.value
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '期初库存提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: OpenData): Promise<void> {
    mode.value = data.mode
    const source = data.document
    currentDocument.value = source ?? null
    Object.assign(form.value, {
      id: data.mode === 'edit' ? (source?.id ?? '') : '',
      tenantId: source?.tenantId ?? '',
      organizationId: source?.organizationId ?? '',
      documentNo: data.mode === 'copy' ? '' : (source?.documentNo ?? ''),
      documentTypeId: source?.documentTypeId ?? '',
      businessTypeId: source?.businessTypeId ?? '',
      businessDate: source?.businessDate ?? dayjs().format('YYYY-MM-DD'),
      accountingDate: source?.accountingDate ?? dayjs().format('YYYY-MM-DD'),
      keeperId: source?.keeperId ?? null,
      status: data.mode === 'copy' ? 'draft' : (source?.status ?? 'draft'),
      remark: source?.remark ?? '',
      currencyCode: source?.currencyCode ?? 'CNY',
      amountEntryEnabled: source?.amountEntryEnabled ?? false
    })
    lines.value = source ? cloneDeep(source.lines) : []
    selectedKeeper.value = []
    await drawerRef.value?.handleOpen(data, {
      loading: true,
      loadingText: '正在加载单据资料…',
      showFooter: data.mode !== 'view',
      confirmText: data.mode === 'copy' ? '保存副本' : '保存',
      title:
        data.mode === 'create'
          ? '新增初始库存单'
          : data.mode === 'copy'
            ? '复制初始库存单'
            : data.mode === 'edit'
              ? '编辑初始库存单'
              : '初始库存单详情',
      subtitle: source?.documentNo || '月度三位流水号自动生成',
      onConfirm: save
    })
    try {
      await loadOptions()
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
</style>
