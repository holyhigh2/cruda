/**
 * 模块间共享的基础设施。
 * 本模块不引用 CRUD，供 index / snapshot / processors 共用，避免形成循环依赖
 */
import { assign, isNil, some } from "myfx";

// 1：新增；2：编辑；3：查看
export enum FormStatus {
  ADD = 1,
  UPDATE = 2,
  VIEW = 3,
  ADD_OR_UPDATE = 4
}

export const CRUDA_KEY_SNAPSHOT = "cruda_snapshot_";

// eslint-disable-next-line require-jsdoc
export function crudWarn(...args: unknown[]): void {
  console.warn("[CRUD] - ", ...args);
}

// eslint-disable-next-line require-jsdoc
export function crudError(...args: unknown[]): void {
  console.error("[CRUD] - ", ...args);
}

/**
 * 主键比较。表格行与表单数据的主键可能一侧是字符串一侧是数字
 * （输入框转数字、JSON 反序列化），严格相等会让自动刷新静默失效
 */
export function sameId(a: unknown, b: unknown): boolean {
  if (isNil(a) || isNil(b)) return false;
  if (a === b) return true;
  //只归一字符串/数字，避免 rowKey 配错指向对象时全部落到 [object Object]
  return (
    (typeof a === "string" || typeof a === "number") &&
    (typeof b === "string" || typeof b === "number") &&
    String(a) === String(b)
  );
}

//主键命中判定。myfx 的 includes 是严格相等，不能直接用于主键匹配
export function includesId(ids: (string | number)[], id: unknown): boolean {
  return some(ids, (v) => sameId(v, id));
}

//适配器未注入时退化为浅赋值，保证草稿等基础能力可用
let innerUpdater: (
  form: Record<string, any>,
  props: Record<string, any>
) => void = (form, props) => {
  assign(form, props);
};

//统一出口，避免调用方直接持有可变的 updater 绑定
export function applyUpdater(
  form: Record<string, any>,
  props: Record<string, any>
): void {
  innerUpdater(form, props);
}

export function _setUpdater(
  updater: (form: Record<string, any>, props: Record<string, any>) => void
) {
  innerUpdater = updater;
}
