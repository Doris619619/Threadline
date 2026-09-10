; 文件用途：仅由 NSIS 安装流程写入安装标记，目录预览包不启用自动更新。
!macro customInstall
  FileOpen $0 "$INSTDIR\resources\threadline-installed" w
  FileWrite $0 "nsis"
  FileClose $0
!macroend
