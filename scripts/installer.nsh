; 文件用途：仅由 NSIS 安装流程写入安装标记，目录预览包不启用自动更新。
!macro customInstall
  FileOpen $0 "$INSTDIR\resources\threadline-installed" w
  FileWrite $0 "nsis"
  FileClose $0
!macroend

; 升级卸载阶段保留当前用户选择；真正卸载只删除本应用自己的启动项。
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.doris619619.threadline"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.doris619619.threadline"
  ${endIf}
!macroend
