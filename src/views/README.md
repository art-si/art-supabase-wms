# WMS views

WMS 维护库存状态与仓储作业过程；仓库、库位和物料的统一身份由 MDM 提供。

视图目录与后台 `sys_menu` 的 WMS 菜单路径保持一致：

- `workbench/`：仓储工作台，WMS 一级入口。
- `initialization/`：初始化，包括期初库存、期初采购和销售单据、启用库存及初始化关账。
- `production-inout/`：生产出入库，包括生产领料、生产退料、完工入库和完工退库单据。
- `receipt-issue/`：收发作业，包括收料入库、库存作业和销售退货入库。
- `inbound-business/`：采购、其他及受托加工入库单据。
- `outbound-business/`：销售、其他及领料出库单据。
- `transfer-business/`：调拨申请、直接调拨与分步调拨。
- `count-business/`：库存盘点及盘盈盘亏单据。
- `adjustment-business/`：库存调整与库存组装。
- `inventory-trace/`：库存查询，包括即时库存、库存流水、库存台账和物料收发明细表；序列号追溯保留为业务直达页。
- `project-warehouse/`：项目仓储，包括项目施工号和项目仓储复盘。

新增页面时，先确定业务分类，再按 `views/<分类>/<页面>/index.vue` 放置视图；菜单组件路径使用对应的 `/wms/<分类>/<页面>/index`。

## 排包来源字段

- 完工入库、完工退库和四个库存查询列表复用 `shared/wms-pack-composition-columns.tsx`，在原明细行内逐行对应展示包内编号、长度和块数。
- `packDetails` 表示原始排包组成。库存仍按批次、流水或台账原有粒度核算，不将包内板材展开为多条库存记录，也不据此推算逐板材库存余量。
- 完工单据中的已入库数量使用工单累计净入库量，退库过账后扣减；未入库数量为工单数量减去累计净入库量，两项均使用工单单位。
