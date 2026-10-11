<template>
  <ArtDrawer
    ref="drawerRef"
    :size="isMobile ? '100%' : '88%'"
    :show-footer="mode !== 'view'"
    show-fullscreen-button
    @close="invalidateInlineOptions"
  >
    <ArtEmptyState
      v-if="documentError"
      title="单据加载失败"
      :description="documentError"
      size="compact"
    >
      <ElButton type="primary" @click="reloadDocument">重新加载</ElButton>
    </ArtEmptyState>
    <div v-else class="min-w-0 space-y-4">
      <ArtEntitySummary
        :icon="config.icon"
        :title="form.documentNo || `${mode === 'copy' ? '复制' : '新增'}${title}`"
        :description="
          mode === 'view'
            ? '核对单据表头、物料明细与库存办理结果。'
            : isFinished
              ? '选择生产工单与成品明细，核对仓位和数量后暂存。审核后办理库存过账。'
              : '先填写单据表头，再从库存批次、物料编码或生产工单 BOM 选择明细。保存时生成月度三位流水号。'
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
            {{ documentStatusLabel }}
          </ElTag>
        </template>
      </ArtEntitySummary>
      <ElAlert v-if="optionError" type="error" :closable="false" show-icon>
        {{
          mode === 'view'
            ? '基础资料加载失败，部分名称暂不可用，请重新加载。'
            : '基础资料加载失败，请重试后再保存。'
        }}
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ElAlert
        v-if="mode !== 'view' && initializationWarning"
        type="warning"
        :closable="false"
        show-icon
      >
        {{ initializationWarning }}
      </ElAlert>
      <ElAlert
        v-else-if="mode !== 'view' && props.kind === 'return'"
        type="info"
        :closable="false"
        show-icon
      >
        生产退料的申请数量与实发数量以负数登记。下推时系统按绝对值增加库存。
      </ElAlert>
      <ElAlert
        v-else-if="mode !== 'view' && props.kind === 'finished_return'"
        type="info"
        :closable="false"
        show-icon
      >
        从同一生产工单已过账的完工入库明细选单。退库数量以负数登记，过账时核减成品库存和工单已入库数量。
      </ElAlert>
      <ElAlert
        v-else-if="mode !== 'view' && props.kind === 'finished_inbound'"
        type="info"
        :closable="false"
        show-icon
      >
        可按工单、已确认排包单或物料带入。入库过账数量不能超过生产工单已报工未入库数量。
      </ElAlert>
      <ElAlert v-if="importIntent && mode !== 'view'" type="success" :closable="false" show-icon>
        先选择仓库，再在“{{ config.detailLabel }}”中点击“导入明细”；必填列为物料编码、{{
          isFinished ? '入库数量' : '申请数量、实发数量'
        }}。支持 1 至 500 行，导入后请核对数量、工单和仓储信息。
      </ElAlert>
      <ArtSectionCard
        title="单据表头"
        :subtitle="
          mode === 'view'
            ? '单据来源、仓储范围与业务状态'
            : '仓库决定库存组织及租户；项目选定后自动带入客户。'
        "
      >
        <ArtDescriptions
          v-if="mode === 'view'"
          class="production-header-descriptions"
          :data="headerViewData"
          :items="headerViewItems"
          :columns="2"
          :label-width="120"
          border
        >
          <template #item-status>
            <ElTag
              :type="
                form.status === 'approved'
                  ? 'success'
                  : form.status === 'submitted'
                    ? 'warning'
                    : 'info'
              "
            >
              {{ documentStatusLabel }}
            </ElTag>
          </template>
          <template #item-materialStatus>
            <ElTag
              :type="
                form.materialStatus === 'fulfilled'
                  ? 'success'
                  : form.materialStatus === 'partial'
                    ? 'warning'
                    : 'info'
              "
            >
              {{ materialStatusLabel }}
            </ElTag>
          </template>
        </ArtDescriptions>
        <ArtForm
          v-else
          ref="formRef"
          v-model="form"
          :items="headerItems"
          :rules="headerRules"
          :validate-on-rule-change="false"
          :span="8"
          :gutter="18"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
        >
          <template #documentNo>
            <div class="production-readonly-field" :class="{ 'is-placeholder': !form.documentNo }">
              <ArtSvgIcon icon="ri:hashtag" />
              <span>{{ form.documentNo || '保存后自动生成' }}</span>
            </div>
          </template>
          <template #projectId>
            <ArtTableSingleSelect
              :model-value="form.projectId || undefined"
              :selected-data="selectedProject"
              :data="projects"
              :columns="projectColumns"
              row-key="id"
              label-key="projectName"
              description-key="projectCode"
              title="参选销售项目"
              placeholder="选择项目"
              :disabled="!form.tenantId"
              @update:selected-data="onProjectSelected"
            />
          </template>
          <template #customerId>
            <div class="production-readonly-field" :class="{ 'is-placeholder': !customerName }">
              <ArtSvgIcon icon="ri:building-2-line" />
              <span>{{ customerName || '选择项目后自动带入' }}</span>
            </div>
          </template>
          <template #applicantId>
            <ArtEmployeeSelect
              :model-value="form.applicantId || undefined"
              :selected-data="selectedApplicant"
              :tenant-id="form.tenantId || undefined"
              title="选择领料申请人"
              :disabled="!form.tenantId"
              @change="onApplicantChange"
            />
          </template>
          <template #keeperId>
            <ArtEmployeeSelect
              :model-value="form.keeperId || undefined"
              :selected-data="selectedKeeper"
              :tenant-id="form.tenantId || undefined"
              title="选择仓管员"
              :disabled="!form.tenantId"
              @change="onKeeperChange"
            />
          </template>
          <template #status>
            <div class="production-readonly-field">
              <ArtSvgIcon icon="ri:file-list-3-line" />
              <ElTag
                size="small"
                effect="light"
                :type="
                  form.status === 'approved'
                    ? 'success'
                    : form.status === 'submitted'
                      ? 'warning'
                      : 'info'
                "
                >{{ documentStatusLabel }}</ElTag
              >
            </div>
          </template>
          <template #materialStatus>
            <div class="production-readonly-field">
              <ArtSvgIcon icon="ri:progress-3-line" />
              <ElTag
                size="small"
                effect="light"
                :type="
                  form.materialStatus === 'fulfilled'
                    ? 'success'
                    : form.materialStatus === 'pending'
                      ? 'info'
                      : 'warning'
                "
                >{{ materialStatusLabel }}</ElTag
              >
            </div>
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ArtSectionCard
        :title="config.detailLabel"
        :subtitle="`共 ${lines.length} 行 · ${isFinished ? config.quantityLabel : '申请数量'} ${isFinished ? actualTotal.toFixed(4) : requestedTotal.toFixed(4)}${isFinished ? '' : ` · 实发数量 ${actualTotal.toFixed(4)}`}`"
        :empty="!lines.length"
        empty-title="尚未选择物料"
        :empty-description="
          props.kind === 'finished_inbound'
            ? '可按生产工单、排包单或物料编码批量带入。'
            : props.kind === 'finished_return'
              ? '从已过账的完工入库明细批量选单。'
              : '可从库存批次、物料编码或当前生产工单 BOM 批量带入。'
        "
      >
        <template #actions>
          <div v-if="mode !== 'view'" class="flex flex-wrap items-center justify-end gap-2">
            <ArtTableMultipleSelect
              v-if="!isFinished"
              v-model="stockPickerIds"
              v-model:selected-data="stockPickerRows"
              class="w-auto! shrink-0"
              title="库存列表"
              subtitle="可按物料与批号检索并批量参选。"
              search-placeholder="搜索批号或备注"
              row-key="id"
              label-key="batchLabel"
              :columns="stockColumns"
              :api-fn="stockApi"
              :disabled="!form.tenantId"
              @confirm="addStockRows"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-auth="permission.Add"
                  type="primary"
                  :disabled="!form.tenantId"
                  @click="open"
                >
                  <ArtSvgIcon icon="ri:add-line" />新增
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="!isFinished"
              v-model="bomPickerIds"
              v-model:selected-data="bomPickerSelected"
              class="w-auto! shrink-0"
              title="参选生产工单 BOM"
              subtitle="从已选择的生产工单 BOM 明细中批量带入物料。"
              row-key="key"
              label-key="materialName"
              :columns="bomColumns"
              :data="bomPickerData"
              :disabled="!form.workOrderId"
              @confirm="addBomRows"
            >
              <template #trigger="{ open }">
                <ElButton v-auth="permission.Select" :disabled="!form.workOrderId" @click="open"
                  ><ArtSvgIcon icon="ri:file-list-3-line" />选单</ElButton
                >
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="props.kind === 'finished_inbound'"
              v-model="workOrderPickerIds"
              v-model:selected-data="workOrderPickerRows"
              class="w-auto! shrink-0"
              title="参选生产工单"
              subtitle="可批量选择已下达工单，生成对应成品明细。"
              row-key="id"
              label-key="workOrderNo"
              :columns="workOrderColumns"
              :data="workOrders"
              :disabled="!form.warehouseId"
              @confirm="addWorkOrderRows"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-auth="permission.Select"
                  type="primary"
                  plain
                  :disabled="!form.warehouseId"
                  @click="open"
                >
                  <ArtSvgIcon icon="ri:file-list-3-line" />选生产工单
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="props.kind === 'finished_inbound'"
              v-model="packPickerIds"
              v-model:selected-data="packPickerRows"
              class="w-auto! shrink-0"
              title="参选已确认排包单"
              subtitle="整包数量自动带入，过账时校验排包单。"
              row-key="id"
              label-key="packNo"
              :columns="packColumns"
              :data="packPickerData"
              :disabled="!form.workOrderId"
              @confirm="addPackRows"
            >
              <template #trigger="{ open }">
                <ElButton v-auth="permission.Select" :disabled="!form.workOrderId" @click="open">
                  <ArtSvgIcon icon="ri:archive-stack-line" />选排包单
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="props.kind === 'finished_return'"
              v-model="inboundSourceIds"
              v-model:selected-data="inboundSourceRows"
              class="w-auto! shrink-0"
              title="参选完工入库明细"
              subtitle="同一生产工单可多选，退库数量不能超过来源入库数量。"
              search-placeholder="搜索入库单号、工单号或物料编码"
              row-key="id"
              label-key="documentNo"
              :columns="inboundSourceColumns"
              :api-fn="inboundSourceApi"
              :disabled="!form.tenantId"
              @confirm="addInboundSourceRows"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-auth="permission.Select"
                  type="primary"
                  plain
                  :disabled="!form.tenantId"
                  @click="open"
                >
                  <ArtSvgIcon icon="ri:file-list-3-line" />选单
                </ElButton>
              </template>
            </ArtTableMultipleSelect>
            <ArtTableMultipleSelect
              v-if="props.kind !== 'finished_return'"
              v-model="materialPickerIds"
              v-model:selected-data="materialPickerRows"
              class="w-auto! shrink-0"
              title="数据来源：物料编码"
              subtitle="按物料编码、名称或描述检索并批量参选。"
              search-placeholder="搜索物料编码或名称"
              row-key="id"
              label-key="materialName"
              :columns="materialColumns"
              :navigation="materialNavigation"
              :api-fn="materialApi"
              :disabled="!form.tenantId || (isFinished && !form.workOrderId)"
              @confirm="addMaterialRows"
            >
              <template #trigger="{ open }">
                <ElButton
                  v-auth="permission.Add"
                  :disabled="!form.tenantId || (isFinished && !form.workOrderId)"
                  @click="open"
                  ><ArtSvgIcon icon="ri:box-3-line" />{{
                    isFinished ? '新增物料' : '选择物料'
                  }}</ElButton
                >
              </template>
            </ArtTableMultipleSelect>
            <ElButton
              v-auth="permission.Copy"
              :disabled="selectedLineIndexes.length !== 1"
              @click="copySelectedLine"
            >
              <ArtSvgIcon icon="ri:file-copy-line" />复制
            </ElButton>
            <ElButton
              v-auth="permission.Delete"
              type="danger"
              plain
              :disabled="!selectedLineIndexes.length"
              @click="deleteSelectedLines"
            >
              <ArtSvgIcon icon="ri:delete-bin-line" />批量删除
            </ElButton>
            <span v-if="props.kind !== 'finished_return'" v-auth="permission.Import">
              <ArtExcelImport
                accept=".xlsx,.xls,.csv"
                :context-key="openData"
                :disabled="!form.tenantId || importing || parsing"
                :button-props="{ type: 'success', plain: true, loading: importing || parsing }"
                icon="ri:upload-2-line"
                @parsing-change="onImportParsing"
                @import-success="importLines"
                @import-error="onImportError"
                >导入明细</ArtExcelImport
              >
            </span>
          </div>
        </template>
        <ElScrollbar v-if="lines.length">
          <ArtTable
            ref="lineTableRef"
            class="wms-editable-line-table"
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            :cell-class-name="quantityCellClass"
            row-key="lineNo"
            table-layout="fixed"
            @selection-change="onLineSelectionChange"
          >
            <template #materialId="{ row }">
              <strong
                class="block truncate text-sm"
                :title="row.material?.description || row.material?.materialName || '物料'"
                >{{ row.material?.description || row.material?.materialName || '物料' }}</strong
              >
              <small
                class="block truncate text-[var(--el-text-color-secondary)]"
                :title="row.material?.materialCode || '—'"
                >{{ row.material?.materialCode || '—' }}</small
              >
              <small
                v-if="lineUnitConversionError(row)"
                class="flex items-center gap-1 text-[var(--el-color-warning)]"
                :title="lineUnitConversionError(row)"
              >
                <ArtSvgIcon icon="ri:error-warning-line" /> 单位换算待配置
              </small>
            </template>
            <template #requestedQuantity="{ row }">
              <ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.requestedQuantity"
                :precision="4"
                :controls="false"
                class="w-full!"
                @change="onInlineRequestedQuantityChange(row, $event)"
              />
              <strong v-else class="tabular-nums">{{
                Number(row.requestedQuantity).toFixed(4)
              }}</strong>
            </template>
            <template #actualQuantity="{ row }">
              <ElInputNumber
                v-if="mode !== 'view'"
                v-model="row.actualQuantity"
                :precision="4"
                :controls="false"
                class="w-full!"
                @change="onInlineActualQuantityChange(row, $event)"
              />
              <strong v-else class="tabular-nums">{{
                Number(row.actualQuantity).toFixed(4)
              }}</strong>
            </template>
            <template #projectId="{ row }"
              ><ArtTableSingleSelect
                v-if="mode !== 'view'"
                :model-value="row.projectId || undefined"
                :selected-data="projects.filter((item) => item.id === row.projectId)"
                :data="projects"
                :columns="projectColumns"
                row-key="id"
                label-key="projectName"
                description-key="projectCode"
                title="参选项目"
                @update:selected-data="onInlineProjectSelected(row, $event)"
              /><span v-else>{{ projectName(row.projectId) }}</span></template
            >
            <template #constructionNo="{ row }"
              ><ElInput
                v-if="mode !== 'view'"
                v-model="row.constructionNo"
                :disabled="isFinished"
                placeholder="施工号"
              /><span v-else>{{ row.constructionNo || '—' }}</span></template
            >
            <template #productionUnitId="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.productionUnitId" filterable
                ><ElOption
                  v-for="unit in unitOptions()"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value" /></ElSelect
              ><span v-else>{{ unitName(row.productionUnitId) }}</span></template
            >
            <template #inventoryUnitId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.inventoryUnitId"
                filterable
                @change="syncInlineQuantities(row)"
                ><ElOption
                  v-for="unit in unitOptions()"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value" /></ElSelect
              ><span v-else>{{ unitName(row.inventoryUnitId) }}</span></template
            >
            <template #baseUnitId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.baseUnitId"
                filterable
                @change="syncInlineQuantities(row)"
                ><ElOption
                  v-for="unit in unitOptions()"
                  :key="unit.value"
                  :label="unit.label"
                  :value="unit.value" /></ElSelect
              ><span v-else>{{ unitName(row.baseUnitId) }}</span></template
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
                :disabled="props.kind === 'finished_return'"
                @change="onInlineWarehouseChange(row)"
                ><ElOption
                  v-for="warehouse in warehouses.filter(
                    (item) => item.tenantId === form.tenantId && item.status === 'enabled'
                  )"
                  :key="warehouse.id"
                  :label="warehouse.warehouseName"
                  :value="warehouse.id" /></ElSelect
              ><span v-else>{{ warehouseName(row.warehouseId) }}</span></template
            >
            <template #binId="{ row }"
              ><ElSelect
                v-if="mode !== 'view'"
                v-model="row.binId"
                filterable
                clearable
                @visible-change="($event) => $event && loadInlineBins(row)"
                ><ElOption
                  v-for="bin in bins.filter((item) => item.status === 'available')"
                  :key="bin.id"
                  :label="`${bin.binName} · ${bin.binCode}`"
                  :value="bin.id" /></ElSelect
              ><span v-else>{{ row.binId || '—' }}</span></template
            >
            <template #sourceBatchId="{ row }"
              ><ArtTableSingleSelect
                v-if="mode !== 'view'"
                :model-value="row.sourceBatchId || undefined"
                :api-fn="(params) => lineStockApi(row, params)"
                :columns="stockColumns"
                row-key="id"
                label-key="batchLabel"
                title="选择来源库存批次"
                @update:selected-data="onInlineBatchSelected(row, $event)"
              /><span v-else>{{ row.batchNo || '—' }}</span></template
            >
            <template #returnType="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.returnType"
                ><ElOption
                  v-for="option in returnTypeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><span v-else>{{
                returnTypeOptions.find((item) => item.value === row.returnType)?.label || '—'
              }}</span></template
            >
            <template #stockType="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.stockType"
                ><ElOption
                  v-for="option in stockTypeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><ArtDictDisplay
                v-else
                dict-code="wmsInitialStockType"
                :value="row.stockType"
                display="text"
            /></template>
            <template #ownerType="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.ownerType" @change="row.ownerId = null"
                ><ElOption
                  v-for="option in ownerTypeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><ArtDictDisplay
                v-else
                dict-code="mdmBusinessOwnerType"
                :value="row.ownerType"
                display="text"
            /></template>
            <template #ownerId="{ row }"
              ><ElSelect
                v-if="mode !== 'view' && row.ownerType !== 'self'"
                v-model="row.ownerId"
                filterable
                ><ElOption
                  v-for="owner in row.ownerType === 'supplier' ? suppliers : customers"
                  :key="owner.id"
                  :label="owner.name"
                  :value="owner.id" /></ElSelect
              ><span v-else>{{
                formatWmsOwnerName(row.ownerType, row.ownerId, suppliers, customers)
              }}</span></template
            >
            <template #stockStatus="{ row }"
              ><ElSelect v-if="mode !== 'view'" v-model="row.stockStatus"
                ><ElOption
                  v-for="option in stockStatusOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value" /></ElSelect
              ><ArtDictDisplay
                v-else
                dict-code="wmsInitialStockCondition"
                :value="row.stockStatus"
                display="text"
            /></template>
            <template #keeperId="{ row }"
              ><ArtEmployeeSelect
                v-if="mode !== 'view'"
                :model-value="row.keeperId || undefined"
                :tenant-id="form.tenantId"
                title="选择明细仓管员"
                @update:model-value="row.keeperId = $event || null"
              /><span v-else>{{ employeeName(row.keeperId) }}</span></template
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
            <template #remark="{ row }"
              ><ElInput v-if="mode !== 'view'" v-model="row.remark" /><span v-else>{{
                row.remark || '—'
              }}</span></template
            >
            <template #availableInventoryQuantity="{ row }">
              {{ Number(row.availableInventoryQuantity || 0).toFixed(4) }}
            </template>
            <template #operation="{ row }">
              <BusinessTableRowActions>
                <ElButton
                  v-if="row.material?.serialManagementEnabled"
                  link
                  type="primary"
                  @click="openInlineSerials(row)"
                  >序列号 {{ isOutbound ? row.serialIds.length : row.serialNos.length }}</ElButton
                >
                <ArtButtonTable
                  v-if="mode !== 'view'"
                  type="delete"
                  label="删除"
                  :permission="permission.Delete"
                  @click="deleteLine(row.lineNo)"
                />
              </BusinessTableRowActions>
            </template>
          </ArtTable>
        </ElScrollbar>
      </ArtSectionCard>
    </div>
  </ArtDrawer>

  <ArtDialog ref="serialDialogRef" size="sm" :show-footer="mode !== 'view'">
    <ArtEmptyState
      v-if="serialError"
      title="序列号加载失败"
      description="请重新加载当前明细的序列号。"
      size="compact"
    >
      <ElButton type="primary" @click="loadInlineSerialOptions">重新加载</ElButton>
    </ArtEmptyState>
    <template v-else-if="mode === 'view'">
      <ArtEmptyState
        v-if="!serialText.trim()"
        title="暂无序列号"
        description="当前明细尚未登记序列号。"
        size="compact"
      />
      <ElInput
        v-else
        v-model="serialText"
        type="textarea"
        :rows="10"
        readonly
        aria-label="当前明细序列号"
      />
    </template>
    <ElSelect
      v-else-if="isOutbound"
      v-model="serialIdsDraft"
      multiple
      filterable
      class="w-full"
      aria-label="选择来源序列号"
      placeholder="选择来源序列号"
    >
      <ElOption
        v-for="item in serials.filter((entry) => entry.status === 'in_stock')"
        :key="item.id"
        :label="item.serialNo"
        :value="item.id"
      />
    </ElSelect>
    <ElInput
      v-else
      v-model="serialText"
      type="textarea"
      :rows="10"
      placeholder="每行一个序列号"
      aria-label="逐行录入序列号"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import {
    buildMaterialCategoryNavigation,
    getMaterialCategoryIds
  } from '@/utils/business/material-category'
  import { fetchWmsMaterialCategories } from '@/api/wms-material-category'
  import type { MaterialSelectCategory } from '@/components/business/art-material-select/types'
  const materialCategories = ref<MaterialSelectCategory[]>([])
  const materialNavigation = computed(() =>
    buildMaterialCategoryNavigation(materialCategories.value)
  )
  import { formatWmsOwnerName } from '@/utils/wms/owner-display'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import {
    fetchEmployeeReferencesByIds,
    type EmployeeIntegrationItem
  } from '@/api/integration/employees'
  import { fetchOrganizationOptionsTree } from '@/api/system-manage'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import type { ColumnOption } from '@/types'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { storeToRefs } from 'pinia'
  import { cloneDeep, groupBy, uniq } from 'lodash-es'
  import { useBreakpoints } from '@vueuse/core'
  import { normalizeNullableNumber, normalizeNullableText } from '@/utils/form/normalize'
  import {
    fetchWmsBatchSerials,
    fetchWmsSerialsByIds,
    fetchWmsBins,
    fetchWmsInitialOptions,
    fetchWmsInventoryOrganizations,
    fetchWmsMaterialOptions,
    fetchWmsProductionBomItems,
    fetchWmsProductionBusinessTypes,
    fetchWmsProductionDocumentTypes,
    fetchWmsProductionMaterialDocument,
    fetchWmsProductionMaterialsByCodes,
    fetchWmsProductionMaterialsByIds,
    fetchWmsProductionProjects,
    fetchWmsFinishedInboundSourcePage,
    fetchWmsProductionStockPage,
    fetchWmsPackOptions,
    fetchWmsUnitOptions,
    fetchWmsWarehouses,
    fetchWmsWorkOrderOptions,
    saveWmsProductionMaterial,
    type WmsBatchSerial,
    type WmsBin,
    type WmsInitializationOption,
    type WmsInventoryOrganization,
    type WmsMaterialOption,
    type WmsProductionBomItem,
    type WmsProductionBusinessTypeOption,
    type WmsProductionDocumentTypeOption,
    type WmsFinishedInboundSourceOption,
    type WmsProductionMaterialDocument,
    type WmsProductionMaterialInput,
    type WmsProductionMaterialKind,
    type WmsProductionMaterialLine,
    type WmsProductionProjectOption,
    type WmsProductionStockOption,
    type WmsUnitOption,
    type WmsWarehouse,
    type WmsWorkOrderOption,
    type WmsPackOption
  } from '@wms/api'
  import { productionDocumentConfig } from './production-document-config'

  interface OpenData {
    mode: 'create' | 'edit' | 'copy' | 'view'
    documentId?: string
    importIntent?: boolean
    selectIntent?: boolean
  }
  type DraftLine = WmsProductionMaterialLine & {
    key: string
    remainingQuantity?: number
    serialText?: string
  }
  const props = defineProps<{ kind: WmsProductionMaterialKind }>()
  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const serialDialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const lineTableRef = ref<InstanceType<typeof ArtTable>>()
  const mode = ref<OpenData['mode']>('create')
  const optionError = ref(false)
  const documentError = ref('')
  const openData = shallowRef<OpenData>()
  let documentRequest = 0
  const importing = ref(false)
  const parsing = ref(false)
  const importIntent = ref(false)
  const selectIntent = ref(false)
  const currentDocument = shallowRef<WmsProductionMaterialDocument | null>(null)
  const organizations = ref<WmsInventoryOrganization[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const warehouses = ref<WmsWarehouse[]>([])
  const projects = ref<WmsProductionProjectOption[]>([])
  const units = ref<WmsUnitOption[]>([])
  const bins = ref<WmsBin[]>([])
  const documentTypes = ref<WmsProductionDocumentTypeOption[]>([])
  const businessTypes = ref<WmsProductionBusinessTypeOption[]>([])
  const workOrders = ref<WmsWorkOrderOption[]>([])
  const suppliers = ref<WmsInitializationOption[]>([])
  const customers = ref<WmsInitializationOption[]>([])
  const bomItems = ref<WmsProductionBomItem[]>([])
  const packs = ref<WmsPackOption[]>([])
  const serials = ref<WmsBatchSerial[]>([])
  const lines = ref<DraftLine[]>([])
  const editLine = ref<DraftLine | null>(null)
  const serialText = ref('')
  const serialError = ref(false)
  const activeSerialLine = shallowRef<DraftLine>()
  let serialRequest = 0
  const serialIdsDraft = ref<string[]>([])
  const selectedLineIndexes = ref<number[]>([])
  const selectedApplicant = ref<EmployeeIntegrationItem[]>([])
  const selectedKeeper = ref<EmployeeIntegrationItem[]>([])
  const employees = ref<EmployeeIntegrationItem[]>([])
  const stockPickerIds = ref<string[]>([])
  const stockPickerRows = ref<DataSelectRecord[]>([])
  const bomPickerIds = ref<string[]>([])
  const bomPickerSelected = ref<DataSelectRecord[]>([])
  const materialPickerIds = ref<string[]>([])
  const materialPickerRows = ref<DataSelectRecord[]>([])
  const workOrderPickerIds = ref<string[]>([])
  const workOrderPickerRows = ref<DataSelectRecord[]>([])
  const packPickerIds = ref<string[]>([])
  const packPickerRows = ref<DataSelectRecord[]>([])
  const inboundSourceIds = ref<string[]>([])
  const inboundSourceRows = ref<DataSelectRecord[]>([])
  const returnTypeOptions = useDictionaryOptions('wmsProductionReturnType')
  const ownerTypeOptions = useDictionaryOptions('mdmBusinessOwnerType')
  const stockStatusOptions = useDictionaryOptions('wmsInitialStockCondition')
  const stockTypeOptions = useDictionaryOptions('wmsInitialStockType')
  const isMobile = useBreakpoints({ sm: 640 }).smaller('sm')
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const config = computed(() => productionDocumentConfig[props.kind])
  const isReturn = computed(() => config.value.negative)
  const isFinished = computed(() => config.value.finished)
  const isOutbound = computed(() => props.kind === 'issue' || props.kind === 'finished_return')
  const title = computed(() => config.value.title)
  const permission = computed(() => config.value.permissions)
  const form = ref({
    id: '',
    tenantId: '',
    documentNo: '',
    documentTypeId: '',
    businessTypeId: '',
    organizationId: '',
    businessDate: dayjs().format('YYYY-MM-DD'),
    warehouseId: '',
    workOrderId: '',
    projectId: '',
    customerId: '',
    demandDate: '',
    applicantId: '',
    departmentId: '',
    keeperId: '',
    status: 'draft' as WmsProductionMaterialDocument['status'],
    materialStatus: 'pending' as WmsProductionMaterialDocument['materialStatus'],
    remark: ''
  })
  const documentStatusLabel = computed(
    () => ({ draft: '暂存', submitted: '已提交', approved: '已审核' })[form.value.status]
  )
  const materialStatusLabel = computed(
    () =>
      ({
        pending: config.value.pendingLabel,
        partial: config.value.partialLabel,
        fulfilled: config.value.completedLabel,
        void: '作废',
        closed: '关闭'
      })[form.value.materialStatus]
  )
  const selectedProject = computed(() =>
    projects.value.filter((item) => item.id === form.value.projectId)
  )
  const customerName = computed(
    () =>
      projects.value.find((item) => item.id === form.value.projectId)?.customer?.customerName || ''
  )
  type OrganizationSelectNode = Omit<Api.SystemManage.OrganizationListItem, 'children'> & {
    organizationLabel: string
    disabled: boolean
    children?: OrganizationSelectNode[]
  }
  const organizationSelectTree = computed(() => {
    const selectableIds = new Set(
      organizations.value.filter((item) => item.initializationClosedAt).map((item) => item.id)
    )
    const decorate = (nodes: Api.SystemManage.OrganizationListItem[]): OrganizationSelectNode[] =>
      nodes.map((node) => ({
        ...node,
        organizationLabel: `${node.organizationName} · ${node.organizationCode}${node.id && selectableIds.has(node.id) ? '' : '（未结束初始化）'}`,
        disabled: !node.id || !selectableIds.has(node.id),
        children: node.children ? decorate(node.children) : undefined
      }))
    return decorate(organizationTree.value)
  })
  const departmentSelectTree = computed(() => {
    const selectableIds = new Set(organizations.value.map((item) => item.id))
    const decorate = (nodes: Api.SystemManage.OrganizationListItem[]): OrganizationSelectNode[] =>
      nodes
        .filter((node) => node.tenantId === form.value.tenantId)
        .map((node) => ({
          ...node,
          organizationLabel: node.organizationName,
          disabled: !node.id || !selectableIds.has(node.id),
          children: node.children ? decorate(node.children) : undefined
        }))
    return decorate(organizationTree.value)
  })
  const headerViewData = computed(() => {
    const lineWorkOrders = new Set(lines.value.map((line) => line.workOrderId).filter(Boolean))
    return {
      documentNo: form.value.documentNo,
      documentType:
        documentTypes.value.find((item) => item.id === form.value.documentTypeId)
          ?.documentTypeName || title.value,
      businessType:
        businessTypes.value.find((item) => item.id === form.value.businessTypeId)
          ?.businessTypeName || '—',
      organization:
        organizations.value.find((item) => item.id === form.value.organizationId)
          ?.organizationName || '—',
      businessDate: form.value.businessDate,
      warehouse: warehouseName(form.value.warehouseId),
      workOrder: form.value.workOrderId
        ? workOrders.value.find((item) => item.id === form.value.workOrderId)?.workOrderNo || '—'
        : lineWorkOrders.size > 1
          ? `${lineWorkOrders.size} 个生产工单`
          : '—',
      project: projectName(form.value.projectId),
      customer:
        customerName.value ||
        customers.value.find((item) => item.id === form.value.customerId)?.name ||
        '—',
      demandDate: form.value.demandDate || '—',
      applicant: employeeName(form.value.applicantId),
      department:
        organizations.value.find((item) => item.id === form.value.departmentId)?.organizationName ||
        '—',
      keeper: employeeName(form.value.keeperId),
      status: form.value.status,
      materialStatus: form.value.materialStatus,
      remark: form.value.remark || '—'
    }
  })
  const headerViewItems = computed<ArtDescriptionItem<typeof headerViewData.value>[]>(() => [
    { key: 'documentNo', label: config.value.numberLabel, field: 'documentNo', copyable: true },
    { key: 'documentType', label: '单据类型', field: 'documentType' },
    { key: 'businessType', label: '业务类型', field: 'businessType' },
    { key: 'organization', label: '库存组织', field: 'organization' },
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    { key: 'warehouse', label: '仓库', field: 'warehouse' },
    { key: 'workOrder', label: '生产工单', field: 'workOrder' },
    { key: 'project', label: '项目名称', field: 'project' },
    { key: 'customer', label: '客户', field: 'customer' },
    ...(!isFinished.value
      ? [
          { key: 'applicant', label: '申请人', field: 'applicant' },
          { key: 'department', label: '申请部门', field: 'department' }
        ]
      : []),
    ...(props.kind !== 'finished_return'
      ? [{ key: 'demandDate', label: '需求日期', field: 'demandDate' }]
      : []),
    { key: 'keeper', label: '仓管员', field: 'keeper' },
    { key: 'status', label: '单据状态', field: 'status' },
    {
      key: 'materialStatus',
      label: isFinished.value ? '办理状态' : isReturn.value ? '状态' : '领料状态',
      field: 'materialStatus',
      span: props.kind === 'finished_return' ? 1 : 2
    },
    { key: 'remark', label: '备注', field: 'remark', span: 2 }
  ])
  const eligibleWarehouses = computed(() =>
    warehouses.value.filter(
      (item) =>
        item.status === 'enabled' &&
        item.organizationId === form.value.organizationId &&
        item.tenantId === form.value.tenantId &&
        (!isFinished.value || item.warehouseType === 'finished')
    )
  )
  const initializationWarning = computed(() => {
    const selected = organizations.value.find((item) => item.id === form.value.organizationId)
    if (selected && !selected.initializationClosedAt)
      return `${selected.organizationName}尚未结束库存初始化，请先在“库存初始化”完成结束初始化后再保存单据。`
    if (
      organizations.value.some((item) => item.tenantId === form.value.tenantId) &&
      !organizations.value.some(
        (item) => item.tenantId === form.value.tenantId && item.initializationClosedAt
      )
    )
      return '当前租户没有已结束初始化的库存组织，请先完成库存初始化。'
    return ''
  })
  const requestedTotal = computed(() =>
    lines.value.reduce((total, line) => total + Number(line.requestedQuantity), 0)
  )
  const actualTotal = computed(() =>
    lines.value.reduce((total, line) => total + Number(line.actualQuantity), 0)
  )
  const projectColumns: DataSelectColumn[] = [
    { prop: 'projectCode', label: '项目编码', minWidth: 160 },
    { prop: 'projectName', label: '项目名称', minWidth: 220 },
    { prop: 'customerName', label: '客户', minWidth: 180 }
  ]
  const materialColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 160 },
    { prop: 'materialName', label: '物料名称', minWidth: 180 },
    { prop: 'description', label: '物料描述', minWidth: 220 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 150 }
  ]
  const stockColumns: DataSelectColumn[] = [
    { prop: 'materialDescription', label: '物料描述', minWidth: 190 },
    { prop: 'materialCode', label: '物料编码', minWidth: 140 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 130 },
    {
      prop: 'inventoryUnitName',
      label: '库存单位',
      width: 90,
      formatter: (row) => formatUnitDisplayName(row.inventoryUnitName)
    },
    { prop: 'quantity', label: '库存量', width: 90, align: 'right' },
    { prop: 'availableQuantity', label: '可用库存量', width: 105, align: 'right' },
    { prop: 'allocatedQuantity', label: '已分配量', width: 95, align: 'right' },
    { prop: 'batchNo', label: '批次', minWidth: 120 },
    { prop: 'unitCost', label: '单价', width: 90, align: 'right' },
    { prop: 'amount', label: '金额', width: 100, align: 'right' },
    { prop: 'warehouseName', label: '仓库', minWidth: 120 },
    { prop: 'binName', label: '库位', minWidth: 100 },
    { prop: 'projectName', label: '项目全称', minWidth: 170 }
  ]
  const bomColumns: DataSelectColumn[] = [
    { prop: 'workOrderNo', label: '生产工单', minWidth: 150 },
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialName', label: '物料描述', minWidth: 230 },
    { prop: 'requiredQuantity', label: '需求数量', width: 110, align: 'right' }
  ]
  const workOrderColumns: DataSelectColumn[] = [
    { prop: 'workOrderNo', label: '生产工单', minWidth: 170 },
    { prop: 'materialName', label: '成品物料', minWidth: 220 },
    { prop: 'orderQuantity', label: '工单数量', width: 105, align: 'right' },
    { prop: 'completedQuantity', label: '已报工', width: 95, align: 'right' },
    { prop: 'warehousedQuantity', label: '已入库', width: 95, align: 'right' }
  ]
  const packColumns: DataSelectColumn[] = [
    { prop: 'packNo', label: '排包单号', minWidth: 190 },
    { prop: 'quantity', label: '整包数量', width: 120, align: 'right' }
  ]
  const packPickerData = computed(() =>
    packs.value.map((item) => ({
      ...item,
      quantity: item.items.reduce((total, entry) => total + Number(entry.pieces), 0)
    }))
  )
  const inboundSourceColumns: DataSelectColumn[] = [
    { prop: 'documentNo', label: '完工入库单号', minWidth: 180 },
    { prop: 'workOrderNo', label: '生产工单', minWidth: 170 },
    { prop: 'materialCode', label: '物料编码', minWidth: 140 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 210 },
    { prop: 'batchNo', label: '批号', minWidth: 130 },
    { prop: 'inboundQuantity', label: '入库数量', width: 105, align: 'right' },
    { prop: 'availableQuantity', label: '可用数量', width: 105, align: 'right' }
  ]
  const bomPickerData = computed(() =>
    bomItems.value.map((item) => ({
      ...item,
      materialCode: item.material.materialCode,
      materialName: item.material.description || item.material.materialName
    }))
  )
  const lineColumns = computed<ColumnOption<DraftLine>[]>(() => [
    ...(mode.value === 'view'
      ? []
      : [{ type: 'selection', width: 48, fixed: 'left' } as ColumnOption<DraftLine>]),
    { prop: 'lineNo', label: '行号', width: 72 },
    { prop: 'materialId', label: '物料描述', minWidth: 245, useSlot: true },
    {
      prop: 'materialCode',
      label: '物料编码',
      minWidth: 145,
      formatter: (row) => row.material?.materialCode || '—'
    },
    {
      prop: 'specificationModel',
      label: '规格型号',
      minWidth: 145,
      formatter: (row) => row.material?.specificationModel || '—'
    },
    ...(isFinished.value
      ? [
          {
            prop: 'productionUnitId',
            label: '生产单位',
            minWidth: 140,
            useSlot: true
          },
          {
            prop: 'workOrderQuantity',
            label: '工单数量',
            minWidth: 120,
            align: 'right' as const,
            formatter: (row: DraftLine) => Number(row.workOrderQuantity || 0).toFixed(4)
          }
        ]
      : []),
    ...(!isFinished.value
      ? [
          {
            prop: 'requestedQuantity',
            label: '申请数量',
            minWidth: 180,
            align: 'right' as const,
            useSlot: true
          }
        ]
      : []),
    {
      prop: 'actualQuantity',
      label: config.value.quantityLabel,
      minWidth: 180,
      align: 'right',
      useSlot: true
    },
    {
      prop: 'inventoryUnitId',
      label: '库存单位',
      minWidth: 140,
      useSlot: true,
      required: mode.value !== 'view'
    },
    { prop: 'projectId', label: '项目名称', minWidth: 145, useSlot: true },
    {
      prop: 'projectCode',
      label: '项目编码',
      minWidth: 140,
      formatter: (row) =>
        projects.value.find((item) => item.id === row.projectId)?.projectCode || '—'
    },
    { prop: 'constructionNo', label: '施工号', minWidth: 140, useSlot: true },
    {
      prop: 'baseUnitId',
      label: '基本单位',
      minWidth: 140,
      useSlot: true
    },
    { prop: 'baseQuantity', label: '基本数量', minWidth: 160, align: 'right' },
    { prop: 'batchNo', label: '批号', minWidth: 140, useSlot: true },
    {
      prop: 'warehouseId',
      label: '仓库',
      minWidth: 160,
      useSlot: true,
      required: mode.value !== 'view'
    },
    {
      prop: 'binId',
      label: '仓位',
      minWidth: 115,
      useSlot: true
    },
    {
      prop: 'availableInventoryQuantity',
      label: '可用库存数量',
      minWidth: 130,
      align: 'right',
      useSlot: true
    },
    ...(!isReturn.value && !isFinished.value
      ? [{ prop: 'sourceBatchId', label: '来源库存批次', minWidth: 180, useSlot: true }]
      : []),
    ...(isReturn.value
      ? [
          {
            prop: 'returnType',
            label: '退料类型',
            minWidth: 145,
            useSlot: true
          }
        ]
      : []),
    {
      prop: 'stockType',
      label: '库存类型',
      minWidth: 155,
      useSlot: true,
      required: mode.value !== 'view'
    },
    {
      prop: 'ownerType',
      label: '货主类型',
      minWidth: 155,
      useSlot: true
    },
    {
      prop: 'ownerId',
      label: '货主',
      minWidth: 150,
      useSlot: true
    },
    {
      prop: 'stockStatus',
      label: '库存状态',
      minWidth: 155,
      useSlot: true
    },
    {
      prop: 'keeperId',
      label: '仓管员',
      minWidth: 115,
      useSlot: true
    },
    { prop: 'auxiliaryQuantity', label: '辅助数量', minWidth: 160, align: 'right' },
    {
      prop: 'auxiliaryUnitId',
      label: '辅助单位',
      minWidth: 105,
      formatter: (row) => unitName(row.auxiliaryUnitId)
    },
    { prop: 'auxiliaryQuantity2', label: '辅助数量2', minWidth: 160, align: 'right' },
    {
      prop: 'auxiliaryUnit2Id',
      label: '辅助单位2',
      minWidth: 110,
      formatter: (row) => unitName(row.auxiliaryUnit2Id)
    },
    { prop: 'productionDate', label: '生产日期', minWidth: 190, useSlot: true },
    { prop: 'expiryDate', label: '有效期至', minWidth: 190, useSlot: true },
    { prop: 'trackingNo', label: '跟踪号', minWidth: 145, useSlot: true },
    {
      prop: 'fulfilledQuantity',
      label: config.value.fulfilledLabel,
      minWidth: 115,
      align: 'right'
    },
    {
      prop: 'remainingQuantity',
      label: config.value.remainingLabel,
      minWidth: 115,
      align: 'right',
      formatter: (row) =>
        round(
          Math.max(
            0,
            Math.abs(Number(row.requestedQuantity)) - Math.abs(Number(row.fulfilledQuantity))
          )
        )
    },
    { prop: 'sourceDocument', label: '来源单据', minWidth: 150 },
    { prop: 'sourceLineNo', label: '源行号', minWidth: 95 },
    { prop: 'remark', label: '备注', minWidth: 180, useSlot: true },
    {
      prop: 'operation',
      label: '操作',
      width: 145,
      fixed: 'right',
      useSlot: true
    }
  ])
  const headerItems = computed<FormItem[]>(() => [
    { key: 'documentNo', label: config.value.numberLabel, type: 'input' },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      options: documentTypes.value.map((item) => ({
        label: item.documentTypeName,
        value: item.id
      })),
      props: { validateEvent: false, onChange: onDocumentTypeChange }
    },
    {
      key: 'businessTypeId',
      label: '业务类型',
      type: 'select',
      options: businessTypes.value.map((item) => ({
        label: item.businessTypeName,
        value: item.id
      })),
      props: {
        validateEvent: false,
        onChange: () => formRef.value?.clearValidate('businessTypeId')
      }
    },
    {
      key: 'organizationId',
      label: '库存组织',
      type: 'treeSelect',
      placeholder: '请选择库存组织',
      props: {
        data: organizationSelectTree.value,
        nodeKey: 'id',
        props: {
          value: 'id',
          label: 'organizationLabel',
          children: 'children',
          disabled: 'disabled'
        },
        filterable: true,
        validateEvent: false,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        onChange: onOrganizationChange
      }
    },
    {
      key: 'businessDate',
      label: '业务日期',
      type: 'date',
      props: {
        valueFormat: 'YYYY-MM-DD',
        class: 'w-full!',
        validateEvent: false,
        onChange: () => formRef.value?.clearValidate('businessDate')
      }
    },
    {
      key: 'warehouseId',
      label: '仓库',
      type: 'select',
      options: eligibleWarehouses.value.map((item) => ({
        label: `${item.warehouseName} · ${item.warehouseCode}`,
        value: item.id
      })),
      props: {
        filterable: true,
        validateEvent: false,
        placeholder: form.value.organizationId ? '请选择仓库' : '请先选择库存组织',
        disabled: !form.value.organizationId,
        noDataText: '当前库存组织暂无可用仓库',
        onChange: onHeaderWarehouseChange
      }
    },
    {
      key: 'workOrderId',
      label: isFinished.value ? '生产工单（单工单模式）' : '生产工单',
      type: 'select',
      options: workOrders.value.map((item) => ({ label: item.workOrderNo, value: item.id })),
      props: {
        filterable: true,
        clearable: true,
        disabled: mode.value === 'view' || !form.value.warehouseId,
        onChange: onWorkOrderChange
      }
    },
    { key: 'projectId', label: '项目名称', type: 'input' },
    { key: 'customerId', label: '客户', type: 'input' },
    {
      key: 'demandDate',
      label: '需求日期',
      type: 'date',
      hidden: props.kind === 'finished_return',
      props: { valueFormat: 'YYYY-MM-DD', class: 'w-full!', disabled: mode.value === 'view' }
    },
    { key: 'applicantId', label: '申请人', type: 'input', hidden: isFinished.value },
    {
      key: 'departmentId',
      label: '申请部门',
      type: 'treeSelect',
      hidden: isFinished.value,
      placeholder: '请选择申请部门',
      props: {
        data: departmentSelectTree.value,
        nodeKey: 'id',
        props: {
          value: 'id',
          label: 'organizationLabel',
          children: 'children',
          disabled: 'disabled'
        },
        filterable: true,
        clearable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false
      }
    },
    { key: 'keeperId', label: '仓管员', type: 'input' },
    { key: 'status', label: '单据状态', type: 'input' },
    {
      key: 'materialStatus',
      label: isFinished.value ? '办理状态' : isReturn.value ? '状态' : '领料状态',
      type: 'input'
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
    documentTypeId: [{ required: true, message: '请选择单据类型', trigger: 'change' }],
    businessTypeId: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    organizationId: [{ required: true, message: '请选择库存组织', trigger: 'change' }],
    businessDate: [{ required: true, message: '请选择业务日期', trigger: 'change' }],
    warehouseId: [{ required: true, message: '请选择仓库', trigger: 'change' }]
  }
  function unitOptions() {
    return units.value.map((item) => ({
      label: `${formatUnitDisplayName(item.unitName)}`,
      value: item.id
    }))
  }
  function unitName(id: string | null | undefined): string {
    return formatUnitDisplayName(units.value.find((item) => item.id === id)?.unitName)
  }
  function projectName(id: string | null): string {
    return projects.value.find((item) => item.id === id)?.projectName ?? '—'
  }
  function warehouseName(id: string): string {
    return warehouses.value.find((item) => item.id === id)?.warehouseName ?? '—'
  }
  function employeeName(id: string | null): string {
    return employees.value.find((item) => item.id === id)?.employeeName ?? '—'
  }
  function round(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000
  }
  function conversionFactor(
    material: WmsMaterialOption | null | undefined,
    unitId: string
  ): number | null {
    if (!material || !unitId) return null
    if (unitId === material.baseUnitId) return 1
    const conversion = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
    if (!conversion || conversion.sourceFactor <= 0 || conversion.baseFactor <= 0) return null
    return conversion.baseFactor / conversion.sourceFactor
  }
  function lineUnitConversionError(line: DraftLine): string {
    if (!line.material || !line.inventoryUnitId || !line.baseUnitId) return ''
    if (
      conversionFactor(line.material, line.inventoryUnitId) &&
      conversionFactor(line.material, line.baseUnitId)
    )
      return ''
    return `第 ${line.lineNo / 10} 行物料 ${line.material.materialCode} 缺少 ${unitName(line.inventoryUnitId)} 与 ${unitName(line.baseUnitId)} 的单位换算关系，请改用已配置的单位，或在 MDM 物料编码中补齐换算关系。`
  }
  function convertedQuantity(
    material: WmsMaterialOption | null | undefined,
    sourceUnitId: string,
    targetUnitId: string | null,
    quantity: number
  ): number | null {
    if (!targetUnitId) return null
    const sourceFactor = conversionFactor(material, sourceUnitId)
    const targetFactor = conversionFactor(material, targetUnitId)
    return sourceFactor && targetFactor ? round((quantity * sourceFactor) / targetFactor) : null
  }
  function syncQuantities(): void {
    const line = editLine.value
    if (!line) return
    const quantity = Number(line.actualQuantity || 0)
    line.baseQuantity = convertedQuantity(
      line.material,
      line.inventoryUnitId,
      line.baseUnitId,
      quantity
    )
    line.auxiliaryQuantity = convertedQuantity(
      line.material,
      line.inventoryUnitId,
      line.auxiliaryUnitId,
      quantity
    )
    line.auxiliaryQuantity2 = convertedQuantity(
      line.material,
      line.inventoryUnitId,
      line.auxiliaryUnit2Id,
      quantity
    )
    line.remainingQuantity = round(
      Math.max(
        0,
        Math.abs(Number(line.requestedQuantity)) - Math.abs(Number(line.fulfilledQuantity))
      )
    )
  }
  function onRequestedQuantityChange(value: number): void {
    if (!editLine.value) return
    const signed = isReturn.value ? -Math.abs(Number(value || 0)) : Math.abs(Number(value || 0))
    editLine.value.requestedQuantity = signed
    editLine.value.actualQuantity = signed
    syncQuantities()
  }
  function onActualQuantityChange(value: number): void {
    if (!editLine.value) return
    editLine.value.actualQuantity = isReturn.value
      ? -Math.abs(Number(value || 0))
      : Math.abs(Number(value || 0))
    if (isFinished.value) editLine.value.requestedQuantity = editLine.value.actualQuantity
    syncQuantities()
  }
  function renumber(): void {
    lines.value.forEach((line, index) => {
      line.lineNo = (index + 1) * 10
    })
  }
  function makeLine(material: WmsMaterialOption, quantity = 0): DraftLine {
    const signed = isReturn.value ? -Math.abs(quantity) : Math.abs(quantity)
    return {
      key: crypto.randomUUID(),
      lineNo: (lines.value.length + 1) * 10,
      materialId: material.id,
      material,
      workOrderId: form.value.workOrderId || null,
      projectId: form.value.projectId || null,
      constructionNo: isFinished.value
        ? workOrders.value.find((item) => item.id === form.value.workOrderId)?.constructionNo ||
          null
        : null,
      inventoryUnitId: material.inventoryUnitId || '',
      productionUnitId: isFinished.value
        ? material.productionUnitId || material.inventoryUnitId || null
        : null,
      workOrderQuantity: isFinished.value
        ? Number(
            workOrders.value.find((item) => item.id === form.value.workOrderId)?.orderQuantity || 0
          ) * (isReturn.value ? -1 : 1)
        : null,
      requestedQuantity: signed,
      actualQuantity: signed,
      baseUnitId: material.baseUnitId || null,
      baseQuantity: convertedQuantity(
        material,
        material.inventoryUnitId || '',
        material.baseUnitId || null,
        signed
      ),
      batchNo: null,
      warehouseId: form.value.warehouseId,
      binId: null,
      sourceBatchId: null,
      packId: null,
      sourceLineId: null,
      returnType: isReturn.value ? 'good' : null,
      stockType: 'normal',
      ownerType: 'self',
      ownerId: null,
      stockStatus: 'available',
      keeperId: form.value.keeperId || null,
      auxiliaryUnitId: material.auxiliaryUnitId || null,
      auxiliaryQuantity: convertedQuantity(
        material,
        material.inventoryUnitId || '',
        material.auxiliaryUnitId || null,
        signed
      ),
      auxiliaryUnit2Id: material.auxiliaryUnit2Id || null,
      auxiliaryQuantity2: convertedQuantity(
        material,
        material.inventoryUnitId || '',
        material.auxiliaryUnit2Id || null,
        signed
      ),
      productionDate: null,
      expiryDate: null,
      trackingNo: null,
      fulfilledQuantity: 0,
      sourceDocument: form.value.workOrderId
        ? workOrders.value.find((item) => item.id === form.value.workOrderId)?.workOrderNo || null
        : null,
      sourceLineNo: null,
      remark: null,
      serialIds: [],
      serialNos: [],
      movementId: null,
      availableInventoryQuantity: 0,
      remainingQuantity: Math.abs(signed),
      serialText: ''
    }
  }
  function quantityCellClass({ column }: { column: { property?: string } }): string {
    return isReturn.value &&
      (column.property === 'requestedQuantity' ||
        column.property === 'actualQuantity' ||
        (isFinished.value && column.property === 'workOrderQuantity'))
      ? 'wms-production-negative-cell'
      : ''
  }
  function onLineSelectionChange(rows: DraftLine[]): void {
    selectedLineIndexes.value = rows
      .map((row) => lines.value.findIndex((item) => item.key === row.key))
      .filter((index) => index >= 0)
  }
  function copySelectedLine(): void {
    const source = lines.value[selectedLineIndexes.value[0]]
    if (!source) return
    lines.value.push({
      ...cloneDeep(source),
      id: undefined,
      key: crypto.randomUUID(),
      movementId: null,
      fulfilledQuantity: 0
    })
    renumber()
    selectedLineIndexes.value = []
  }
  function deleteSelectedLines(): void {
    const selected = new Set(selectedLineIndexes.value)
    lines.value = lines.value.filter((_, index) => !selected.has(index))
    selectedLineIndexes.value = []
    renumber()
  }
  function deleteLine(lineNo: number): void {
    lines.value = lines.value.filter((line) => line.lineNo !== lineNo)
    selectedLineIndexes.value = []
    renumber()
  }
  async function materialApi(params: DataSelectFetchParams) {
    if (isFinished.value) {
      const order = workOrders.value.find((item) => item.id === form.value.workOrderId)
      const material = order?.materialId
        ? (await fetchWmsProductionMaterialsByIds(form.value.tenantId, [order.materialId]))[0]
        : undefined
      const keyword = (params.keyword || '').trim().toLowerCase()
      const data =
        material &&
        (!keyword ||
          [material.materialCode, material.materialName, material.description].some((value) =>
            value?.toLowerCase().includes(keyword)
          ))
          ? [material]
          : []
      return { data, total: data.length }
    }
    return fetchWmsMaterialOptions(
      form.value.tenantId,
      params.keyword || '',
      params.page,
      params.pageSize,
      false,
      getMaterialCategoryIds(materialCategories.value, String(params.filters.categoryId || ''))
    )
  }
  function stockApi(params: DataSelectFetchParams) {
    return fetchWmsProductionStockPage({
      tenantId: form.value.tenantId,
      warehouseId: form.value.warehouseId || undefined,
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
  }
  function inboundSourceApi(params: DataSelectFetchParams) {
    return fetchWmsFinishedInboundSourcePage({
      tenantId: form.value.tenantId,
      workOrderId: form.value.workOrderId || undefined,
      keyword: params.keyword,
      page: params.page,
      pageSize: params.pageSize
    })
  }
  function lineStockApi(line: DraftLine, params: DataSelectFetchParams) {
    return fetchWmsProductionStockPage({
      tenantId: form.value.tenantId,
      materialId: line.materialId,
      warehouseId: line.warehouseId || form.value.warehouseId || undefined,
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
  }
  function addMaterialRows(_ids: unknown, rows: DataSelectRecord[]): void {
    const order = workOrders.value.find((item) => item.id === form.value.workOrderId)
    for (const row of rows) {
      const material = row as WmsMaterialOption
      if (isFinished.value && (!order || material.id !== order.materialId)) continue
      const line = makeLine(material)
      if (order) {
        line.workOrderId = order.id
        line.projectId = order.projectId
        line.constructionNo = order.constructionNo
        line.sourceDocument = order.workOrderNo
      }
      lines.value.push(line)
    }
    renumber()
    materialPickerIds.value = []
    materialPickerRows.value = []
  }
  async function addWorkOrderRows(_ids: unknown, rows: DataSelectRecord[]): Promise<void> {
    const orders = rows as WmsWorkOrderOption[]
    const materialIds = orders.flatMap((item) => (item.materialId ? [item.materialId] : []))
    const materials = await fetchWmsProductionMaterialsByIds(form.value.tenantId, uniq(materialIds))
    const byId = new Map(materials.map((item) => [item.id, item]))
    let added = 0
    for (const order of orders) {
      const material = order.materialId ? byId.get(order.materialId) : undefined
      const remaining = Number(order.completedQuantity) - Number(order.warehousedQuantity)
      if (!material || remaining <= 0) continue
      const line = makeLine(material, Math.min(remaining, 1))
      line.workOrderId = order.id
      line.projectId = order.projectId
      line.constructionNo = order.constructionNo
      line.workOrderQuantity = Number(order.orderQuantity)
      line.sourceDocument = order.workOrderNo
      lines.value.push(line)
      added++
    }
    if (orders.length === 1) {
      form.value.workOrderId = orders[0].id
      form.value.projectId = orders[0].projectId || ''
      form.value.customerId =
        projects.value.find((item) => item.id === orders[0].projectId)?.customerId || ''
      packs.value = await fetchWmsPackOptions(orders[0].id)
    } else if (orders.length > 1) {
      form.value.workOrderId = ''
      form.value.projectId = ''
      form.value.customerId = ''
      packs.value = []
    }
    renumber()
    workOrderPickerIds.value = []
    workOrderPickerRows.value = []
    if (!added) ElMessage.warning('所选工单暂无已报工未入库的成品数量')
    else if (added < orders.length)
      ElMessage.warning(`已带入 ${added} 行；无可入库数量的工单已跳过`)
  }
  async function addPackRows(_ids: unknown, rows: DataSelectRecord[]): Promise<void> {
    const order = workOrders.value.find((item) => item.id === form.value.workOrderId)
    if (!order?.materialId) return
    const material = (
      await fetchWmsProductionMaterialsByIds(form.value.tenantId, [order.materialId])
    )[0]
    if (!material) return
    for (const row of rows) {
      const pack = row as WmsPackOption & { quantity: number }
      if (lines.value.some((item) => item.packId === pack.id)) continue
      const line = makeLine(material, Number(pack.quantity))
      line.workOrderId = order.id
      line.projectId = order.projectId
      line.constructionNo = order.constructionNo
      line.workOrderQuantity = Number(order.orderQuantity)
      line.packId = pack.id
      line.sourceDocument = pack.packNo
      lines.value.push(line)
    }
    renumber()
    packPickerIds.value = []
    packPickerRows.value = []
  }
  async function addInboundSourceRows(_ids: unknown, rows: DataSelectRecord[]): Promise<void> {
    const sources = rows as WmsFinishedInboundSourceOption[]
    if (!sources.length) return
    if (sources.some((item) => item.workOrderId !== sources[0].workOrderId)) {
      ElMessage.warning('一张完工退库单只能选择同一生产工单的入库明细')
      return
    }
    if (!form.value.warehouseId) {
      form.value.warehouseId = sources[0].warehouseId
      const warehouse = warehouses.value.find((item) => item.id === form.value.warehouseId)
      if (warehouse) {
        form.value.organizationId = warehouse.organizationId
        form.value.tenantId = warehouse.tenantId
      }
      workOrders.value = await fetchWmsWorkOrderOptions(form.value.warehouseId)
    }
    if (sources.some((item) => item.warehouseId !== form.value.warehouseId)) {
      ElMessage.warning('请选择与单据表头仓库一致的完工入库明细')
      return
    }
    const materials = await fetchWmsProductionMaterialsByIds(
      form.value.tenantId,
      uniq(sources.map((item) => item.materialId))
    )
    const byId = new Map(materials.map((item) => [item.id, item]))
    for (const source of sources) {
      const material = byId.get(source.materialId)
      if (!material || lines.value.some((item) => item.sourceLineId === source.id)) continue
      const line = makeLine(
        material,
        Math.min(Number(source.availableQuantity), Number(source.inboundQuantity), 1)
      )
      line.workOrderId = source.workOrderId
      line.projectId = source.projectId
      line.constructionNo = source.constructionNo
      line.inventoryUnitId = source.inventoryUnitId
      line.productionUnitId = source.productionUnitId
      line.workOrderQuantity =
        source.workOrderQuantity == null ? null : -Math.abs(Number(source.workOrderQuantity))
      line.warehouseId = source.warehouseId
      line.binId = source.binId
      line.sourceBatchId = source.sourceBatchId
      line.sourceLineId = source.id
      line.batchNo = source.batchNo
      line.stockType = source.stockType
      line.ownerType = source.ownerType
      line.ownerId = source.ownerId
      line.stockStatus = source.stockStatus
      line.availableInventoryQuantity = Number(source.availableQuantity)
      line.sourceDocument = source.documentNo
      line.sourceLineNo = String(source.lineNo)
      lines.value.push(line)
    }
    form.value.workOrderId = sources[0].workOrderId
    form.value.projectId = sources[0].projectId || ''
    form.value.customerId =
      projects.value.find((item) => item.id === sources[0].projectId)?.customerId || ''
    renumber()
    inboundSourceIds.value = []
    inboundSourceRows.value = []
  }
  function addBomRows(_ids: unknown, rows: DataSelectRecord[]): void {
    for (const row of rows) {
      const item = row as WmsProductionBomItem
      const line = makeLine(item.material, item.requiredQuantity)
      line.sourceDocument = item.workOrderNo
      line.sourceLineNo = item.sourceLineNo
      lines.value.push(line)
    }
    renumber()
    bomPickerIds.value = []
    bomPickerSelected.value = []
  }
  function addStockRows(_ids: unknown, rows: DataSelectRecord[]): void {
    for (const row of rows) {
      const stock = row as WmsProductionStockOption
      if (!stock.material) continue
      const material = { ...stock.material, id: stock.materialId } as WmsMaterialOption
      const line = makeLine(material, Math.min(stock.availableQuantity, 1))
      line.sourceBatchId = isReturn.value ? null : stock.id
      line.batchNo = stock.batchNo
      line.warehouseId = stock.warehouseId
      line.binId = stock.binId
      line.projectId = stock.projectId || form.value.projectId || null
      line.availableInventoryQuantity = stock.availableQuantity
      line.ownerType = stock.ownerType as DraftLine['ownerType']
      line.ownerId = stock.ownerId
      lines.value.push(line)
    }
    renumber()
    stockPickerIds.value = []
    stockPickerRows.value = []
  }
  function onProjectSelected(rows: DataSelectRecord[]): void {
    const project = rows[0] as WmsProductionProjectOption | undefined
    form.value.projectId = project?.id || ''
    form.value.customerId = project?.customerId || ''
  }
  function onInlineProjectSelected(line: DraftLine, rows: DataSelectRecord[]): void {
    line.projectId = (rows[0] as WmsProductionProjectOption | undefined)?.id || null
  }
  function onApplicantChange(_id: unknown, rows: EmployeeIntegrationItem[]): void {
    const employee = rows[0]
    form.value.applicantId = employee?.id || ''
    form.value.departmentId = employee?.organizationId || ''
    selectedApplicant.value = rows
    employees.value = [...employees.value.filter((item) => item.id !== employee?.id), ...rows]
  }
  function onKeeperChange(_id: unknown, rows: EmployeeIntegrationItem[]): void {
    form.value.keeperId = rows[0]?.id || ''
    selectedKeeper.value = rows
    employees.value = [...employees.value.filter((item) => item.id !== rows[0]?.id), ...rows]
    lines.value.forEach((line) => {
      if (!line.keeperId) line.keeperId = form.value.keeperId || null
    })
  }
  let inlineOptionRequest = 0
  function invalidateInlineOptions(): void {
    inlineOptionRequest++
    serialRequest++
  }
  onUnmounted(invalidateInlineOptions)
  async function onInlineBatchSelected(line: DraftLine, rows: DataSelectRecord[]): Promise<void> {
    const request = ++inlineOptionRequest
    serialRequest++
    line.serialIds = []
    line.serialNos = []
    serials.value = []
    bins.value = []
    const batch = rows[0] as WmsProductionStockOption | undefined
    line.sourceBatchId = batch?.id || null
    if (!batch) return
    line.batchNo = batch.batchNo
    line.warehouseId = batch.warehouseId
    line.binId = batch.binId
    line.availableInventoryQuantity = batch.availableQuantity
    line.ownerType = batch.ownerType as DraftLine['ownerType']
    line.ownerId = batch.ownerId
    try {
      const binRows = await fetchWmsBins(batch.warehouseId)
      if (
        request !== inlineOptionRequest ||
        line.sourceBatchId !== batch.id ||
        !lines.value.includes(line)
      )
        return
      bins.value = binRows
    } catch (error) {
      if (request === inlineOptionRequest && lines.value.includes(line))
        notifyFriendlyError(error, '来源批次的库位加载失败，请重新选择后重试')
    }
  }
  function syncInlineQuantities(line: DraftLine): void {
    editLine.value = line
    syncQuantities()
  }
  function onInlineRequestedQuantityChange(line: DraftLine, value: number | undefined): void {
    editLine.value = line
    onRequestedQuantityChange(Number(value || 0))
  }
  function onInlineActualQuantityChange(line: DraftLine, value: number | undefined): void {
    editLine.value = line
    onActualQuantityChange(Number(value || 0))
  }
  async function onInlineWarehouseChange(line: DraftLine): Promise<void> {
    line.binId = null
    line.sourceBatchId = null
    line.serialIds = []
    line.serialNos = []
    serialRequest++
    serials.value = []
    await loadInlineBins(line)
  }
  async function loadInlineBins(line: DraftLine): Promise<void> {
    const request = ++inlineOptionRequest
    const warehouseId = line.warehouseId
    bins.value = []
    try {
      const rows = warehouseId ? await fetchWmsBins(warehouseId) : []
      if (
        request !== inlineOptionRequest ||
        line.warehouseId !== warehouseId ||
        !lines.value.includes(line)
      )
        return
      bins.value = rows
    } catch (error) {
      if (request === inlineOptionRequest && lines.value.includes(line))
        notifyFriendlyError(error, '库位加载失败，请重新打开库位选项后重试')
    }
  }
  async function openInlineSerials(line: DraftLine): Promise<void> {
    activeSerialLine.value = line
    serialError.value = false
    serialText.value = line.serialNos.join('\n')
    serialIdsDraft.value = [...line.serialIds]
    await serialDialogRef.value?.handleOpen(undefined, {
      title: `第 ${line.lineNo} 行序列号`,
      showFooter: mode.value !== 'view',
      confirmText: '保存序列号',
      onClose: () => {
        ++serialRequest
        return true
      },
      onConfirm: () => {
        if (serialError.value) return false
        const serialNos = serialText.value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
        const count = isOutbound.value ? serialIdsDraft.value.length : serialNos.length
        if (
          count !== Math.abs(Number(line.actualQuantity)) ||
          (!isOutbound.value && new Set(serialNos).size !== count)
        ) {
          ElMessage.warning(`SN 数量须与${config.value.quantityLabel}一致且不能重复`)
          return false
        }
        line.serialIds = isOutbound.value ? [...serialIdsDraft.value] : []
        line.serialNos = isOutbound.value ? [] : serialNos
        return true
      }
    })
    await loadInlineSerialOptions()
  }
  async function loadInlineSerialOptions(): Promise<void> {
    const line = activeSerialLine.value
    if (!line) return
    const request = ++serialRequest
    serialError.value = false
    serialDialogRef.value?.setLoading(true)
    serialDialogRef.value?.setOptions({ confirmDisabled: true })
    try {
      if (mode.value === 'view' && isOutbound.value) {
        const records = await fetchWmsSerialsByIds(line.serialIds)
        if (request !== serialRequest) return
        if (records.length !== new Set(line.serialIds).size)
          throw new Error('序列号不存在或无权查看')
        serialText.value = records.map((record) => record.serialNo).join('\n')
      } else if (isOutbound.value) {
        const records = line.sourceBatchId ? await fetchWmsBatchSerials(line.sourceBatchId) : []
        if (request !== serialRequest) return
        serials.value = records
      }
      if (request === serialRequest) serialDialogRef.value?.setOptions({ confirmDisabled: false })
    } catch {
      if (request === serialRequest) serialError.value = true
    } finally {
      if (request === serialRequest) serialDialogRef.value?.setLoading(false)
    }
  }
  async function onDocumentTypeChange(): Promise<void> {
    const documentTypeId = form.value.documentTypeId
    const tenantId = form.value.tenantId
    const businessRows =
      documentTypeId && tenantId
        ? await fetchWmsProductionBusinessTypes(props.kind, tenantId, documentTypeId)
        : []
    if (form.value.documentTypeId !== documentTypeId || form.value.tenantId !== tenantId) return
    businessTypes.value = businessRows
    form.value.businessTypeId =
      businessTypes.value.find((item) => item.isDefault)?.id || businessTypes.value[0]?.id || ''
    await nextTick()
    formRef.value?.clearValidate(['documentTypeId', 'businessTypeId'])
  }
  async function loadTenantOptions(tenantId: string): Promise<void> {
    const request = documentRequest
    const [unitRows, documentRows, projectRows, supplierRows, customerRows, categories] =
      await Promise.all([
        fetchWmsUnitOptions(tenantId),
        fetchWmsProductionDocumentTypes(props.kind, tenantId),
        fetchWmsProductionProjects(tenantId),
        fetchWmsInitialOptions('mdm_supplier', tenantId),
        fetchWmsInitialOptions('mdm_customer', tenantId),
        fetchWmsMaterialCategories(tenantId)
      ])
    if (request !== documentRequest || form.value.tenantId !== tenantId) return
    units.value = unitRows
    materialCategories.value = categories
    documentTypes.value = documentRows
    projects.value = projectRows.map((item) => ({
      ...item,
      customerName: item.customer?.customerName || ''
    }))
    suppliers.value = supplierRows
    customers.value = customerRows
    if (
      !form.value.documentTypeId ||
      !documentRows.some((item) => item.id === form.value.documentTypeId)
    )
      form.value.documentTypeId = documentRows.find((item) => item.isDefault)?.id || ''
    const documentTypeId = form.value.documentTypeId
    const businessRows = documentTypeId
      ? await fetchWmsProductionBusinessTypes(props.kind, tenantId, documentTypeId)
      : []
    if (
      request !== documentRequest ||
      form.value.tenantId !== tenantId ||
      form.value.documentTypeId !== documentTypeId
    )
      return
    businessTypes.value = businessRows
    if (
      !form.value.businessTypeId ||
      !businessTypes.value.some((item) => item.id === form.value.businessTypeId)
    )
      await onDocumentTypeChange()
  }
  async function loadOptions(): Promise<void> {
    const request = documentRequest
    optionError.value = false
    try {
      const [orgPage, warehouseRows, organizationResult] = await Promise.all([
        fetchWmsInventoryOrganizations({
          tenantId: effectiveTenantId.value || undefined,
          current: 1,
          size: 2000
        }),
        fetchWmsWarehouses(effectiveTenantId.value || undefined),
        fetchOrganizationOptionsTree({
          tenantId: effectiveTenantId.value || undefined,
          status: '1'
        })
      ])
      if (request !== documentRequest) return
      organizations.value = orgPage.data
      warehouses.value = warehouseRows
      organizationTree.value = organizationResult.data ?? []
      const initializedOrganizations = organizations.value.filter(
        (item) => item.initializationClosedAt
      )
      if (!form.value.organizationId)
        form.value.organizationId =
          initializedOrganizations.find((item) => item.isDefault)?.id ||
          (initializedOrganizations.length === 1 ? initializedOrganizations[0].id : '')
      if (!form.value.tenantId && form.value.organizationId)
        form.value.tenantId =
          organizations.value.find((item) => item.id === form.value.organizationId)?.tenantId || ''
      if (form.value.tenantId) await loadTenantOptions(form.value.tenantId)
      if (request !== documentRequest) return
      if (form.value.warehouseId) {
        const rows = await fetchWmsWorkOrderOptions(form.value.warehouseId)
        if (request !== documentRequest) return
        workOrders.value = rows
      }
      if (isFinished.value && form.value.workOrderId) {
        const rows = await fetchWmsPackOptions(form.value.workOrderId)
        if (request !== documentRequest) return
        packs.value = rows
      }
      if (!isFinished.value && form.value.workOrderId && form.value.tenantId) {
        const rows = await fetchWmsProductionBomItems(form.value.workOrderId, form.value.tenantId)
        if (request !== documentRequest) return
        bomItems.value = rows
      }
      const ids = [
        form.value.applicantId,
        form.value.keeperId,
        ...lines.value.map((line) => line.keeperId)
      ].filter((id): id is string => Boolean(id))
      if (ids.length && form.value.tenantId) {
        const fetchedEmployees = await fetchEmployeeReferencesByIds(form.value.tenantId, uniq(ids))
        if (request !== documentRequest) return
        employees.value = fetchedEmployees
        selectedApplicant.value = fetchedEmployees.filter(
          (item) => item.id === form.value.applicantId
        )
        selectedKeeper.value = fetchedEmployees.filter((item) => item.id === form.value.keeperId)
      }
    } catch {
      if (request === documentRequest) optionError.value = true
    } finally {
      if (request === documentRequest)
        drawerRef.value?.setOptions({
          confirmDisabled:
            parsing.value || importing.value || optionError.value || Boolean(documentError.value)
        })
    }
  }
  async function onOrganizationChange(organizationId: string): Promise<void> {
    form.value.organizationId = organizationId
    const org = organizations.value.find((item) => item.id === organizationId)
    const tenantChanged = Boolean(org && org.tenantId !== form.value.tenantId)
    form.value.warehouseId = ''
    form.value.workOrderId = ''
    lines.value = []
    bomItems.value = []
    packs.value = []
    workOrders.value = []
    if (tenantChanged && org) {
      form.value.tenantId = org.tenantId
      form.value.projectId = ''
      form.value.customerId = ''
      form.value.documentTypeId = ''
      form.value.businessTypeId = ''
      form.value.applicantId = ''
      form.value.departmentId = ''
      form.value.keeperId = ''
      selectedApplicant.value = []
      selectedKeeper.value = []
      employees.value = []
      await loadTenantOptions(org.tenantId)
    }
    await nextTick()
    formRef.value?.clearValidate()
  }
  async function onHeaderWarehouseChange(warehouseId: string): Promise<void> {
    form.value.warehouseId = warehouseId
    formRef.value?.clearValidate('warehouseId')
    form.value.workOrderId = ''
    bomItems.value = []
    packs.value = []
    const warehouseWorkOrders = warehouseId ? await fetchWmsWorkOrderOptions(warehouseId) : []
    if (form.value.warehouseId !== warehouseId) return
    workOrders.value = warehouseWorkOrders
    if (isFinished.value) lines.value = []
    else
      lines.value.forEach((line) => {
        line.warehouseId = form.value.warehouseId
      })
  }
  async function onWorkOrderChange(): Promise<void> {
    const workOrderId = form.value.workOrderId
    const tenantId = form.value.tenantId
    const order = workOrders.value.find((item) => item.id === workOrderId)
    if (isFinished.value) lines.value = []
    form.value.projectId = order?.projectId || ''
    form.value.customerId =
      projects.value.find((item) => item.id === order?.projectId)?.customerId || ''
    const packRows = isFinished.value && order ? await fetchWmsPackOptions(order.id) : []
    const bomRows =
      !isFinished.value && workOrderId && tenantId
        ? await fetchWmsProductionBomItems(workOrderId, tenantId)
        : []
    if (form.value.workOrderId !== workOrderId || form.value.tenantId !== tenantId) return
    packs.value = packRows
    bomItems.value = bomRows
  }
  function onImportError(): void {
    ElMessage.error('导入失败，请检查 Excel 文件格式')
  }
  function onImportParsing(value: boolean): void {
    parsing.value = value
    drawerRef.value?.setOptions({
      confirmDisabled:
        parsing.value || importing.value || optionError.value || Boolean(documentError.value)
    })
  }
  async function importLines(rows: Array<Record<string, unknown>>): Promise<void> {
    if (importing.value || mode.value === 'view' || !form.value.tenantId || !openData.value) return
    const request = documentRequest
    const tenantId = form.value.tenantId
    const organizationId = form.value.organizationId
    importing.value = true
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      if (!rows.length || rows.length > 500) throw new Error('请选择包含 1 至 500 行生产明细的文件')
      const source = rows.map((row, index) => {
        const fileRow = index + 2
        const code = String(row['物料编码'] ?? row.materialCode ?? '').trim()
        if (!code) throw new Error(`第 ${fileRow} 行请填写物料编码`)
        const requested = normalizeNullableNumber(
          row['申请数量'] ?? row['入库数量'] ?? row.requestedQuantity ?? row.actualQuantity
        )
        const actual = normalizeNullableNumber(
          row['实发数量'] ??
            row['入库数量'] ??
            row.actualQuantity ??
            row['申请数量'] ??
            row.requestedQuantity
        )
        if (requested === null || actual === null || requested === 0 || actual === 0)
          throw new Error(`第 ${fileRow} 行请填写有效且非零的数量`)
        if (Math.abs(actual) > Math.abs(requested))
          throw new Error(`第 ${fileRow} 行实际数量不得超过申请数量`)
        return {
          code,
          requested,
          actual,
          fileRow,
          batch: String(row['批号'] ?? row.batchNo ?? '').trim()
        }
      })
      const materials = await fetchWmsProductionMaterialsByCodes(
        tenantId,
        uniq(source.map((item) => item.code))
      )
      if (request !== documentRequest) return
      if (form.value.tenantId !== tenantId || form.value.organizationId !== organizationId)
        throw new Error('库存组织已变更，请重新导入明细')
      const byCode = groupBy(materials, 'materialCode')
      const imported: DraftLine[] = []
      for (const item of source) {
        const matches = byCode[item.code] ?? []
        if (matches.length !== 1)
          throw new Error(
            `第 ${item.fileRow} 行物料编码“${item.code}”未匹配到唯一物料，请检查当前租户物料`
          )
        const line = makeLine(matches[0], item.requested)
        line.actualQuantity = isReturn.value ? -Math.abs(item.actual) : Math.abs(item.actual)
        line.batchNo = normalizeNullableText(item.batch)
        imported.push(line)
      }
      lines.value.push(...imported)
      renumber()
      ElMessage.success(`已导入 ${imported.length} 行，请核对数量、仓库和库存类型`)
    } catch (error) {
      if (request === documentRequest)
        notifyFriendlyError(error, '导入失败，请检查物料编码、数量和网络后重试')
    } finally {
      if (request === documentRequest) {
        importing.value = false
        drawerRef.value?.setOptions({
          confirmDisabled:
            parsing.value || importing.value || optionError.value || Boolean(documentError.value)
        })
      }
    }
  }
  async function save(): Promise<boolean> {
    if (parsing.value || importing.value || optionError.value || documentError.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '生产物料单据校验未完成，请稍后重试', 'warning')
      return false
    }
    if (
      !form.value.tenantId ||
      !form.value.organizationId ||
      !form.value.warehouseId ||
      !form.value.documentTypeId ||
      !form.value.businessTypeId
    ) {
      ElMessage.warning('请填写库存组织、仓库、单据类型和业务类型')
      return false
    }
    if (
      !organizations.value.find((item) => item.id === form.value.organizationId)
        ?.initializationClosedAt
    ) {
      ElMessage.warning('库存组织尚未结束初始化，请先在“库存初始化”完成结束初始化后再保存单据')
      return false
    }
    if (
      isFinished.value &&
      lines.value.some((line) => !line.workOrderId || !line.productionUnitId)
    ) {
      ElMessage.warning('完工明细必须选择生产工单和生产单位')
      return false
    }
    if (!lines.value.length) {
      ElMessage.warning('请至少添加一行物料')
      return false
    }
    const conversionError = lines.value.map(lineUnitConversionError).find(Boolean)
    const validation = await lineTableRef.value?.validate()
    if (!validation?.valid) {
      if (validation?.firstError) ElMessage.warning(validation.firstError.message)
      return false
    }
    if (conversionError) {
      ElMessage.warning(conversionError)
      return false
    }
    const invalid = lines.value.find((line) => {
      const requested = Number(line.requestedQuantity)
      const actual = Number(line.actualQuantity)
      return (
        !line.materialId ||
        !line.inventoryUnitId ||
        !line.warehouseId ||
        !line.stockType ||
        !Number.isFinite(requested) ||
        !Number.isFinite(actual) ||
        (isReturn.value ? requested >= 0 || actual >= 0 : requested <= 0 || actual <= 0) ||
        Math.abs(actual) > Math.abs(requested) ||
        (props.kind === 'finished_return' && (!line.sourceLineId || !line.sourceBatchId)) ||
        (line.ownerType !== 'self' && !line.ownerId)
      )
    })
    if (invalid) {
      ElMessage.warning(`第 ${invalid.lineNo} 行未填写完整，或数量方向/范围不正确`)
      return false
    }
    for (const line of lines.value) {
      if (
        isOutbound.value &&
        line.sourceBatchId &&
        Math.abs(Number(line.actualQuantity)) > Number(line.availableInventoryQuantity)
      ) {
        ElMessage.warning(`第 ${line.lineNo} 行${config.value.quantityLabel}超过可用库存`)
        return false
      }
      const serialCount = isOutbound.value ? line.serialIds.length : line.serialNos.length
      if (
        line.material?.serialManagementEnabled &&
        serialCount !== Math.abs(Number(line.actualQuantity))
      ) {
        ElMessage.warning(`第 ${line.lineNo} 行 SN 数量必须等于${config.value.quantityLabel}`)
        return false
      }
      editLine.value = line
      syncQuantities()
    }
    editLine.value = null
    const payload: WmsProductionMaterialInput = {
      id: mode.value === 'edit' ? form.value.id : undefined,
      saveAction: mode.value === 'copy' ? 'copy' : mode.value === 'edit' ? 'edit' : 'add',
      tenantId: form.value.tenantId,
      kind: props.kind,
      documentTypeId: form.value.documentTypeId,
      businessTypeId: form.value.businessTypeId,
      organizationId: form.value.organizationId,
      businessDate: form.value.businessDate,
      warehouseId: form.value.warehouseId,
      workOrderId: form.value.workOrderId || null,
      projectId: form.value.projectId || null,
      demandDate: form.value.demandDate || null,
      applicantId: form.value.applicantId || null,
      departmentId: form.value.departmentId || null,
      keeperId: form.value.keeperId || null,
      remark: normalizeNullableText(form.value.remark),
      lines: lines.value.map((line) => ({
        materialId: line.materialId,
        workOrderId: line.workOrderId,
        projectId: line.projectId,
        constructionNo: normalizeNullableText(line.constructionNo),
        inventoryUnitId: line.inventoryUnitId,
        productionUnitId: line.productionUnitId,
        workOrderQuantity: line.workOrderQuantity,
        requestedQuantity: Number(line.requestedQuantity),
        actualQuantity: Number(line.actualQuantity),
        baseUnitId: line.baseUnitId,
        baseQuantity: line.baseQuantity,
        batchNo: normalizeNullableText(line.batchNo),
        warehouseId: line.warehouseId,
        binId: line.binId,
        sourceBatchId: line.sourceBatchId,
        packId: line.packId,
        sourceLineId: line.sourceLineId,
        returnType: line.returnType,
        stockType: line.stockType,
        ownerType: line.ownerType,
        ownerId: line.ownerId,
        stockStatus: line.stockStatus,
        keeperId: line.keeperId,
        auxiliaryUnitId: line.auxiliaryUnitId,
        auxiliaryQuantity: line.auxiliaryQuantity,
        auxiliaryUnit2Id: line.auxiliaryUnit2Id,
        auxiliaryQuantity2: line.auxiliaryQuantity2,
        productionDate: line.productionDate,
        expiryDate: line.expiryDate,
        trackingNo: normalizeNullableText(line.trackingNo),
        sourceDocument: normalizeNullableText(line.sourceDocument),
        sourceLineNo: normalizeNullableText(line.sourceLineNo),
        remark: normalizeNullableText(line.remark),
        serialIds: line.serialIds,
        serialNos: line.serialNos
      }))
    }
    try {
      await saveWmsProductionMaterial(payload)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '生产物料单据保存失败，请检查明细和库存状态后重试')
      return false
    }
  }
  async function handleOpen(data: OpenData): Promise<void> {
    invalidateInlineOptions()
    ++documentRequest
    importing.value = false
    parsing.value = false
    openData.value = data
    documentError.value = ''
    mode.value = data.mode
    importIntent.value = Boolean(data.importIntent)
    selectIntent.value = Boolean(data.selectIntent)
    await drawerRef.value?.handleOpen(data, {
      title:
        data.mode === 'create'
          ? `新增${title.value}`
          : data.mode === 'copy'
            ? `复制${title.value}`
            : data.mode === 'edit'
              ? `编辑${title.value}`
              : `${title.value}详情`,
      subtitle: '月度三位流水号自动生成',
      loading: true,
      loadingText: '正在加载单据资料…',
      showFooter: data.mode !== 'view',
      confirmText: data.mode === 'copy' ? '保存副本' : '保存',
      onConfirm: save,
      onClose: () => {
        ++documentRequest
        importing.value = false
        parsing.value = false
        openData.value = undefined
        return true
      }
    })
    await reloadDocument()
  }
  async function reloadDocument(): Promise<void> {
    const data = openData.value
    if (!data) return
    const currentRequest = ++documentRequest
    documentError.value = ''
    drawerRef.value?.setLoading(true)
    drawerRef.value?.setOptions({ confirmDisabled: true })
    try {
      const source = data.documentId
        ? await fetchWmsProductionMaterialDocument(data.documentId)
        : undefined
      if (currentRequest !== documentRequest) return
      if (source && source.kind !== props.kind) throw new Error('单据类型不匹配')
      currentDocument.value = source ?? null
      Object.assign(form.value, {
        id: data.mode === 'edit' ? source?.id || '' : '',
        tenantId: source?.tenantId || effectiveTenantId.value || '',
        documentNo: data.mode === 'copy' ? '' : source?.documentNo || '',
        documentTypeId: source?.documentTypeId || '',
        businessTypeId: source?.businessTypeId || '',
        organizationId: source?.organizationId || '',
        businessDate: source?.businessDate || dayjs().format('YYYY-MM-DD'),
        warehouseId: source?.warehouseId || '',
        workOrderId: source?.workOrderId || '',
        projectId: source?.projectId || '',
        customerId: source?.customerId || '',
        demandDate: source?.demandDate || '',
        applicantId: source?.applicantId || '',
        departmentId: source?.departmentId || '',
        keeperId: source?.keeperId || '',
        status: data.mode === 'copy' ? 'draft' : source?.status || 'draft',
        materialStatus: data.mode === 'copy' ? 'pending' : source?.materialStatus || 'pending',
        remark: source?.remark || ''
      })
      lines.value =
        source?.lines.map((line) => ({
          ...cloneDeep(line),
          id: data.mode === 'copy' ? undefined : line.id,
          key: crypto.randomUUID(),
          movementId: data.mode === 'copy' ? null : line.movementId,
          fulfilledQuantity: data.mode === 'copy' ? 0 : line.fulfilledQuantity
        })) || []
      selectedApplicant.value = []
      selectedKeeper.value = []
      await loadOptions()
      if (currentRequest !== documentRequest) return
      await nextTick()
      if (currentRequest !== documentRequest) return
      formRef.value?.clearValidate()
      if (source) drawerRef.value?.setOptions({ subtitle: source.documentNo })
      drawerRef.value?.setOptions({
        confirmDisabled: parsing.value || importing.value || optionError.value
      })
    } catch (error) {
      if (currentRequest !== documentRequest) return
      documentError.value = '请重新加载单据；如仍失败，请检查网络和当前单据的查看权限。'
      notifyFriendlyError(error, '生产单据加载失败，请重新加载')
    } finally {
      if (currentRequest === documentRequest) drawerRef.value?.setLoading(false)
    }
  }
  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  @use '@/assets/styles/core/mixin' as layout;

  .wms-editable-line-table {
    @include layout.fill-editable-table-cells;
  }

  .production-header-descriptions :deep(.el-descriptions__table) {
    table-layout: fixed;
  }

  .production-readonly-field {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 36px;
    padding: 0 11px;
    color: var(--el-text-color-primary);
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--el-border-radius-base);
  }

  .production-readonly-field > :first-child {
    color: var(--el-text-color-secondary);
  }

  .production-readonly-field.is-placeholder {
    color: var(--el-text-color-placeholder);
  }

  :deep(td.el-table__cell.wms-production-negative-cell) {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(.wms-production-return-qty .el-input__wrapper) {
    background-color: var(--el-color-warning-light-9);
  }

  :deep(.wms-production-return-qty .el-input__inner) {
    font-weight: 800;
    color: var(--el-color-danger);
  }
</style>
