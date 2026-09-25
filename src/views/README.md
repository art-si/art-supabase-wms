# WMS views

WMS 维护库存状态与仓储作业过程；仓库、库位和物料的统一身份由 MDM 提供。

视图目录与后台 `sys_menu` 的 WMS 菜单路径保持一致：

- `workbench/`：仓储工作台，WMS 一级入口。
- `receipt-issue/`：收发作业，包括收料入库、库存作业和销售退货入库。
- `transfer-adjustment/`：调拨盘调，包括直接调拨、分步调拨、库存盘点、库存调整和库存组装。
- `inventory-trace/`：库存查询，包括即时库存、序列号追溯和库存流水。
- `project-warehouse/`：项目仓储，包括项目施工号和项目仓储复盘。

新增页面时，先确定业务分类，再按 `views/<分类>/<页面>/index.vue` 放置视图；菜单组件路径使用对应的 `/wms/<分类>/<页面>/index`。
