<template>
  <ArtDrawer ref="drawerRef" :size="isMobile ? '100%' : 'xl'" show-fullscreen-button>
    <ArtEmptyState
      v-if="loadError"
      title="单据资料加载失败"
      :description="loadError"
      size="compact"
    >
      <ElButton type="primary" @click="reloadDocument">重新加载</ElButton>
    </ArtEmptyState>
    <div v-else class="space-y-4">
      <ArtEntitySummary
        icon="ri:file-transfer-line"
        eyebrow="TRANSFER REQUEST"
        :title="
          mode === 'view'
            ? form.documentNo || '调拨申请单'
            : mode === 'edit'
              ? '编辑调拨申请单'
              : mode === 'copy'
                ? '复制调拨申请单'
                : '新增调拨申请单'
        "
        description="按月自动生成三位流水号；一张申请单可同时登记多种物料。"
      />
      <ElAlert v-if="openData?.importIntent" type="info" :closable="false" show-icon>
        先核对申请组织和申请日期，再在“物料明细”点击“导入明细”；导入后核对调出、调入组织和仓储信息再保存。
      </ElAlert>
      <ArtSectionCard title="单据表头" subtitle="编号按月生成；审核后可下推调拨业务。">
        <ArtDescriptions
          v-if="mode === 'view'"
          class="document-header-descriptions"
          :data="viewData"
          :items="viewItems"
          :columns="2"
          :label-width="120"
        />
        <ArtForm
          v-else
          ref="formRef"
          v-model="form"
          :items="headerItems"
          :rules="rules"
          :span="12"
          :gutter="20"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #applicantUserId>
            <ArtUserSelect
              :model-value="form.applicantUserId || undefined"
              :options="applicantOptions"
              placeholder="选择申请账号"
              @update:model-value="onApplicantUserChange"
            />
            <p
              v-if="form.applicantId && !form.applicantUserId"
              class="mt-1 text-xs text-[var(--el-text-color-secondary)]"
            >
              历史员工申请人：{{
                documentRows[0]?.applicantName || '未找到员工资料'
              }}；选择账号后替换。
            </p>
          </template>
        </ArtForm>
      </ArtSectionCard>

      <ArtSectionCard
        title="物料明细"
        :subtitle="
          mode === 'view'
            ? `共 ${lines.length} 行；行号按 10 递增。`
            : `共 ${lines.length} 行；导入必填列：物料编码、数量；可选列：批号、备注。`
        "
        :empty="!lines.length"
        empty-title="请选择物料"
        empty-description="支持一次多选物料，编码、规格与默认单位自动带入。"
      >
        <template #actions>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <ArtExcelImport
              v-if="mode !== 'view'"
              v-auth="'WmsTransfer:Import'"
              icon="ri:file-upload-line"
              :context-key="openData"
              :disabled="importing || parsing"
              :button-props="{ type: 'success', plain: true, loading: importing || parsing }"
              @parsing-change="onImportParsing"
              @import-success="importLines"
              @import-error="
                notifyFriendlyError($event, '文件读取失败，请检查 Excel 格式后重新选择')
              "
              >导入明细</ArtExcelImport
            >
            <TransferStockPicker
              class="w-auto!"
              v-if="mode !== 'view'"
              :model-value="selectedStockBatchIds"
              :selected-data="selectedStockBatches"
              :tenant-id="context?.tenantId"
              :projects="projects"
              :units="units"
              multiple
              @update:selected-data="onStockSelected"
            >
              <template #trigger="{ open }">
                <ElButton type="primary" @click="open">
                  <ArtSvgIcon icon="ri:add-line" />添加物料
                </ElButton>
              </template>
            </TransferStockPicker>
          </div>
        </template>
        <ArtTable
          v-if="mode === 'view'"
          :data="documentRows"
          :pagination="false"
          :show-table-header="false"
          row-key="lineId"
          table-layout="fixed"
          class="transfer-line-table"
        >
          <ElTableColumn prop="lineNo" label="行号" width="68" :fixed="isMobile ? false : 'left'" />
          <ElTableColumn label="物料描述" min-width="220" :fixed="isMobile ? false : 'left'">
            <template #default="{ row }">
              <strong class="block whitespace-normal break-words">{{
                row.materialDescription || row.materialName
              }}</strong>
              <small class="text-[var(--el-text-color-secondary)]"
                >{{ row.materialCode }} · {{ row.specificationModel || '无规格' }}</small
              >
            </template>
          </ElTableColumn>
          <ElTableColumn
            prop="projectName"
            label="项目名称"
            min-width="160"
            show-overflow-tooltip
          />
          <ElTableColumn prop="constructionNo" label="施工号" min-width="115" />
          <ElTableColumn prop="inventoryUnitName" label="库存单位" width="140"
            ><template #default="{ row }">{{
              formatUnitDisplayName(row.inventoryUnitName)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="数量" width="160" align="right"
            ><template #default="{ row }"
              ><strong class="whitespace-nowrap tabular-nums">{{
                numberText(row.quantity)
              }}</strong></template
            ></ElTableColumn
          >
          <ElTableColumn prop="baseUnitName" label="基本单位" width="140"
            ><template #default="{ row }">{{
              formatUnitDisplayName(row.baseUnitName)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="基本数量" width="160" align="right"
            ><template #default="{ row }">{{
              numberText(row.baseQuantity)
            }}</template></ElTableColumn
          >
          <ElTableColumn prop="batchNo" label="批号" min-width="120" />
          <ElTableColumn prop="sourceOrganizationName" label="调出组织" min-width="150" />
          <ElTableColumn prop="sourceWarehouseName" label="调出仓库" min-width="150" />
          <ElTableColumn prop="sourceBinName" label="调出仓位" min-width="120" />
          <ElTableColumn prop="targetOrganizationName" label="调入组织" min-width="150" />
          <ElTableColumn prop="targetWarehouseName" label="调入仓库" min-width="150" />
          <ElTableColumn prop="targetBinName" label="调入仓位" min-width="120" />
          <ElTableColumn label="货主类型" width="105"
            ><template #default="{ row }">{{
              ownerTypeLabel(row.ownerType)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="库存类型" width="110"
            ><template #default="{ row }">{{
              stockTypeLabel(row.stockType)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="库存状态" width="105"
            ><template #default="{ row }">{{
              stockStatusLabel(row.stockStatus)
            }}</template></ElTableColumn
          >
          <ElTableColumn label="赠品" width="72" align="center"
            ><template #default="{ row }">{{ row.gift ? '✓' : '—' }}</template></ElTableColumn
          >
          <ElTableColumn prop="auxiliaryUnitName" label="辅助单位" width="140"
            ><template #default="{ row }">{{
              formatUnitDisplayName(row.auxiliaryUnitName)
            }}</template></ElTableColumn
          >
          <ElTableColumn prop="auxiliaryQuantity" label="辅助数量" width="160" align="right" />
          <ElTableColumn prop="auxiliaryUnit2Name" label="辅助单位2" width="110" />
          <ElTableColumn prop="auxiliaryQuantity2" label="辅助数量2" width="160" align="right" />
          <ElTableColumn prop="productionDate" label="生产日期" width="115" />
          <ElTableColumn prop="expiryDate" label="有效期至" width="115" />
          <ElTableColumn prop="trackingNo" label="跟踪号" min-width="125" />
          <ElTableColumn prop="sourceDocument" label="来源单据" min-width="130" />
          <ElTableColumn prop="sourceLineNo" label="源行号" width="95" />
          <ElTableColumn prop="lineRemark" label="备注" min-width="150" show-overflow-tooltip />
        </ArtTable>
        <ArtTable
          v-else
          :data="lines"
          :pagination="false"
          :show-table-header="false"
          row-key="key"
          table-layout="fixed"
          class="transfer-line-table"
        >
          <ElTableColumn label="行号" width="68" :fixed="isMobile ? false : 'left'">
            <template #default="{ $index }">{{ ($index + 1) * 10 }}</template>
          </ElTableColumn>
          <ElTableColumn label="物料描述" min-width="210" :fixed="isMobile ? false : 'left'">
            <template #default="{ row }">
              <strong class="block truncate">{{
                row.material?.description || row.material?.materialName
              }}</strong>
              <small class="text-[var(--el-text-color-secondary)]"
                >{{ row.material?.materialCode }} ·
                {{ row.material?.specificationModel || '无规格' }}</small
              >
            </template>
          </ElTableColumn>
          <ElTableColumn label="项目名称" min-width="170">
            <template #default="{ row }">
              <ElSelect
                v-model="row.projectId"
                clearable
                filterable
                :disabled="false"
                placeholder="选择项目"
                @change="detachStockBatch(row)"
              >
                <ElOption
                  v-for="item in projects"
                  :key="item.id"
                  :label="`${item.projectName} · ${item.projectCode}`"
                  :value="item.id"
                />
              </ElSelect>
            </template>
          </ElTableColumn>
          <ElTableColumn label="施工号" min-width="130"
            ><template #default="{ row }"
              ><ElInput v-model="row.constructionNo" @change="detachStockBatch(row)" /></template
          ></ElTableColumn>
          <ElTableColumn label="库存单位" min-width="140">
            <template #default="{ row }"
              ><ElSelect v-model="row.inventoryUnitId" filterable
                ><ElOption
                  v-for="unit in units"
                  :key="unit.id"
                  :label="formatUnitDisplayName(unit.unitName)"
                  :value="unit.id" /></ElSelect
            ></template>
          </ElTableColumn>
          <ElTableColumn label="数量" min-width="180"
            ><template #default="{ row }"
              ><ElInputNumber
                v-model="row.quantity"
                :min="0.0001"
                :precision="4"
                :controls="false"
                :disabled="false"
                class="w-full!" /></template
          ></ElTableColumn>
          <ElTableColumn label="基本数量" min-width="160"
            ><template #default="{ row }"
              ><span class="whitespace-nowrap tabular-nums">{{
                baseQuantityForLine(row)?.toFixed(4) || '—'
              }}</span></template
            ></ElTableColumn
          >
          <ElTableColumn label="批号" min-width="140"
            ><template #default="{ row }"
              ><ElInput v-model="row.batchNo" @change="detachStockBatch(row)" /></template
          ></ElTableColumn>
          <ElTableColumn label="调出组织 *" min-width="190"
            ><template #default="{ row }"
              ><ElTreeSelect
                v-model="row.sourceOrganizationId"
                :data="organizationSelectTree"
                node-key="id"
                :props="organizationTreeProps"
                filterable
                check-strictly
                default-expand-all
                :render-after-expand="false"
                :disabled="false"
                @change="onSourceOrganizationChange(row)" /></template
          ></ElTableColumn>
          <ElTableColumn label="调出仓库" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.sourceWarehouseId"
                filterable
                :disabled="false"
                @change="onSourceWarehouseChange(row)"
                ><ElOption
                  v-for="item in warehouseOptions(row.sourceOrganizationId)"
                  :key="item.id"
                  :label="item.warehouseName"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="调出仓位" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.sourceBinId"
                clearable
                filterable
                :disabled="!row.sourceWarehouseId"
                @change="detachStockBatch(row)"
                ><ElOption
                  v-for="item in row.sourceBins"
                  :key="item.id"
                  :label="`${item.binCode} · ${item.binName}`"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="调入组织 *" min-width="190"
            ><template #default="{ row }"
              ><ElTreeSelect
                v-model="row.targetOrganizationId"
                :data="organizationSelectTree"
                node-key="id"
                :props="organizationTreeProps"
                filterable
                check-strictly
                default-expand-all
                :render-after-expand="false"
                :disabled="false"
                @change="onTargetOrganizationChange(row)" /></template
          ></ElTableColumn>
          <ElTableColumn label="调入仓库" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.targetWarehouseId"
                filterable
                :disabled="false"
                @change="loadTargetBins(row)"
                ><ElOption
                  v-for="item in warehouseOptions(row.targetOrganizationId)"
                  :key="item.id"
                  :label="item.warehouseName"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="调入仓位" min-width="170"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.targetBinId"
                clearable
                filterable
                :disabled="!row.targetWarehouseId"
                ><ElOption
                  v-for="item in row.targetBins"
                  :key="item.id"
                  :label="`${item.binCode} · ${item.binName}`"
                  :value="item.id" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="货主类型" min-width="155"
            ><template #default="{ row }"
              ><ElSelect
                v-model="row.ownerType"
                :disabled="!!row.stockBatchId"
                @change="row.ownerId = null"
                ><template #label>{{
                  ownerTypes.find((item) => item.value === row.ownerType)?.label || '自有'
                }}</template
                ><ElOption
                  v-for="option in ownerTypes"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="货主" min-width="185">
            <template #default="{ row }">
              <span v-if="row.stockBatchId || row.ownerType === 'self'">{{
                formatWmsOwnerName(row.ownerType, row.ownerId, suppliers, customers)
              }}</span>
              <ArtTableSingleSelect
                v-else
                :model-value="row.ownerId || undefined"
                :data="row.ownerType === 'supplier' ? suppliers : customers"
                :columns="ownerColumns"
                row-key="id"
                label-key="name"
                description-key="code"
                title="选择货主"
                @update:model-value="row.ownerId = String($event || '') || null"
              />
            </template>
          </ElTableColumn>
          <ElTableColumn label="库存类型" min-width="155"
            ><template #default="{ row }"
              ><ElSelect v-model="row.stockType" :disabled="!!row.stockBatchId"
                ><template #label>{{ stockTypeLabel(row.stockType) }}</template
                ><ElOption
                  v-for="item in stockTypes"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="库存状态" min-width="155"
            ><template #default="{ row }"
              ><ElSelect v-model="row.stockStatus" :disabled="!!row.stockBatchId"
                ><template #label
                  ><ArtDictDisplay
                    :value="row.stockStatus"
                    dict-code="wmsStockStatus"
                    display="text" /></template
                ><ElOption
                  v-for="option in stockStatuses"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect></template
          ></ElTableColumn>
          <ElTableColumn label="赠品" width="86" align="center"
            ><template #default="{ row }"><ElCheckbox v-model="row.gift" /></template
          ></ElTableColumn>
          <ElTableColumn label="生产日期" min-width="190"
            ><template #default="{ row }"
              ><ElDatePicker
                v-model="row.productionDate"
                value-format="YYYY-MM-DD"
                :disabled="!!row.stockBatchId" /></template
          ></ElTableColumn>
          <ElTableColumn label="有效期至" min-width="190"
            ><template #default="{ row }"
              ><ElDatePicker
                v-model="row.expiryDate"
                value-format="YYYY-MM-DD"
                :disabled="!!row.stockBatchId" /></template
          ></ElTableColumn>
          <ElTableColumn label="跟踪号" min-width="140"
            ><template #default="{ row }"
              ><ElInput v-model="row.trackingNo" :disabled="!!row.stockBatchId" /></template
          ></ElTableColumn>
          <ElTableColumn label="来源单据" min-width="150"
            ><template #default="{ row }"><ElInput v-model="row.sourceDocument" /></template
          ></ElTableColumn>
          <ElTableColumn label="源行号" min-width="110"
            ><template #default="{ row }"><ElInput v-model="row.sourceLineNo" /></template
          ></ElTableColumn>
          <ElTableColumn label="备注" min-width="160"
            ><template #default="{ row }"><ElInput v-model="row.remark" /></template
          ></ElTableColumn>
          <ElTableColumn label="操作" width="82" :fixed="isMobile ? false : 'right'"
            ><template #default="{ row }"
              ><ElButton link type="danger" @click="removeLine(row.key)">移除</ElButton></template
            ></ElTableColumn
          >
        </ArtTable>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { uniqBy } from 'lodash-es'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { convertWmsMaterialQuantity } from '@/utils/wms/material-quantity'
  import { formatWmsOwnerName } from '@/utils/wms/owner-display'
  import { WMS_STOCK_TYPE_LABELS } from '@/utils/wms/stock-type'
  import { isWmsBusinessTypeAvailable } from '@/utils/wms/business-type'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { useBreakpoints } from '@vueuse/core'
  import dayjs from 'dayjs'
  import { useWarehouseRowBinLoader } from '@/hooks/core/useWarehouseBinOptions'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { ElMessage } from 'element-plus'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { prepareWmsMaterialImport } from '../../../shared/material-import'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtUserSelect from '@/components/core/forms/art-user-select/index.vue'
  import type {
    ArtUserSelectOption,
    ArtUserSelectValue
  } from '@/components/core/forms/art-user-select/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import TransferStockPicker from '../../shared/transfer-stock-picker.vue'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchEnabledOrganizationTree,
    fetchEnabledOrganizationUserList
  } from '@/api/system-manage'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import {
    fetchWmsBins,
    fetchWmsInitialDocumentTypes,
    fetchWmsInitialMenuId,
    fetchWmsInitialOptions,
    fetchWmsInventoryOrganizations,
    fetchWmsMaterialOptions,
    fetchWmsProjects,
    fetchWmsTransferRequest,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    saveWmsTransferRequest,
    type WmsBin,
    type WmsInitializationOption,
    type WmsInventoryOrganization,
    type WmsMaterialOption,
    type WmsProject,
    type WmsTransferRequestRow,
    type WmsTransferStockOption,
    type WmsUnitOption,
    type WmsWarehouse
  } from '@wms/api'

  interface Context {
    tenantId?: string
  }
  interface OpenData extends Context {
    importIntent?: boolean
    mode: 'create' | 'edit' | 'copy' | 'view'
    documentId?: string
  }
  interface DraftLine {
    key: string
    stockBatchId?: string
    stockBatch?: WmsTransferStockOption
    materialId: string
    material: WmsMaterialOption | null
    projectId: string
    constructionNo: string
    inventoryUnitId: string
    quantity: number
    batchNo: string
    sourceOrganizationId: string
    sourceWarehouseId: string
    sourceBinId: string
    sourceBins: WmsBin[]
    targetOrganizationId: string
    targetWarehouseId: string
    targetBinId: string
    targetBins: WmsBin[]
    ownerType: 'self' | 'supplier' | 'customer'
    ownerId: string | null
    stockType: string
    stockStatus: string
    gift: boolean
    productionDate: string
    expiryDate: string
    trackingNo: string
    sourceDocument: string
    sourceLineNo: string
    remark: string
  }
  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const ownerTypeLabels: Record<string, string> = {
    self: '自有',
    supplier: '供应商',
    customer: '客户'
  }
  const ownerTypeDictionary = useDictionaryOptions('mdmBusinessOwnerType')
  const ownerTypes = computed(() =>
    Object.entries(ownerTypeLabels).map(([value, fallback]) => ({
      value,
      label: ownerTypeDictionary.find((item) => item.value === value)?.label || fallback
    }))
  )
  const countStockTypes = useDictionaryOptions('wmsCountStockType')
  const initialStockTypes = useDictionaryOptions('wmsInitialStockType')
  const stockTypes = computed(() => uniqBy([...countStockTypes, ...initialStockTypes], 'value'))
  function stockTypeLabel(value: string): string {
    return (
      stockTypes.value.find((item) => item.value === value)?.label ||
      WMS_STOCK_TYPE_LABELS[value] ||
      value ||
      '—'
    )
  }
  const stockStatuses = useDictionaryOptions('wmsStockStatus')
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const mode = ref<OpenData['mode']>('create')
  const isMobile = useBreakpoints({ sm: 640 }).smaller('sm')
  const loadError = ref('')
  const openData = shallowRef<OpenData>()
  let loadRequest = 0
  const lines = ref<DraftLine[]>([])
  const importing = ref(false)
  const parsing = ref(false)
  const documentRows = ref<WmsTransferRequestRow[]>([])
  const documentTypes = ref<WmsInitializationOption[]>([])
  const businessTypes = ref<WmsInitializationOption[]>([])
  const projects = ref<WmsProject[]>([])
  const units = ref<WmsUnitOption[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const suppliers = ref<WmsInitializationOption[]>([])
  const customers = ref<WmsInitializationOption[]>([])
  const ownerColumns = [
    { prop: 'code', label: '编码', width: 150 },
    { prop: 'name', label: '名称', minWidth: 200 }
  ]
  const organizations = ref<WmsInventoryOrganization[]>([])
  const departmentTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const applicantUsers = ref<Api.SystemManage.OrganizationMember[]>([])
  const applicantOptions = computed<ArtUserSelectOption[]>(() =>
    applicantUsers.value.map((user) => ({
      value: user.id,
      label: user.nickName || user.userName,
      userName: user.userName,
      nickName: user.nickName,
      userEmail: user.userEmail,
      avatar: user.avatar,
      departmentName: user.organization?.organizationName
    }))
  )
  const availableOrganizations = computed(() => organizations.value.filter((row) => row.enabledOn))
  const businessMenuId = ref('')
  type OrganizationSelectNode = WmsInventoryOrganization & {
    organizationLabel: string
  }
  const organizationSelectTree = computed<OrganizationSelectNode[]>(() =>
    availableOrganizations.value.map((node) => ({
      ...node,
      organizationLabel: `${node.organizationName} · ${node.organizationCode}`
    }))
  )
  const organizationTreeProps = {
    value: 'id',
    label: 'organizationLabel',
    children: 'children'
  }
  const form = ref({
    id: '',
    documentNo: '保存后自动生成',
    organizationId: '',
    documentTypeId: '',
    businessTypeId: '',
    applicationDate: dayjs().format('YYYY-MM-DD'),
    applicantId: '',
    applicantUserId: '',
    departmentId: '',
    remark: ''
  })
  const selectedStockBatchIds = computed(() =>
    lines.value.map((row) => row.stockBatchId).filter((id): id is string => Boolean(id))
  )
  const selectedStockBatches = computed(() =>
    lines.value
      .map((row) => row.stockBatch)
      .filter((row): row is WmsTransferStockOption => Boolean(row))
  )
  const stockStatusLabels: Record<string, string> = {
    available: '可用',
    scrap: '报废',
    defective: '不良',
    frozen: '冻结'
  }
  const firstDocumentRow = computed(() => documentRows.value[0])
  const viewData = computed(() => ({
    documentNo: form.value.documentNo,
    organization: organizationLabel(form.value.organizationId),
    documentType:
      firstDocumentRow.value?.documentTypeName ||
      optionName(documentTypes.value, form.value.documentTypeId),
    businessType:
      firstDocumentRow.value?.businessTypeName ||
      optionName(businessTypes.value, form.value.businessTypeId),
    applicationDate: form.value.applicationDate,
    applicant: firstDocumentRow.value?.applicantName || '未指定',
    department:
      firstDocumentRow.value?.departmentName || organizationLabel(form.value.departmentId),
    status: statusLabel(firstDocumentRow.value?.status),
    pushedMode: pushModeLabel(firstDocumentRow.value?.pushedMode),
    remark: form.value.remark || '—'
  }))
  const viewItems: ArtDescriptionItem<typeof viewData.value>[] = [
    { key: 'documentNo', label: '单据编号', field: 'documentNo', copyable: true },
    { key: 'organization', label: '申请组织', field: 'organization' },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    { key: 'applicationDate', label: '申请日期', field: 'applicationDate' },
    { key: 'applicant', label: '申请人', field: 'applicant' },
    { key: 'department', label: '申请部门', field: 'department' },
    { key: 'status', label: '单据状态', field: 'status' },
    { key: 'pushedMode', label: '下推状态', field: 'pushedMode', span: 2 },
    { key: 'remark', label: '备注', field: 'remark', span: 2 }
  ]
  const headerItems = computed<FormItem[]>(() => [
    { key: 'documentNo', label: '单据编号', type: 'input', props: { disabled: true } },
    {
      key: 'organizationId',
      label: '申请组织',
      type: 'treeSelect',
      options: availableOrganizations.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      labelFn: (row) => `${row.organizationName ?? ''} · ${row.organizationCode ?? ''}`,
      props: {
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false
      }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((row) => ({ label: row.name, value: row.id })),
      props: { filterable: true, onChange: selectDefaultBusinessType }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value
        .filter((row) =>
          isWmsBusinessTypeAvailable(row, form.value.documentTypeId, businessMenuId.value)
        )
        .map((row) => ({ label: row.name, value: row.id })),
      props: { filterable: true }
    },
    {
      key: 'applicationDate',
      label: '申请日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
    },
    { key: 'applicantUserId', label: '申请人', type: 'slot' },
    {
      key: 'departmentId',
      label: '申请部门',
      type: 'treeSelect',
      options: departmentTree.value,
      valueField: 'id',
      labelField: 'organizationName',
      childrenField: 'children',
      props: {
        filterable: true,
        clearable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false
      }
    },
    {
      key: 'remark',
      label: '备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    organizationId: [{ required: true, message: '请选择申请组织', trigger: 'change' }],
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    applicationDate: [{ required: true, message: '请选择申请日期', trigger: 'change' }]
  }
  function numberText(value: number | null | undefined): string {
    return Number(value || 0).toFixed(4)
  }
  function baseQuantityForLine(value: unknown): number | null {
    if (
      !value ||
      typeof value !== 'object' ||
      !('material' in value) ||
      !value.material ||
      typeof value.material !== 'object' ||
      !('baseUnitId' in value.material) ||
      !('inventoryUnitId' in value) ||
      typeof value.inventoryUnitId !== 'string' ||
      !('quantity' in value)
    )
      return null
    const row = value as DraftLine
    const baseUnitId = row.material?.baseUnitId
    if (!baseUnitId || !row.inventoryUnitId) return null
    return convertWmsMaterialQuantity(
      row.material || {},
      Number(row.quantity),
      row.inventoryUnitId,
      baseUnitId
    )
  }
  function stockStatusLabel(value: string): string {
    return stockStatusLabels[value] || value || '—'
  }
  function ownerTypeLabel(value: string): string {
    return ownerTypeLabels[value] || value || '—'
  }
  function optionName(options: WmsInitializationOption[], id: string): string {
    return options.find((item) => item.id === id)?.name || '—'
  }
  function organizationLabel(id: string): string {
    const item = organizations.value.find((row) => row.id === id)
    return item ? `${item.organizationName} · ${item.organizationCode}` : '—'
  }
  function statusLabel(value?: string): string {
    return value === 'approved' ? '已审核' : value === 'submitted' ? '已提交' : '暂存'
  }
  function pushModeLabel(value?: string | null): string {
    return value === 'direct'
      ? '已下推直接调拨'
      : value === 'in_transit'
        ? '已下推调出在途'
        : '未下推'
  }
  function warehouseOptions(organizationId: string) {
    return warehouses.value.filter(
      (row) => row.organizationId === organizationId && row.status === 'enabled'
    )
  }
  function defaultApplicantUserId(tenantId?: string): string {
    return tenantId && userStore.getUserInfo.tenantId === tenantId
      ? userStore.getUserInfo.userId || ''
      : ''
  }
  function defaultApplicantDepartmentId(tenantId?: string): string {
    return tenantId && userStore.getUserInfo.tenantId === tenantId
      ? applicantUsers.value.find((user) => user.id === userStore.getUserInfo.userId)
          ?.organizationId ||
          userStore.getUserInfo.hrEmployee?.organizationId ||
          userStore.getUserInfo.organizationId ||
          ''
      : ''
  }
  function onApplicantUserChange(value: ArtUserSelectValue): void {
    const userId = typeof value === 'string' ? value : ''
    form.value.applicantUserId = userId
    if (!userId) return
    form.value.applicantId = ''
    form.value.departmentId =
      applicantUsers.value.find((user) => user.id === userId)?.organizationId || ''
  }
  function selectDefaultBusinessType() {
    const available = businessTypes.value.filter((row) =>
      isWmsBusinessTypeAvailable(row, form.value.documentTypeId, businessMenuId.value)
    )
    if (!available.some((row) => row.id === form.value.businessTypeId))
      form.value.businessTypeId =
        available.find((row) => row.isDefault)?.id || available[0]?.id || ''
  }
  function newLine(material: WmsMaterialOption): DraftLine {
    const orgId = form.value.organizationId || availableOrganizations.value[0]?.id || ''
    const wh = warehouseOptions(orgId)
    return {
      key: crypto.randomUUID(),
      materialId: material.id,
      material,
      projectId: '',
      constructionNo: '',
      inventoryUnitId: material.inventoryUnitId || material.baseUnitId || units.value[0]?.id || '',
      quantity: 1,
      batchNo: '',
      sourceOrganizationId: orgId,
      sourceWarehouseId: wh[0]?.id || '',
      sourceBinId: '',
      sourceBins: [],
      targetOrganizationId: orgId,
      targetWarehouseId: wh[1]?.id || wh[0]?.id || '',
      targetBinId: '',
      targetBins: [],
      ownerType: 'self',
      ownerId: null,
      stockType: 'normal',
      stockStatus: 'available',
      gift: false,
      productionDate: '',
      expiryDate: '',
      trackingNo: '',
      sourceDocument: '',
      sourceLineNo: '',
      remark: ''
    }
  }
  function stockMaterial(stock: WmsTransferStockOption): WmsMaterialOption {
    return {
      id: stock.materialId,
      materialCode: stock.material?.materialCode || '',
      materialName: stock.material?.materialName || '历史物料',
      description: stock.material?.description || null,
      specificationModel: stock.material?.specificationModel || null,
      serialManagementEnabled: stock.material?.serialManagementEnabled || false,
      inventoryUnitId: stock.material?.inventoryUnitId,
      baseUnitId: stock.material?.baseUnitId,
      unitConversions: stock.material?.unitConversions || []
    }
  }
  function stockAttributes(
    stock: WmsTransferStockOption
  ): Pick<
    DraftLine,
    | 'ownerType'
    | 'ownerId'
    | 'stockType'
    | 'stockStatus'
    | 'productionDate'
    | 'expiryDate'
    | 'trackingNo'
  > {
    return {
      ownerType:
        stock.ownerType === 'supplier' || stock.ownerType === 'customer' ? stock.ownerType : 'self',
      ownerId: stock.ownerId,
      stockType: stock.stockType || 'normal',
      stockStatus: stock.status === 'normal' ? 'available' : stock.status,
      productionDate: stock.productionDate || '',
      expiryDate: stock.expiryDate || '',
      trackingNo: stock.trackingNo || ''
    }
  }
  async function onStockSelected(stocks: WmsTransferStockOption[]) {
    const previous = new Map(
      lines.value.filter((row) => row.stockBatchId).map((row) => [row.stockBatchId, row])
    )
    const request = loadRequest
    try {
      const stockLines = await Promise.all(
        stocks.map(async (stock) => {
          const existing = previous.get(stock.id)
          if (existing) {
            existing.stockBatch = stock
            Object.assign(existing, stockAttributes(stock))
            return existing
          }
          const targetWarehouse =
            warehouseOptions(stock.organizationId).find((row) => row.id !== stock.warehouseId) ||
            warehouseOptions(stock.organizationId)[0]
          const [sourceBins, targetBins] = await Promise.all([
            fetchWmsBins(stock.warehouseId),
            targetWarehouse?.id ? fetchWmsBins(targetWarehouse.id) : Promise.resolve([])
          ])
          return {
            ...newLine(stockMaterial(stock)),
            stockBatchId: stock.id,
            stockBatch: stock,
            projectId: stock.projectId || '',
            constructionNo: stock.constructionNo || '',
            quantity: Math.min(
              1,
              convertWmsMaterialQuantity(
                stock.material || {},
                stock.availableQuantity,
                stock.material?.baseUnitId || '',
                stock.material?.inventoryUnitId || stock.material?.baseUnitId || ''
              ) ?? 0
            ),
            batchNo: stock.batchNo,
            sourceOrganizationId: stock.organizationId,
            sourceWarehouseId: stock.warehouseId,
            sourceBinId: stock.binId || '',
            sourceBins,
            targetOrganizationId: stock.organizationId,
            targetWarehouseId: targetWarehouse?.id || '',
            targetBins,
            ...stockAttributes(stock)
          }
        })
      )
      if (request !== loadRequest) return
      lines.value = [...lines.value.filter((row) => !row.stockBatchId), ...stockLines]
    } catch (error) {
      notifyFriendlyError(error, '调拨库存选择失败，请重试')
    }
  }
  function onImportParsing(value: boolean): void {
    parsing.value = value
    drawerRef.value?.setOptions({
      confirmDisabled: parsing.value || importing.value || Boolean(loadError.value)
    })
  }
  async function importLines(rows: Array<Record<string, unknown>>): Promise<void> {
    if (importing.value || mode.value === 'view' || !context.value?.tenantId) return
    if (!rows.length || rows.length > 500) {
      ElMessage.warning('请选择包含 1 至 500 行明细的文件；必填列为物料编码、数量')
      return
    }
    const request = loadRequest
    const tenantId = context.value.tenantId
    importing.value = true
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      const prepared = await prepareWmsMaterialImport(
        rows,
        (code) => fetchWmsMaterialOptions(tenantId, code, 1, 500),
        () => request === loadRequest
      )
      if (!prepared) return
      const imported = prepared.map((item) => ({
        ...newLine(item.material),
        quantity: item.quantity,
        batchNo: item.batchNo,
        remark: item.remark
      }))
      if (request !== loadRequest) return
      lines.value.push(...imported)
      ElMessage.success(`已导入 ${imported.length} 行，请核对调出与调入组织、仓库和仓位后保存`)
    } catch (error) {
      if (request === loadRequest)
        notifyFriendlyError(error, '导入失败，请检查物料编码、数量和网络后重试')
    } finally {
      if (request === loadRequest) {
        importing.value = false
        drawerRef.value?.setOptions({
          confirmDisabled: parsing.value || importing.value || Boolean(loadError.value)
        })
      }
    }
  }
  function removeLine(key: string) {
    lines.value = lines.value.filter((row) => row.key !== key)
  }
  function onSourceOrganizationChange(value: unknown) {
    const row = value as DraftLine
    detachStockBatch(row)
    row.sourceWarehouseId = warehouseOptions(row.sourceOrganizationId)[0]?.id || ''
    row.sourceBinId = ''
    row.sourceBins = []
    void loadSourceBins(row)
  }
  function detachStockBatch(value: unknown): void {
    const row = value as DraftLine
    row.stockBatchId = undefined
    row.stockBatch = undefined
  }
  function onSourceWarehouseChange(value: unknown): void {
    const row = value as DraftLine
    detachStockBatch(row)
    void loadSourceBins(row)
  }
  function onTargetOrganizationChange(value: unknown) {
    const row = value as DraftLine
    row.targetWarehouseId = warehouseOptions(row.targetOrganizationId)[0]?.id || ''
    row.targetBinId = ''
    row.targetBins = []
    void loadTargetBins(row)
  }
  const loadRowSourceBins = useWarehouseRowBinLoader(
    () => lines.value,
    () => loadRequest,
    (row) => row.sourceWarehouseId,
    fetchWmsBins,
    (row, bins) => {
      row.sourceBins = bins
    }
  )
  const loadRowTargetBins = useWarehouseRowBinLoader(
    () => lines.value,
    () => loadRequest,
    (row) => row.targetWarehouseId,
    fetchWmsBins,
    (row, bins) => {
      row.targetBins = bins
    }
  )
  async function loadSourceBins(value: unknown): Promise<void> {
    const row = value as DraftLine
    row.sourceBinId = ''
    await loadRowSourceBins(row)
  }
  async function loadTargetBins(value: unknown): Promise<void> {
    const row = value as DraftLine
    row.targetBinId = ''
    await loadRowTargetBins(row)
  }
  function rowMaterial(row: WmsTransferRequestRow): WmsMaterialOption {
    return {
      id: row.materialId,
      materialCode: row.materialCode,
      materialName: row.materialName,
      description: row.materialDescription,
      specificationModel: row.specificationModel,
      inventoryUnitId: row.inventoryUnitId,
      baseUnitId: row.baseUnitId,
      auxiliaryUnitId: row.auxiliaryUnitId,
      auxiliaryUnit2Id: row.auxiliaryUnit2Id,
      unitConversions: row.unitConversions || [],
      serialManagementEnabled: false
    }
  }
  async function loadDocument(id: string, request: number) {
    const rows = await fetchWmsTransferRequest(id)
    if (request !== loadRequest) return
    documentRows.value = rows
    const first = rows[0]
    if (!first) throw new Error('调拨申请不存在')
    Object.assign(form.value, {
      id: first.documentId,
      documentNo: first.documentNo,
      organizationId: first.organizationId,
      documentTypeId: first.documentTypeId,
      businessTypeId: first.businessTypeId,
      applicationDate: first.applicationDate,
      applicantId: first.applicantId || '',
      applicantUserId: first.applicantUserId || '',
      departmentId: first.departmentId || '',
      remark: first.documentRemark || ''
    })
    const loadedLines = await Promise.all(
      rows.map(async (row) => ({
        key: crypto.randomUUID(),
        stockBatchId: row.sourceBatchId || undefined,
        materialId: row.materialId,
        material: rowMaterial(row),
        projectId: row.projectId || '',
        constructionNo: row.constructionNo || '',
        inventoryUnitId: row.inventoryUnitId,
        quantity: Number(row.quantity),
        batchNo: row.batchNo || '',
        sourceOrganizationId: row.sourceOrganizationId,
        sourceWarehouseId: row.sourceWarehouseId,
        sourceBinId: row.sourceBinId || '',
        sourceBins: row.sourceWarehouseId ? await fetchWmsBins(row.sourceWarehouseId) : [],
        targetOrganizationId: row.targetOrganizationId,
        targetWarehouseId: row.targetWarehouseId,
        targetBinId: row.targetBinId || '',
        targetBins: row.targetWarehouseId ? await fetchWmsBins(row.targetWarehouseId) : [],
        ownerType: row.ownerType,
        ownerId: row.ownerId,
        stockType: row.stockType,
        stockStatus: row.stockStatus,
        gift: row.gift,
        productionDate: row.productionDate || '',
        expiryDate: row.expiryDate || '',
        trackingNo: row.trackingNo || '',
        sourceDocument: row.sourceDocument || '',
        sourceLineNo: row.sourceLineNo || '',
        remark: row.lineRemark || ''
      }))
    )
    if (request === loadRequest) lines.value = loadedLines
  }
  async function loadOptions(tenantId: string, request: number) {
    const [
      docRows,
      businessRows,
      projectRows,
      unitRows,
      warehouseRows,
      orgPage,
      menuId,
      departmentResult,
      applicantResult,
      supplierRows,
      customerRows
    ] = await Promise.all([
      fetchWmsInitialDocumentTypes(tenantId, 'WmsTransfer'),
      fetchWmsInitialOptions('mdm_business_type', tenantId),
      fetchWmsProjects(tenantId),
      fetchWmsUnitOptions(tenantId),
      fetchWmsWarehouses(tenantId),
      fetchWmsInventoryOrganizations({ tenantId, enabled: 'enabled', current: 1, size: 2000 }),
      fetchWmsInitialMenuId('WmsTransfer'),
      fetchEnabledOrganizationTree({ tenantId }),
      fetchEnabledOrganizationUserList({ tenantId }),
      fetchWmsInitialOptions('mdm_supplier', tenantId),
      fetchWmsInitialOptions('mdm_customer', tenantId)
    ])
    if (request !== loadRequest) return
    if (departmentResult.error) throw departmentResult.error
    if (applicantResult.error) throw applicantResult.error
    documentTypes.value = docRows
    businessTypes.value = businessRows
    projects.value = projectRows
    units.value = unitRows
    warehouses.value = warehouseRows
    organizations.value = orgPage.data
    departmentTree.value = departmentResult.data ?? []
    applicantUsers.value = applicantResult.data ?? []
    suppliers.value = supplierRows
    customers.value = customerRows
    businessMenuId.value = menuId
  }
  async function save(): Promise<boolean> {
    if (loadError.value || importing.value || parsing.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!lines.value.length) {
        ElMessage.warning('请至少选择一条物料')
        return false
      }
      if (
        lines.value.some(
          (row) =>
            !row.inventoryUnitId ||
            row.quantity <= 0 ||
            !row.sourceOrganizationId ||
            !row.sourceWarehouseId ||
            !row.targetOrganizationId ||
            !row.targetWarehouseId
        )
      ) {
        ElMessage.warning('请完整填写物料、数量、调出和调入信息')
        return false
      }
      const invalidUnitIndex = lines.value.findIndex((row) => {
        const baseQuantity = baseQuantityForLine(row)
        return baseQuantity === null || baseQuantity <= 0
      })
      if (invalidUnitIndex >= 0) {
        ElMessage.warning(`第 ${invalidUnitIndex + 1} 行物料单位缺少有效换算关系`)
        return false
      }
      if (lines.value.some((row) => row.ownerType !== 'self' && !row.ownerId)) {
        ElMessage.warning('供应商或客户货主须选择对应的货主')
        return false
      }
      await saveWmsTransferRequest({
        id: mode.value === 'edit' ? form.value.id : undefined,
        tenantId: context.value?.tenantId,
        organizationId: form.value.organizationId,
        documentTypeId: form.value.documentTypeId,
        businessTypeId: form.value.businessTypeId,
        applicationDate: form.value.applicationDate,
        applicantId: form.value.applicantId || null,
        applicantUserId: form.value.applicantUserId || null,
        departmentId: form.value.departmentId || null,
        remark: normalizeNullableText(form.value.remark),
        lines: lines.value.map((row) => ({
          materialId: row.materialId,
          sourceBatchId: row.stockBatchId || null,
          projectId: row.projectId || null,
          constructionNo: normalizeNullableText(row.constructionNo),
          inventoryUnitId: row.inventoryUnitId,
          quantity: row.quantity,
          baseUnitId: row.material?.baseUnitId || null,
          baseQuantity: baseQuantityForLine(row) ?? 0,
          batchNo: normalizeNullableText(row.batchNo),
          sourceOrganizationId: row.sourceOrganizationId,
          sourceWarehouseId: row.sourceWarehouseId,
          sourceBinId: row.sourceBinId || null,
          targetOrganizationId: row.targetOrganizationId,
          targetWarehouseId: row.targetWarehouseId,
          targetBinId: row.targetBinId || null,
          ownerType: row.ownerType,
          ownerId: row.ownerId,
          stockType: row.stockType,
          stockStatus: row.stockStatus,
          gift: row.gift,
          productionDate: row.productionDate || null,
          expiryDate: row.expiryDate || null,
          trackingNo: normalizeNullableText(row.trackingNo),
          sourceDocument: normalizeNullableText(row.sourceDocument),
          sourceLineNo: normalizeNullableText(row.sourceLineNo),
          remark: normalizeNullableText(row.remark)
        }))
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '调拨申请提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: OpenData) {
    loadRequest += 1
    importing.value = false
    parsing.value = false
    openData.value = data
    loadError.value = ''
    context.value = { tenantId: data.tenantId }
    mode.value = data.mode
    lines.value = []
    documentRows.value = []
    Object.assign(form.value, {
      id: '',
      documentNo: '保存后自动生成',
      organizationId: '',
      documentTypeId: '',
      businessTypeId: '',
      applicationDate: dayjs().format('YYYY-MM-DD'),
      applicantId: '',
      applicantUserId: defaultApplicantUserId(data.tenantId),
      departmentId: defaultApplicantDepartmentId(data.tenantId),
      remark: ''
    })
    await drawerRef.value?.handleOpen(data, {
      title:
        data.mode === 'view'
          ? '查看调拨申请单'
          : data.mode === 'edit'
            ? '编辑调拨申请单'
            : data.mode === 'copy'
              ? '复制调拨申请单'
              : '新增调拨申请单',
      subtitle: '暂存 → 提交 → 审核 → 下推调拨',
      showFooter: data.mode !== 'view',
      confirmText: data.mode === 'copy' ? '保存副本' : '保存',
      onConfirm: save,
      loading: true,
      confirmDisabled: true,
      onOpen: reloadDocument,
      onClose: () => {
        loadRequest += 1
        importing.value = false
        parsing.value = false
        openData.value = undefined
      }
    })
  }
  async function reloadDocument(): Promise<void> {
    const data = openData.value
    if (!data) return
    const request = ++loadRequest
    loadError.value = ''
    drawerRef.value?.setLoading(true)
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      if (!data.tenantId) throw new Error('缺少租户')
      await loadOptions(data.tenantId, request)
      if (request !== loadRequest) return
      form.value.organizationId =
        availableOrganizations.value.find((row) => row.isDefault)?.id ||
        availableOrganizations.value[0]?.id ||
        ''
      form.value.applicantId = ''
      form.value.applicantUserId = defaultApplicantUserId(data.tenantId)
      form.value.departmentId = defaultApplicantDepartmentId(data.tenantId)
      form.value.documentTypeId = documentTypes.value.find((row) => row.isDefault)?.id || ''
      selectDefaultBusinessType()
      if (data.documentId) {
        await loadDocument(data.documentId, request)
        if (request !== loadRequest) return
        if (data.mode === 'copy') {
          form.value.id = ''
          form.value.documentNo = '保存后自动生成'
          form.value.applicantId = ''
          form.value.applicantUserId = defaultApplicantUserId(data.tenantId)
          form.value.departmentId = defaultApplicantDepartmentId(data.tenantId)
        }
      }
      await nextTick()
      if (request !== loadRequest) return
      formRef.value?.clearValidate()
    } catch (error) {
      if (request !== loadRequest) return
      loadError.value = '请重新加载单据资料；如仍失败，请检查网络和当前单据的查看权限。'
      notifyFriendlyError(error, '单据资料加载失败，请重试')
    } finally {
      if (request === loadRequest) {
        drawerRef.value?.setLoading(false)
        drawerRef.value?.setOptions({
          confirmDisabled: parsing.value || importing.value || Boolean(loadError.value)
        })
      }
    }
  }
  defineExpose({ handleOpen })
</script>

<style scoped>
  :deep(.document-header-descriptions .el-descriptions__table) {
    table-layout: fixed;
  }

  :deep(.transfer-line-table .el-input-number),
  :deep(.transfer-line-table .el-select),
  :deep(.transfer-line-table .el-date-editor) {
    width: 100%;
  }
</style>
