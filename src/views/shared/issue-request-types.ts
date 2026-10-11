/** Server-supported issue reasons; tenant dictionaries may customize their display labels. */
export const issueRequestTypeLabels: Record<string, string> = {
  damage_outbound: '货损出库',
  consumables_outbound: '耗材出库',
  scrap_outbound: '报废出库',
  welfare_use: '福利领用',
  office_supplies_use: '办公用品领用',
  labor_protection_use: '劳保用品领用'
}
