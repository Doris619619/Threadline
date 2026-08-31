/**
 * @fileoverview 渲染 Threadline 的统一启动加载界面，只呈现真实业务阶段而不驱动启动流程。
 */

'use client';

import { Check, Circle, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import type {
  StartupOperation,
  StartupOperationStatus,
  StartupProgressSnapshot,
} from '@/features/startup/startup-progress-context';

type StartupStepKey = keyof StartupProgressSnapshot;

type StartupStep = {
  key: StartupStepKey;
  label: string;
  operation: StartupOperation;
};

/** 将四个业务状态映射为固定顺序的、面向用户的启动步骤。 */
export function getStartupSteps(progress: StartupProgressSnapshot): StartupStep[] {
  return [
    {
      key: 'authentication',
      label: '恢复登录状态',
      operation: progress.authentication,
    },
    {
      key: 'workspaceInitialization',
      label: '初始化云工作区',
      operation: progress.workspaceInitialization,
    },
    {
      key: 'workspaceData',
      label: '加载工作区数据',
      operation: progress.workspaceData,
    },
    { key: 'realtime', label: '开启实时同步', operation: progress.realtime },
  ];
}

/** 为每个步骤生成状态说明；错误保留上游的真实信息而不伪造成下一阶段。 */
function getStatusCopy(key: StartupStepKey, operation: StartupOperation): string {
  if (operation.status === 'completed') return '已完成';
  if (operation.status === 'pending') return '等待中';
  if (operation.status === 'failed')
    return operation.message ?? '未能完成，请检查网络后重试。';
  if (key === 'authentication') return '正在恢复登录状态…';
  if (key === 'workspaceInitialization') return '正在初始化云工作区…';
  if (key === 'workspaceData') return '正在同步项目、任务与 Daily…';
  return '正在开启实时同步…';
}

/** 渲染单个阶段的语义状态图标，loading 动效只由当前真实状态决定。 */
function StartupStepIcon({ status }: { status: StartupOperationStatus }) {
  if (status === 'completed')
    return <Check aria-hidden="true" size={15} strokeWidth={3} />;
  if (status === 'active')
    return <LoaderCircle aria-hidden="true" size={18} strokeWidth={2.4} />;
  if (status === 'failed')
    return <TriangleAlert aria-hidden="true" size={16} strokeWidth={2.5} />;
  return <Circle aria-hidden="true" size={17} strokeWidth={2} />;
}

/**
 * 呈现移动端优先、桌面自适应的启动页；进度条仅按真实已完成阶段计算，不展示虚构百分比。
 */
export function ThreadlineStartupScreen({
  progress,
}: {
  progress: StartupProgressSnapshot;
}) {
  const steps = getStartupSteps(progress);
  const completedCount = steps.filter(
    (step) => step.operation.status === 'completed',
  ).length;
  const failedStep = steps.find((step) => step.operation.status === 'failed');

  return (
    <main className="threadline-startup" aria-busy={!failedStep}>
      <section className="threadline-startup-visual" aria-hidden="true">
        <span className="threadline-startup-orbit threadline-startup-orbit-primary" />
        <span className="threadline-startup-orbit threadline-startup-orbit-secondary" />
        <span className="threadline-startup-orb threadline-startup-orb-one" />
        <span className="threadline-startup-orb threadline-startup-orb-two" />
        <span className="threadline-startup-layer threadline-startup-layer-back" />
        <span className="threadline-startup-layer threadline-startup-layer-front" />
        <span className="threadline-startup-icon-wrap">
          <Image src="/icon.svg" alt="" width={72} height={72} unoptimized />
        </span>
      </section>

      <section className="threadline-startup-card" aria-label="Threadline 启动进度">
        <div className="threadline-startup-brand">
          <Image src="/icon.svg" alt="" width={28} height={28} unoptimized />
          <span>Threadline</span>
        </div>
        <div className="threadline-startup-heading">
          <h1>正在准备 Threadline</h1>
          <p>正在同步你的项目、任务与 Daily，请稍候。</p>
        </div>

        <ol className="threadline-startup-steps">
          {steps.map((step) => (
            <li
              className={`threadline-startup-step is-${step.operation.status}`}
              data-step={step.key}
              key={step.key}
            >
              <span
                className="threadline-startup-step-icon"
                aria-label={getStatusCopy(step.key, step.operation)}
              >
                <StartupStepIcon status={step.operation.status} />
              </span>
              <span className="threadline-startup-step-copy">
                <strong>{step.label}</strong>
                <small>{getStatusCopy(step.key, step.operation)}</small>
              </span>
            </li>
          ))}
        </ol>

        <div
          className="threadline-startup-progress"
          aria-label={`已完成 ${completedCount} 个启动阶段`}
        >
          <span style={{ transform: `scaleX(${completedCount / steps.length})` }} />
        </div>
        {failedStep && (
          <p className="threadline-startup-error" role="alert">
            {failedStep.label}未完成：
            {failedStep.operation.message ?? '请检查网络后重试。'}
          </p>
        )}
      </section>

      <p className="threadline-startup-security">
        <ShieldCheck aria-hidden="true" size={17} strokeWidth={2.2} />
        数据加密传输，安全守护你的信息
      </p>
    </main>
  );
}
