<!-- 文件用途：记录本次交互整改已确认的 Threadline 产品边界与平台约束。 -->

# Threadline

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

个人任务工作台的使用者，在桌面浏览器、iPhone PWA 与 Windows Electron 应用中安排任务、执行计时并回顾投入。

## Product Purpose

以同一套任务数据连接今日日程、待安排、阶段计划、项目、Daily、习惯与复盘。

## Capabilities and Constraints

- Next.js App Router 承载业务界面；Web/PWA 运行 Next 服务，Electron 使用独立静态导出。
- 保留任务业务规则、Supabase 与用户数据、计时账本、窗口和紧凑布局功能。
- 本次不改数据库、不部署生产、不合并 PR、不制作 NSIS 安装程序。

## Brand Commitments

保留 Threadline 产品定位、主题色，以及经典与小屋主题的独立美术资产。用户已指定 Apple 应用的克制按钮交互和 P1 弹出菜单参考，采用方案 A 背景反馈，不重新征询方向。

## Accessibility & Inclusion

鼠标、键盘、触摸能力等价；普通焦点以明显背景、内部底线等非环形标记表达，系统强制色模式可使用必要系统轮廓。触屏实际目标优先至少 44×44 CSS px，iPhone 输入字号至少 16px，支持放大与减少动画。

## Evidence on Hand

2026-11-19 用户目标、P1 参考图、Apple HIG 四篇官方原文，以及用户提供的静态审计与方案 A 规范。原演示 HTML 已遗失，用户确认直接按 Apple 规范实施。
