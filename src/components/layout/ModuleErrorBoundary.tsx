import { Component, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  /** 模块标识，重置时显示。父组件如果传 key={moduleId} 会让本边界在模块切换时自然 remount，
   * 这里 moduleId 主要用于显示和重试按钮文案。 */
  moduleId?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 模块错误边界——单个模块抛错不要带塌整个 app。
 *
 * 行为：
 *   - 捕获子树同步渲染错误（不含 effect 异步报错）。
 *   - 显示一张错误卡：模块名 + 错误概要 + 复制错误 / 重试按钮。
 *   - 重试通过 setState({ error: null }) 强制重新渲染子树；如果是 chunk 加载错误（lazy import 网络失败）
 *     重新挂载时 React 会重新触发动态 import。
 *
 * 设计取舍：不主动上报到 telemetry，因为本地学习客户端无后端；用 console.error 留痕给开发者。
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    console.error('[ModuleErrorBoundary]', this.props.moduleId, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-accent-fault/40 bg-accent-fault/[0.05] p-5"
        >
          <div className="flex items-center gap-2 text-accent-fault">
            <AlertOctagon className="h-5 w-5" aria-hidden="true" />
            <span className="font-display text-title">模块加载出错</span>
          </div>
          <p className="text-body text-ink-secondary leading-relaxed">
            {this.props.moduleId
              ? <>模块 <span className="font-mono text-ink-primary">{this.props.moduleId}</span> 渲染时抛出异常：</>
              : <>本模块渲染时抛出异常：</>}
          </p>
          <pre className="formula max-h-40 w-full overflow-auto rounded-lg border border-line-subtle bg-bg-base p-3 text-caption text-accent-fault">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-1.5 rounded-xl border border-accent-primary/60 bg-accent-primary/15 px-3 py-1.5 text-body font-medium text-accent-primary transition-colors hover:bg-accent-primary/25"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              重试加载
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard && this.state.error) {
                  navigator.clipboard.writeText(
                    `[${this.props.moduleId ?? 'unknown'}] ${this.state.error.message}\n${this.state.error.stack ?? ''}`,
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line-subtle bg-bg-surface px-3 py-1.5 text-body text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
            >
              复制错误堆栈
            </button>
          </div>
          <p className="text-caption text-ink-muted">其它模块仍可正常使用。重试不解决时检查浏览器控制台堆栈。</p>
        </div>
      );
    }
    return this.props.children;
  }
}
