# Compact UI design QA

## Reference and method

- Mini Today reference: `C:/Users/LiangYS/AppData/Local/Temp/codex-clipboard-e74e38fd-babf-4af5-bada-9c392b70b712.png` (518 × 822).
- Workstation reference: `C:/Users/LiangYS/AppData/Local/Temp/codex-clipboard-71a98b1f-d637-4f24-9b5a-d0b2900aac3d.png` (518 × 504).
- Compared the implemented compact surfaces at the matching 500px logical width. The Electron smoke separately exercised the native Mini geometry, Edge collapse/restore, and second-instance restore path.

## Checked against the reference

| Surface | Verified implementation contract |
| --- | --- |
| Mini Today | 52px single header; 16px side insets; 18px white section cards; 468px inner card width at 500px; scheduled and unscheduled rows retain time/checkbox/project/title/action on one baseline; bottom full-workspace link remains separate. |
| Workstation | One header title only; header sequence is `工作站 / 今日 / 清空 / 收起 / 关闭`; 16px side insets; white list card; every task row is 76px and keeps `序号 / 【项目】任务名 / 操作` on one baseline. |
| Full schedule | Header, ordinary rows, and inline creation row share a seven-column layout; the project column is constrained and the task column is the only main flexible track, so controls no longer overflow into the quick-task surface. |
| Window chrome | Windows menu is removed; Main is frameless; compact header is the drag region; interactive controls are non-drag; a low-emphasis close button follows the collapse control. |

## Result

**Passed for the rendered compact layout and interaction contract.** Native title-bar feel, cursor hotspot feel, and 100%/125%/150% DPI appearance require the requested user manual acceptance on the target Windows display; those qualities cannot be reliably judged from browser DOM measurements alone.
