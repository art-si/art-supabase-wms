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
                <ArtSvgIcon icon="ri:add-line" />添加物料
              </ElButton>
            </template>
          </ArtTableMultipleSelect>
        </template>
        <ElScrollbar v-if="lines.length">
          <ArtTable
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            row-key="lineNo"
            table-layout="fixed"
          >
            <template #material="{ row }">
              <strong class="block truncate text-sm">{{ row.material?.name || '物料' }}</strong>
              <small class="text-[var(--el-text-color-secondary)]">{{
                row.material?.code || row.materialId
              }}</small>
            </template>
            <template #openingQuantity="{ row }">
              <strong class="tabular-nums">{{ row.openingQuantity || '待录入' }}</strong>
            </template>
            <template #yearlyOpeningQuantity="{ row }">{{ yearlyOpening(row) }}</template>
            <template #warehouseId="{ row }">{{
              row.warehouse?.name || warehouseName(row.warehouseId)
            }}</template>
            <template #amount="{ row }">{{ lineAmount(row).toFixed(2) }}</template>
            <template #operation="{ row }">
              <ArtButtonTable
                :type="mode === 'view' ? 'view' : 'edit'"
                :icon="mode === 'view' ? 'ri:eye-line' : 'ri:edit-line'"
                :label="mode === 'view' ? '查看' : '编辑'"
                :permission="mode === 'view' ? 'WmsInitialStock:View' : lineEditPermission"
                @click="openLine(lineIndex(row))"
              />
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

  <ArtDialog ref="lineDialogRef" size="lg" :show-footer="mode !== 'view'">
    <div v-if="editLine" class="min-w-0 space-y-5">
      <ArtEntitySummary
        icon="ri:package-2-line"
        eyebrow="MATERIAL LINE"
        :title="`${editLine.material?.name || '物料'} · 第 ${editLine.lineNo} 行`"
        :description="`${editLine.material?.code || ''} · ${editLine.material?.specificationModel || '无规格型号'}`"
      />
      <template v-if="mode === 'view'">
        <ArtSectionCard title="数量与核算" subtitle="期初余额、年度变化和辅助数量">
          <ArtDescriptions :data="editLine" :items="lineQuantityItems" :columns="3" />
        </ArtSectionCard>
        <ArtSectionCard title="仓储与货权" subtitle="仓库、仓位、库存类型与货主">
          <ArtDescriptions :data="editLine" :items="lineStorageItems" :columns="3" />
        </ArtSectionCard>
        <ArtSectionCard title="批次追溯" subtitle="生产、有效期、来源和序列号">
          <ArtDescriptions :data="editLine" :items="lineTraceItems" :columns="3" />
        </ArtSectionCard>
      </template>
      <template v-else>
        <ArtSectionCard title="数量与核算" subtitle="年初数量与辅助数量由系统自动计算。">
          <ArtForm
            v-model="editLine"
            :items="lineQuantityFormItems"
            :rules="lineQuantityRules"
            :span="6"
            :gutter="16"
            label-position="top"
            :show-reset="false"
            :show-submit="false"
          >
            <template #projectId>
              <ArtTableSingleSelect
                :model-value="editLine.projectId || undefined"
                :selected-data="selectedProject"
                :data="projects"
                :columns="projectColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择销售项目"
                placeholder="选择项目"
                @update:model-value="editLine.projectId = String($event || '') || null"
                @update:selected-data="onProjectSelected"
              />
            </template>
          </ArtForm>
          <div
            class="grid gap-3 rounded-xl bg-[var(--el-fill-color-light)] p-4 text-sm sm:grid-cols-4"
          >
            <span
              >辅助单位<strong class="block">{{ unitName(editLine.auxiliaryUnitId) }}</strong></span
            >
            <span
              >期初辅助数量<strong class="block tabular-nums">{{
                auxQuantity(editLine, editLine.openingQuantity)
              }}</strong></span
            >
            <span
              >年收入辅助数<strong class="block tabular-nums">{{
                auxQuantity(editLine, editLine.yearlyReceivedQuantity)
              }}</strong></span
            >
            <span
              >年发出辅助数<strong class="block tabular-nums">{{
                auxQuantity(editLine, editLine.yearlyIssuedQuantity)
              }}</strong></span
            >
          </div>
        </ArtSectionCard>
        <ArtSectionCard title="仓储与货权" subtitle="仓位随所选仓库过滤；仓管员默认继承表头。">
          <ArtForm
            v-model="editLine"
            :items="lineStorageFormItems"
            :rules="lineStorageRules"
            :span="6"
            :gutter="16"
            label-position="top"
            :show-reset="false"
            :show-submit="false"
          >
            <template #ownerId>
              <ArtTableSingleSelect
                v-if="editLine.ownerType !== 'self'"
                :model-value="editLine.ownerId || undefined"
                :selected-data="selectedOwner"
                :data="editLine.ownerType === 'supplier' ? suppliers : customers"
                :columns="ownerColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择货主"
                @update:model-value="editLine.ownerId = String($event || '') || null"
                @update:selected-data="selectedOwner = $event"
              />
              <span v-else>自有</span>
            </template>
            <template #keeperId>
              <ArtEmployeeSelect
                :model-value="editLine.keeperId || undefined"
                :selected-data="selectedLineKeeper"
                :tenant-id="form.tenantId || undefined"
                title="选择行仓管员"
                @update:model-value="editLine.keeperId = $event || null"
                @update:selected-data="selectedLineKeeper = $event"
              />
            </template>
          </ArtForm>
        </ArtSectionCard>
        <ArtSectionCard title="批次追溯" subtitle="序列号物料须逐件录入 SN，一行一个。">
          <ArtForm
            v-model="editLine"
            :items="lineTraceFormItems"
            :span="6"
            :gutter="16"
            label-position="top"
            :show-reset="false"
            :show-submit="false"
          >
            <template #serialNos>
              <ElInput
                v-model="serialText"
                type="textarea"
                :rows="4"
                placeholder="每行一个 SN，与期初数量一致"
              />
            </template>
          </ArtForm>
        </ArtSectionCard>
      </template>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
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
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
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
  import { fetchGetEnableOrganizationTree } from '@/api/system-manage'
  import type { ColumnOption } from '@/types'
  import {
    fetchWmsBins,
    fetchWmsInitialMaterials,
    fetchWmsInitialOptions,
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
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const lineDialogRef = ref<ArtDialogExpose>()
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
    { prop: 'lineNo', label: '行号', width: 68 },
    { prop: 'material', label: '物料', minWidth: 220, useSlot: true },
    { prop: 'material.specificationModel', label: '规格型号', minWidth: 130 },
    { prop: 'openingQuantity', label: '期初数量', width: 110, align: 'right', useSlot: true },
    { prop: 'yearlyOpeningQuantity', label: '年初数量', width: 110, align: 'right', useSlot: true },
    { prop: 'warehouseId', label: '入库仓库', minWidth: 150, useSlot: true },
    { prop: 'batchNo', label: '批号', minWidth: 130 },
    { prop: 'amount', label: '金额(元)', width: 125, align: 'right', useSlot: true },
    { prop: 'operation', label: '操作', width: 112, fixed: 'right', useSlot: true }
  ]
  const materialPickerIds = ref<string[]>([])
  const materialPickerRows = ref<DataSelectRecord[]>([])
  const selectedKeeper = ref<EmployeeIntegrationItem[]>([])
  const selectedLineKeeper = ref<EmployeeIntegrationItem[]>([])
  const selectedProject = ref<DataSelectRecord[]>([])
  const selectedOwner = ref<DataSelectRecord[]>([])
  const editLine = ref<WmsInitialStockLine>()
  const editingIndex = ref(-1)
  const serialText = ref('')
  const form = reactive({
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
    organizations.value.find((item) => item.id === form.organizationId)
  )
  const viewData = computed(() => ({
    documentNo: form.documentNo,
    organization:
      currentDocument.value?.organization?.organizationName ||
      selectedOrganization.value?.organizationName ||
      '—',
    organizationCode:
      currentDocument.value?.organization?.organizationCode ||
      selectedOrganization.value?.organizationCode ||
      '—',
    documentType:
      documentTypes.value.find((item) => item.id === form.documentTypeId)?.name ||
      '标准初始化库存单',
    businessType:
      businessTypes.value.find((item) => item.id === form.businessTypeId)?.name || '初始化库存',
    businessDate: form.businessDate,
    accountingDate: form.accountingDate,
    keeper: currentDocument.value?.keeper?.employeeName || (form.keeperId ? '已指定' : '未指定'),
    currency: currencies.value.find((item) => item.value === form.currencyCode)?.label || '人民币',
    amountEntry: form.amountEntryEnabled ? '启用' : '未启用',
    remark: form.remark || '—'
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
  const lineQuantityItems: ArtDescriptionItem<WmsInitialStockLine>[] = [
    {
      key: 'project',
      label: '项目名称',
      value: (line: WmsInitialStockLine) =>
        line.project?.name || projects.value.find((item) => item.id === line.projectId)?.name || '—'
    },
    { key: 'constructionNo', label: '施工号', field: 'constructionNo' },
    { key: 'gift', label: '赠品', value: (line: WmsInitialStockLine) => (line.gift ? '是' : '否') },
    {
      key: 'inventoryUnit',
      label: '库存单位',
      value: (line: WmsInitialStockLine) =>
        line.inventoryUnit?.unitName || unitName(line.inventoryUnitId)
    },
    {
      key: 'openingQuantity',
      label: '期初数量',
      value: (line: WmsInitialStockLine) => Number(line.openingQuantity).toFixed(4)
    },
    {
      key: 'baseUnit',
      label: '基本单位',
      value: (line: WmsInitialStockLine) => unitName(line.baseUnitId)
    },
    {
      key: 'baseQuantity',
      label: '基本数量',
      value: (line: WmsInitialStockLine) => baseQuantity(line).toFixed(4)
    },
    {
      key: 'yearlyOpeningQuantity',
      label: '年初数量',
      value: (line: WmsInitialStockLine) => yearlyOpening(line).toFixed(4)
    },
    {
      key: 'yearlyReceivedQuantity',
      label: '年收入数量',
      value: (line: WmsInitialStockLine) => Number(line.yearlyReceivedQuantity).toFixed(4)
    },
    {
      key: 'yearlyIssuedQuantity',
      label: '年发出数量',
      value: (line: WmsInitialStockLine) => Number(line.yearlyIssuedQuantity).toFixed(4)
    },
    {
      key: 'unitPrice',
      label: '单价(元)',
      value: (line: WmsInitialStockLine) => Number(line.unitPrice).toFixed(4)
    },
    {
      key: 'amount',
      label: '金额(元)',
      value: (line: WmsInitialStockLine) => lineAmount(line).toFixed(2)
    },
    {
      key: 'auxiliaryUnit',
      label: '辅助单位',
      value: (line: WmsInitialStockLine) => unitName(line.auxiliaryUnitId)
    },
    {
      key: 'openingAuxQuantity',
      label: '期初辅助数量',
      value: (line: WmsInitialStockLine) => auxQuantity(line, line.openingQuantity)
    },
    {
      key: 'yearlyReceivedAuxQuantity',
      label: '年收入辅助数',
      value: (line: WmsInitialStockLine) => auxQuantity(line, line.yearlyReceivedQuantity)
    },
    {
      key: 'yearlyIssuedAuxQuantity',
      label: '年发出辅助数',
      value: (line: WmsInitialStockLine) => auxQuantity(line, line.yearlyIssuedQuantity)
    }
  ]
  const lineStorageItems: ArtDescriptionItem<WmsInitialStockLine>[] = [
    {
      key: 'warehouse',
      label: '入库仓库',
      value: (line: WmsInitialStockLine) => line.warehouse?.name || warehouseName(line.warehouseId)
    },
    {
      key: 'bin',
      label: '入库仓位',
      value: (line: WmsInitialStockLine) =>
        line.bin?.binName || bins.value.find((item) => item.id === line.binId)?.binName || '—'
    },
    {
      key: 'stockType',
      label: '入库库存类型',
      field: 'stockType',
      dictCode: 'wmsInitialStockType'
    },
    {
      key: 'stockStatus',
      label: '库存状态',
      field: 'stockStatus',
      dictCode: 'wmsInitialStockCondition'
    },
    { key: 'ownerType', label: '货主类型', field: 'ownerType', dictCode: 'mdmBusinessOwnerType' },
    {
      key: 'owner',
      label: '货主',
      value: (line: WmsInitialStockLine) =>
        line.ownerType === 'self'
          ? '自有'
          : (line.ownerType === 'supplier' ? suppliers.value : customers.value).find(
              (item) => item.id === line.ownerId
            )?.name || '已指定'
    },
    { key: 'batchNo', label: '批号', field: 'batchNo', copyable: true },
    { key: 'inboundDate', label: '入库日期', field: 'inboundDate' },
    {
      key: 'keeper',
      label: '仓管员',
      value: (line: WmsInitialStockLine) =>
        line.keeperId === form.keeperId
          ? viewData.value.keeper
          : line.keeperId
            ? '已指定'
            : '未指定'
    }
  ]
  const lineTraceItems: ArtDescriptionItem<WmsInitialStockLine>[] = [
    { key: 'productionDate', label: '生产日期', field: 'productionDate' },
    { key: 'expiryDate', label: '有效期至', field: 'expiryDate' },
    { key: 'trackingNo', label: '跟踪号', field: 'trackingNo', copyable: true },
    { key: 'sourceDocument', label: '源单据', field: 'sourceDocument' },
    {
      key: 'serialNos',
      label: '序列号',
      value: (line: WmsInitialStockLine) => line.serialNos.join('、') || '—',
      span: 2
    },
    { key: 'remark', label: '备注', field: 'remark', span: 3 }
  ]
  const currentWarehouses = computed(() =>
    warehouses.value.filter(
      (item) =>
        item.tenantId === form.tenantId &&
        item.organizationId === form.organizationId &&
        item.status === 'enabled'
    )
  )
  const openingTotal = computed(() =>
    lines.value.reduce((sum, item) => sum + Number(item.openingQuantity || 0), 0)
  )
  const unitOptions = computed(() =>
    units.value.map((item) => ({ label: `${item.unitName} · ${item.unitCode}`, value: item.id }))
  )
  const lineQuantityFormItems = computed<FormItem[]>(() => [
    { key: 'projectId', label: '项目名称', type: 'input' },
    {
      key: 'constructionNo',
      label: '施工号',
      type: 'input',
      props: { disabled: !editLine.value?.projectId, placeholder: '选择项目后填写' }
    },
    { key: 'gift', label: '赠品', type: 'switch' },
    {
      key: 'inventoryUnitId',
      label: '库存单位',
      type: 'select',
      options: unitOptions.value,
      props: { filterable: true }
    },
    {
      key: 'openingQuantity',
      label: '期初数量',
      type: 'number',
      props: { min: 0, precision: 4, controlsPosition: 'right' }
    },
    {
      key: 'baseUnitId',
      label: '基本单位',
      type: 'select',
      options: unitOptions.value,
      props: { filterable: true }
    },
    {
      key: 'baseQuantity',
      label: '基本数量',
      type: 'text',
      props: { formatter: () => (editLine.value ? baseQuantity(editLine.value) : '—') }
    },
    {
      key: 'yearlyOpeningQuantity',
      label: '年初数量',
      type: 'text',
      props: { formatter: () => (editLine.value ? yearlyOpening(editLine.value) : '—') }
    },
    {
      key: 'yearlyReceivedQuantity',
      label: '年收入数量',
      type: 'number',
      props: { min: 0, precision: 4 }
    },
    {
      key: 'yearlyIssuedQuantity',
      label: '年发出数量',
      type: 'number',
      props: { min: 0, precision: 4 }
    },
    { key: 'unitPrice', label: '单价(元)', type: 'number', props: { min: 0, precision: 4 } },
    {
      key: 'amount',
      label: '金额(元)',
      type: 'number',
      props: { min: 0, precision: 2, disabled: !form.amountEntryEnabled || !!editLine.value?.gift }
    }
  ])
  const lineQuantityRules = {
    inventoryUnitId: [{ required: true, message: '请选择库存单位', trigger: 'change' }],
    openingQuantity: [{ required: true, message: '请填写期初数量', trigger: 'change' }]
  }
  const lineStorageFormItems = computed<FormItem[]>(() => [
    {
      key: 'warehouseId',
      label: '入库仓库',
      type: 'select',
      options: currentWarehouses.value.map((item) => ({
        label: `${item.warehouseName} · ${item.warehouseCode}`,
        value: item.id
      })),
      props: { filterable: true, onChange: onWarehouseChange }
    },
    {
      key: 'binId',
      label: '入库仓位',
      type: 'select',
      options: bins.value.map((item) => ({
        label: `${item.binName} · ${item.binCode}`,
        value: item.id
      })),
      props: { filterable: true, clearable: true, disabled: !editLine.value?.warehouseId }
    },
    { key: 'stockType', label: '入库库存类型', type: 'select', options: stockTypes.value },
    { key: 'stockStatus', label: '库存状态', type: 'select', options: stockStatuses.value },
    {
      key: 'ownerType',
      label: '货主类型',
      type: 'select',
      options: ownerTypes.value,
      props: {
        onChange: () => {
          if (editLine.value) editLine.value.ownerId = null
        }
      }
    },
    { key: 'ownerId', label: '货主', type: 'input' },
    {
      key: 'batchNo',
      label: '批号',
      type: 'input',
      props: { maxlength: 80, placeholder: '留空时按单据与行号生成' }
    },
    {
      key: 'inboundDate',
      label: '入库日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
    },
    { key: 'keeperId', label: '仓管员', type: 'input' }
  ])
  const lineStorageRules = {
    warehouseId: [{ required: true, message: '请选择入库仓库', trigger: 'change' }],
    stockType: [{ required: true, message: '请选择库存类型', trigger: 'change' }]
  }
  const lineTraceFormItems = computed<FormItem[]>(() => [
    {
      key: 'productionDate',
      label: '生产日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
    },
    {
      key: 'expiryDate',
      label: '有效期至',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
    },
    { key: 'trackingNo', label: '跟踪号', type: 'input', props: { maxlength: 100 } },
    { key: 'sourceDocument', label: '源单据', type: 'input', props: { maxlength: 80 } },
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    },
    {
      key: 'serialNos',
      label: '序列号',
      type: 'input',
      span: 24,
      hidden: !editLine.value?.material?.serialManagementEnabled
    }
  ])
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
        .filter((item) => item.code === 'WMS_INITIAL_STOCK')
        .map((item) => ({ label: item.name, value: item.id })),
      props: { disabled: mode.value === 'view' }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value
        .filter((item) => item.documentTypeId === form.documentTypeId)
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
      : form.amountEntryEnabled
        ? Number(line.amount || 0)
        : Math.round(Number(line.unitPrice || 0) * Number(line.openingQuantity || 0) * 100) / 100
  }
  async function materialApi(params: DataSelectFetchParams) {
    if (!form.tenantId) return { data: [], total: 0 }
    return fetchWmsInitialMaterials({
      tenantId: form.tenantId,
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
      tenantId: form.tenantId,
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
      keeperId: form.keeperId,
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
  function onProjectSelected(rows: DataSelectRecord[]): void {
    selectedProject.value = rows
    if (editLine.value && !rows.length) editLine.value.constructionNo = null
  }
  async function onWarehouseChange(): Promise<void> {
    if (!editLine.value) return
    editLine.value.binId = null
    bins.value = editLine.value.warehouseId ? await fetchWmsBins(editLine.value.warehouseId) : []
  }
  async function openLine(index: number): Promise<void> {
    editingIndex.value = index
    editLine.value = cloneDeep(lines.value[index])
    serialText.value = editLine.value.serialNos.join('\n')
    selectedProject.value = editLine.value.project ? [editLine.value.project] : []
    selectedOwner.value = []
    bins.value = []
    await lineDialogRef.value?.handleOpen(undefined, {
      title: mode.value === 'view' ? '物料明细' : '编辑物料明细',
      subtitle: `第 ${editLine.value.lineNo} 行`,
      showFooter: mode.value !== 'view',
      confirmText: '保存明细',
      onConfirm: () => {
        if (!editLine.value) return false
        const line = editLine.value
        if (
          !line.inventoryUnitId ||
          Number(line.openingQuantity) <= 0 ||
          !line.warehouseId ||
          !line.stockType
        ) {
          ElMessage.warning('请填写库存单位、期初数量、入库仓库和库存类型')
          return false
        }
        if (yearlyOpening(line) < 0) {
          ElMessage.warning('年初数量不能小于零')
          return false
        }
        if (line.projectId && !line.constructionNo?.trim()) {
          ElMessage.warning('选择项目后请填写施工号')
          return false
        }
        if (line.ownerType !== 'self' && !line.ownerId) {
          ElMessage.warning('请选择货主')
          return false
        }
        const serials = serialText.value
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean)
        if (
          line.material?.serialManagementEnabled &&
          serials.length !== Number(line.openingQuantity)
        ) {
          ElMessage.warning('SN 件数必须与期初数量一致')
          return false
        }
        line.serialNos = serials
        line.baseQuantity = baseQuantity(line)
        line.yearlyOpeningQuantity = yearlyOpening(line)
        line.amount = lineAmount(line)
        lines.value[editingIndex.value] = cloneDeep(line)
        return true
      }
    })
    if (editLine.value.warehouseId) {
      bins.value = await fetchWmsBins(editLine.value.warehouseId)
    }
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
    if (!form.documentTypeId)
      form.documentTypeId = documentRows.find((item) => item.code === 'WMS_INITIAL_STOCK')?.id ?? ''
    if (!form.businessTypeId)
      form.businessTypeId =
        businessRows.find((item) => item.documentTypeId === form.documentTypeId)?.id ?? ''
  }
  async function onOrganizationChange(): Promise<void> {
    const organization = selectedOrganization.value
    form.tenantId = organization?.tenantId ?? ''
    form.businessDate = organization?.enabledOn
      ? (dayjs().isAfter(organization.enabledOn, 'day')
          ? dayjs(organization.enabledOn).subtract(1, 'day')
          : dayjs()
        ).format('YYYY-MM-DD')
      : ''
    form.documentTypeId = ''
    form.businessTypeId = ''
    lines.value = []
    if (form.tenantId) await loadTenantOptions(form.tenantId)
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [orgPage, warehouseRows, organizationResult] = await Promise.all([
        fetchWmsInventoryOrganizations({ current: 1, size: 2000 }),
        fetchWmsWarehouses(),
        fetchGetEnableOrganizationTree({ tenantId: form.tenantId })
      ])
      organizations.value = orgPage.data
      warehouses.value = warehouseRows
      organizationTree.value = organizationResult.data ?? []
      if (form.tenantId) await loadTenantOptions(form.tenantId)
    } catch {
      optionError.value = true
    }
  }
  async function save(): Promise<boolean> {
    if (optionError.value) return false
    try {
      await formRef.value?.validate()
      if (
        !selectedOrganization.value?.enabledOn ||
        form.businessDate > selectedOrganization.value.enabledOn
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
      await saveWmsInitialStock({
        id: mode.value === 'edit' ? form.id : undefined,
        tenantId: form.tenantId,
        organizationId: form.organizationId,
        documentTypeId: form.documentTypeId,
        businessTypeId: form.businessTypeId,
        businessDate: form.businessDate,
        keeperId: form.keeperId,
        remark: normalizeNullableText(form.remark),
        currencyCode: form.currencyCode,
        amountEntryEnabled: form.amountEntryEnabled,
        lines: lines.value
      })
      emit('success')
      return true
    } catch {
      return false
    }
  }
  async function handleOpen(data: OpenData): Promise<void> {
    mode.value = data.mode
    const source = data.document
    currentDocument.value = source ?? null
    Object.assign(form, {
      id: data.mode === 'edit' ? (source?.id ?? '') : '',
      tenantId: source?.tenantId ?? '',
      organizationId: source?.organizationId ?? '',
      documentNo: data.mode === 'copy' ? '' : (source?.documentNo ?? ''),
      documentTypeId: source?.documentTypeId ?? '',
      businessTypeId: source?.businessTypeId ?? '',
      businessDate: source?.businessDate ?? '',
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
