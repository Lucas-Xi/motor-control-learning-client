import { beforeEach } from 'vitest';
import { useI18nStore } from '../store/i18nStore';

/**
 * 全局测试 setup：把 i18n locale 钉在 zh-CN。
 *
 * 生产态 useI18nStore 按 navigator.language 探测默认语言（英文浏览器首屏英文），
 * 但大量单测断言中文文案。CI runner（Linux en-US）与本地（zh-CN）的
 * navigator.language 不同会导致测试环境相关失败——这里统一钉住初始 locale，
 * 需要测语言切换的用例在自己的测试体内 setLocale/toggle 即可。
 */
beforeEach(() => {
  useI18nStore.setState({ locale: 'zh-CN' });
});
