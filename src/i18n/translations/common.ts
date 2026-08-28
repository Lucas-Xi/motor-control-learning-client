import { e } from '../entries';

/** common 命名空间（由 translations.ts 机械拆分，语义未变）。 */
export const common = {
  yes: e('是', 'Yes'),
  no: e('否', 'No'),
  on: e('开', 'On'),
  off: e('关', 'Off'),
  reset: e('重置', 'Reset'),
  apply: e('应用', 'Apply'),
  cancel: e('取消', 'Cancel'),
  confirm: e('确认', 'Confirm'),
  open: e('打开', 'Open'),
  close: e('关闭', 'Close'),
  expand: e('展开', 'Expand'),
  collapse: e('收起', 'Collapse'),
  loading: e('加载中…', 'Loading…'),
  translationPending: e('（中文版） · English translation pending', '(Chinese only) · English translation pending'),
  language: e('语言', 'Language'),
  switchToEnglish: e('切换到英文', 'Switch to English'),
  switchToChinese: e('切换到中文', 'Switch to Chinese'),
  languageChip: e('中', 'EN'),
  /** 语言 chip 里"另一种语言"的短码：zh 模式显示 EN，en 模式显示 ZH（en-US 值保持 ASCII）。 */
  languageChipOther: e('EN', 'ZH'),
};
