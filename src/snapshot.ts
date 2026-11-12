/**
 * 快照（草稿）持久化。
 * 注意：本模块顶层不得访问 CRUD 的任何值。index 与 snapshot 互为循环依赖，
 * 只要所有 CRUD 引用都发生在函数调用时，模块求值顺序就是安全的
 */
import { isArray, isObject } from "myfx";
import CRUD from "./index";
import {
  CRUDA_KEY_SNAPSHOT,
  FormStatus,
  applyUpdater,
  crudWarn,
} from "./shared";
import type { CRUDStorage } from "./types";

function createMemoryStorage(): CRUDStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    keys: () => Array.from(map.keys()),
  };
}

function createWebStorage(): CRUDStorage {
  return {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
    keys: () => {
      const out: string[] = [];
      const len = localStorage.length;
      if (typeof len !== "number") return out;
      for (let i = 0; i < len; i++) {
        const k = localStorage.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    },
  };
}

/**
 * 检测localStorage是否真的可用。
 * Node 22+、隐私模式、禁用存储的浏览器可能暴露localStorage全局对象但方法不可用
 */
function hasUsableStorage(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function" &&
      typeof localStorage.setItem === "function" &&
      typeof localStorage.removeItem === "function" &&
      typeof localStorage.length === "number"
    );
  } catch (e) {
    //部分浏览器在访问存储属性时抛SecurityError
    return false;
  }
}

export function createDefaultStorage(): CRUDStorage {
  return hasUsableStorage() ? createWebStorage() : createMemoryStorage();
}

export function getSnapshotKey(
  key: string,
  formStatus: number,
  editingId?: string | number
) {
  let type = null;
  if (formStatus == FormStatus.ADD) {
    type = "add";
  } else if (formStatus == FormStatus.UPDATE) {
    type = "update_" + editingId;
  } else if (formStatus == FormStatus.ADD_OR_UPDATE) {
    type = "addOrUpdate_" + editingId;
  }
  return (
    CRUDA_KEY_SNAPSHOT + CRUD._scope() + (key ? "_" + key : "") + "_" + type
  );
}

//snapshots容器的键，新增态固定为空串
export function snapshotId(
  formStatus: number,
  editingId?: string | number
): string {
  return formStatus === FormStatus.ADD ? "" : String(editingId);
}

export function readSnapshot(
  key: string
): Record<string, any> | undefined {
  const data = CRUD._storage.getItem(key);
  if (!data) return undefined;
  try {
    const json = JSON.parse(data);
    //合法JSON也可能是数字/数组等非对象草稿，一律视为损坏
    if (!isObject(json) || isArray(json)) {
      crudWarn("draft data is corrupted and has been ignored", "- recover()");
      return undefined;
    }
    return json;
  } catch (e) {
    crudWarn("draft data is corrupted and has been ignored", "- recover()");
    return undefined;
  }
}

export function _setSnapshot(crud: CRUD, v: any) {
  //查看态不需要草稿
  if (
    crud.formStatus !== FormStatus.ADD &&
    crud.formStatus !== FormStatus.UPDATE &&
    crud.formStatus !== FormStatus.ADD_OR_UPDATE
  ) {
    return;
  }
  let key = getSnapshotKey(crud.key, crud.formStatus, crud.editingId);
  let val: string;
  try {
    val = JSON.stringify(v);
  } catch (e) {
    crudWarn("form data is not serializable, draft skipped", "- saveDraft()");
    return;
  }
  try {
    CRUD._storage.setItem(key, val);
  } catch (e) {
    //隐私模式或配额不足时仍保留内存草稿
    crudWarn("failed to persist draft, kept in memory only", "- saveDraft()");
  }

  //新增态没有editingId，统一用空串作为snapshots的键
  const sid = snapshotId(crud.formStatus, crud.editingId);
  applyUpdater(crud.snapshots, { [sid]: val });
}

export function removeSnapshot(
  key: string,
  formStatus: number,
  editingId: string | number | undefined,
  crud: CRUD
) {
  const skey = getSnapshotKey(key, formStatus, editingId);
  //remove cache
  CRUD._storage.removeItem(skey);

  const sid = snapshotId(formStatus, editingId);
  crud.snapshots[sid] = "";
  delete crud.snapshots[sid];
}
