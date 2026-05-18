import { useCallback, useState } from 'react';
import { KeyRound, ShieldAlert, ShieldCheck, Unplug, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useCloudShareStore } from '../../store/cloudShareStore';
import { verifyToken, GistError } from '../../utils/gistCloud';

/**
 * GitHub PAT 凭据管理面板。
 *
 * 安全提示语在 UI 顶部反复强调：
 *   - PAT 仅存 sessionStorage（关闭浏览器即清除）
 *   - 永不写 localStorage / cookie
 *   - 永不上传到本应用之外（仅直接发给 api.github.com）
 *
 * 推荐 PAT 范围：classic token 勾选 `gist` scope 即可；fine-grained 选 Gists: Read & Write。
 */

export function GistCredentialsPanel() {
  const pat = useCloudShareStore((s) => s.pat);
  const ghLogin = useCloudShareStore((s) => s.ghLogin);
  const remaining = useCloudShareStore((s) => s.rateLimitRemaining);
  const limit = useCloudShareStore((s) => s.rateLimitLimit);
  const setPat = useCloudShareStore((s) => s.setPat);
  const setIdentity = useCloudShareStore((s) => s.setIdentity);
  const clearPat = useCloudShareStore((s) => s.clearPat);

  const [draft, setDraft] = useState<string>(pat);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState<string>('');
  const [ok, setOk] = useState<string>('');

  const bound = !!pat && !!ghLogin;

  const handleTest = useCallback(async () => {
    setErr('');
    setOk('');
    const candidate = draft.trim();
    if (!candidate) {
      setErr('请先粘贴 PAT');
      return;
    }
    setTesting(true);
    try {
      const info = await verifyToken(candidate);
      setPat(candidate);
      setIdentity(info.login, info.remaining, info.limit);
      setOk(`已绑定 @${info.login}（剩余配额 ${info.remaining}/${info.limit}）`);
    } catch (e) {
      const msg = e instanceof GistError ? e.message : (e as Error).message;
      setErr(msg);
    } finally {
      setTesting(false);
    }
  }, [draft, setPat, setIdentity]);

  const handleDisconnect = useCallback(() => {
    clearPat();
    setDraft('');
    setErr('');
    setOk('已断开 GitHub 绑定，sessionStorage 中的 PAT 已清除');
  }, [clearPat]);

  return (
    <Card
      density="default"
      tone={bound ? 'measure' : 'default'}
      eyebrow="V2 · GitHub Gist 凭据"
      title="绑定 PAT 启用云端协作"
    >
      <div className="space-y-3">
        {/* 安全警示条 */}
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-accent-warn/40 bg-accent-warn/10 p-2.5 text-caption text-ink-secondary"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
          <div>
            <p className="font-medium text-accent-warn">PAT 仅存当前标签页 session，关闭浏览器后清除。</p>
            <p className="mt-0.5 text-ink-muted">
              永不写入 localStorage / cookie，永不上传到本客户端之外。请使用<strong className="text-ink-secondary">最小权限</strong>
              的 token（classic 勾 <code className="rounded bg-bg-base px-1 font-mono">gist</code>；
              fine-grained 选 Gists: Read &amp; Write）。
            </p>
          </div>
        </div>

        {/* 绑定状态 */}
        <div className="flex flex-wrap items-center gap-3">
          {bound ? (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 rounded-md border border-accent-measure/40 bg-accent-measure/10 px-2 py-1 text-caption text-accent-measure"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              已绑定 @{ghLogin}
            </span>
          ) : (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 rounded-md border border-line-subtle bg-bg-base px-2 py-1 text-caption text-ink-muted"
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              未绑定（仅可读公共 gist）
            </span>
          )}
          {bound && limit > 0 && (
            <span className="text-caption text-ink-muted" aria-label="GitHub API 剩余配额">
              配额 <span className="font-mono text-accent-measure">{remaining}</span> /{' '}
              <span className="font-mono">{limit}</span>
            </span>
          )}
        </div>

        {/* 输入 PAT */}
        <label className="block">
          <span className="mb-1 block text-caption uppercase tracking-[0.18em] text-ink-muted">
            GitHub Personal Access Token
          </span>
          <input
            type="password"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (err) setErr('');
              if (ok) setOk('');
            }}
            placeholder="ghp_xxx 或 github_pat_xxx"
            autoComplete="off"
            spellCheck={false}
            aria-label="GitHub Personal Access Token 输入"
            aria-describedby={err ? 'pat-err' : ok ? 'pat-ok' : undefined}
            aria-invalid={!!err}
            className="w-full rounded-lg border border-line-subtle bg-bg-base px-2.5 py-1.5 font-mono text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
          />
        </label>

        {/* 按钮 */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={handleTest}
            disabled={testing}
            aria-label="测试 PAT 并绑定"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            {testing ? '测试中…' : '测试连接 / 绑定'}
          </Button>
          {bound && (
            <Button variant="danger" onClick={handleDisconnect} aria-label="断开 PAT 绑定">
              <Unplug className="h-4 w-4" aria-hidden="true" />
              断开
            </Button>
          )}
        </div>

        {err && (
          <p
            id="pat-err"
            role="alert"
            className="rounded-md border border-accent-fault/40 bg-accent-fault/10 px-2 py-1 text-caption text-accent-fault"
          >
            <span className="sr-only">错误：</span>
            {err}
          </p>
        )}
        {ok && !err && (
          <p
            id="pat-ok"
            role="status"
            aria-live="polite"
            className="rounded-md border border-accent-measure/40 bg-accent-measure/10 px-2 py-1 text-caption text-accent-measure"
          >
            {ok}
          </p>
        )}
      </div>
    </Card>
  );
}
