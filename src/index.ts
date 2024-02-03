/**
 * CRUD 视图模型
 * 提供基于RESTapi方式的CRUD操作及数据托管
 * @author holyhigh
 */
import { map, each, find, filter, includes } from "myfx/collection";
import { append, insert, remove } from "myfx/array";
import { partial } from "myfx/function";
import { startsWith, trim, upperCase, upperFirst } from "myfx/string";
import { uuid } from "myfx/utils";
import {
  isArray,
  isUndefined,
  isObject,
  isFunction,
  isNull,
  isNil,
  isEmpty,
} from "myfx/is";
import { merge, get, set, keys, assign } from "myfx/object";

import { RestUrl, CRUDError, Pagination, AutoResponse, AutoResponseGetter } from "./types";
import { findTreeNode, findTreeNodes } from "myfx";

function viewSetter(v: boolean, prop: string, bind: CRUD["view"]) {
  bind["_" + prop] = v;
}
function viewGetter(prop: string, bind: CRUD["view"]): boolean {
  const v = bind["_" + prop];
  if (!isNil(v)) return v as boolean;
  return isUndefined(CRUD.defaults.view[prop])
    ? false
    : CRUD.defaults.view[prop] || false;
}

const VIEW_PROPS = [
  "opQuery",
  "opAdd",
  "opEdit",
  "opDel",
  "opExport",
  "opImport",
  "opSort",
  "opCopy",
];

function isRecoverable(crudInstance: CRUD) {
  return crudInstance.recoverable || CRUD.defaults.recoverable;
}

const CRUDA_KEY_SNAPSHOT = "cruda_snapshot_";
function getSnapshotKey(
  key: string,
  formStatus: number,
  editingId?: string | number
) {
  let type = null;
  if (formStatus == 1) {
    type = "add";
  } else if (formStatus == 2) {
    type = "edit_" + editingId;
  }
  return (
    CRUDA_KEY_SNAPSHOT + location.href + (key ? "_" + key : "") + "_" + type
  );
}

export function _setSnapshot(crud: CRUD, v: any) {
  let key = getSnapshotKey(crud.key, crud.formStatus, crud.editingId);
  let val = JSON.stringify(v);
  localStorage.setItem(key, val);

  innerUpdater(crud.snapshots, { [crud.editingId]: val });
}

/**
 * 校验器接口，各适配器实现
 */
export interface FormValidator {
  validate: (...args: any[]) => Promise<any>;
}

function removeSnapshot(
  key: string,
  formStatus: number,
  editingId: string | number,
  crud: CRUD
) {
  const skey = getSnapshotKey(key, formStatus, editingId);
  //remove cache
  localStorage.removeItem(skey);

  crud.snapshots[editingId] = "";
  delete crud.snapshots[editingId];
}

/**
 * CRUD容器。每个CRUD服务对应一个实例，提供查询、表格、分页等逻辑托管
 */
class CRUD {
  static request: Function;
  static install: (app: any, options: any) => void;

  // 服务钩子，可以定义全局、实例钩子并支持顺序调用
  static HOOK = {
    BEFORE_QUERY: "CRUD_BEFORE_QUERY", // 查询前回调，可以修改请求参数，比如分页名称等
    AFTER_QUERY: "CRUD_AFTER_QUERY", // 查询后回调，可以获取查询结果
    BEFORE_DELETE: "CRUD_BEFORE_DELETE", // 删除前调用
    AFTER_DELETE: "CRUD_AFTER_DELETE", // 删除后调用
    BEFORE_ADD: "CRUD_BEFORE_ADD", // 新增前调用，可以用来清空表单或产生uuid等
    AFTER_ADD: "CRUD_AFTER_ADD", //提交新增后触发
    BEFORE_EDIT: "CRUD_BEFORE_EDIT", // 编辑前调用，可以用来锁定某些字段等
    AFTER_UPDATE: "CRUD_AFTER_UPDATE", //提交更新后触发
    BEFORE_VIEW: "CRUD_BEFORE_VIEW", // 查看前调用
    AFTER_DETAILS_VIEW: "CRUD_AFTER_DETAILS_VIEW", //查询时开启查询详情后触发
    AFTER_DETAILS_EDIT: "CRUD_AFTER_DETAILS_EDIT", //编辑时开启查询详情后触发
    AFTER_DETAILS: "CRUD_AFTER_DETAILS", //查询/编辑时开启查询详情后触发
    BEFORE_SUBMIT: "CRUD_BEFORE_SUBMIT", // 提交前调用，可以用来处理form字段
    AFTER_SUBMIT: "CRUD_AFTER_SUBMIT", // 提交后调用，可以用来刷新页面、发送通知或者其他操作
    BEFORE_EXPORT: "CRUD_BEFORE_EXPORT", // 导出请求前回调
    AFTER_EXPORT: "CRUD_AFTER_EXPORT", // 获取导出数据后调用
    BEFORE_IMPORT: "CRUD_BEFORE_IMPORT", // 导入请求前回调
    AFTER_IMPORT: "CRUD_AFTER_IMPORT",
    BEFORE_SORT: "CRUD_BEFORE_SORT", //排序框打开前/自动排序启动前
    AFTER_SORT: "CRUD_AFTER_SORT",
    BEFORE_COPY: "CRUD_BEFORE_COPY", //排序框打开前/自动排序启动前
    AFTER_COPY: "CRUD_AFTER_COPY",

    ON_ERROR: "CRUD_ON_ERROR", // 操作发生错误时调用，包括CRUD
    ON_CANCEL: "CRUD_ON_CANCEL", // 表单编辑取消时触发
    ON_VALIDATE: "CRUD_ON_VALIDATE", // 表单校验时触发

    BEFORE_RECOVER: "CRUD_BEFORE_RECOVER", //恢复前触发，如果recoverable开启
  };
  // REST APIs
  static RESTAPI = {
    QUERY: { url: "", method: "GET" },
    ADD: { url: "", method: "POST" },
    UPDATE: { url: "", method: "PUT" },
    DELETE: { url: "", method: "DELETE" },
    EXPORT: { url: "/export", method: "GET" },
    IMPORT: { url: "/import", method: "POST" },
    SORT: { url: "/sort", method: "PUT" },
    COPY: { url: "/copy", method: "POST" },
  };

  //全局默认值
  static defaults: {
    query: Record<string, string>;
    view: Record<string, boolean | undefined>;
    pagination: Pagination;
    table: Record<string, string>;
    recoverable: boolean;
    invalidBreak: boolean;
    autoResponse: AutoResponse;
    [k: string]: Function | boolean | Record<string, any> | Pagination;
  } = {
    query: {},
    view: {},
    pagination: {
      pageSize: 0,
      currentPage: 1,
      total: 0,
    },
    table: {
      rowKey: "",
    },
    recoverable: false,
    invalidBreak: true,
    autoResponse: {
      position: "head",
      validator: () => false,
      childrenKeyField: "children",
    },
  };

  //注册自定义API
  static xApi(
    name: string,
    url: string,
    config?: {
      method?: string;
      loadable: false;
    }
  ) {
    let loadable = get<boolean>(config, "loadable", false);
    let uName = upperCase(name);
    let method = get(config, "method", "GET");
    set(CRUD.RESTAPI, uName, { url: url, method });
    each(["BEFORE", "AFTER"], (v) => {
      set(CRUD.HOOK, v + "_" + uName, `CRUD_${v}_` + uName);
    });
    if (loadable) {
      set(CRUD.prototype.loading, name, false);
    }
    set(
      CRUD.prototype,
      `to${upperFirst(name)}`,
      async function (paramObj: Record<string, any>) {
        let proceed = true;
        await callHook(
          get(CRUD.HOOK, "BEFORE_" + uName),
          this,
          paramObj,
          () => (proceed = false)
        );
        if (!proceed) return;
        if (loadable) {
          set(CRUD.prototype.loading, name, true);
        }

        let rs;
        let error;
        try {
          const restApi = get<{ url: ""; method: "GET" }>(CRUD.RESTAPI, uName);
          rs = await CRUD.request({
            url: this.getRestURL() + restApi.url,
            method: restApi.method,
            data: paramObj,
          });

          await callHook(get(CRUD.HOOK, "AFTER_" + uName), this, rs);
          if (loadable) {
            set(CRUD.prototype.loading, name, false);
          }
        } catch (e) {
          if (loadable) {
            set(CRUD.prototype.loading, name, false);
          }
          callHook(CRUD.HOOK.ON_ERROR, this, e);
          error = e;
        }

        if (error) throw error;

        return rs;
      }
    );
  }

  params: Record<string, any> = {};
  private url: string;
  private urlVar: Record<string, unknown>;

  view: Record<string, boolean | undefined> = {}; //业务组件通过view来控制UI
  loading = {
    // 通过loading状态控制加载
    query: false, // 搜索中
    table: false, // 表格数据加载中
    del: false,
    export: false, // 导出中
    form: false, // 表单数据加载中，包括编辑、查看
    submit: false, // 表单提交中
    import: false, //导入中
    sort: false, //排序中
    copy: false, //复制中
  };
  query: Record<string, any> = {}; //查询数据
  table: {
    rowKey: string;
    data: Record<string, unknown>[];
    selection: Record<string, unknown>[];
    allColumns: Record<string, unknown>[];
    orders: Record<string, unknown>[];
    [propName: string]: string | Record<string, unknown>[];
  } = {
    _rowKey: "", //主键key
    set rowKey(v: string) {
      this._rowKey = v;
    },
    get rowKey(): string {
      const ps = this._rowKey;
      if (ps > 0) return ps;
      return CRUD.defaults.table.rowKey;
    },
    data: [
      // 表单数据托管
    ],
    selection: [], // 当前选中行
    allColumns: [], // 表格所有列，用于动态展示
    orders: [], // 排序列表
  };
  pagination: Pagination = {
    _pageSize: 0,
    set pageSize(v: number) {
      this._pageSize = v;
    },
    // 1. 如果CRUD实例设置了pageSize，以实例为准
    // 2. 如果实例值不合法取defaults
    get pageSize(): number {
      const ps = this._pageSize;
      if (ps > 0) return ps;
      return CRUD.defaults.pagination.pageSize || 15;
    },
    currentPage: 1,
    total: 0,
  };
  sortation = {}; //排序对象
  formStatus: number = 0; // 1：新增；2：编辑；3：查看。适用于组合弹窗或细分弹窗
  form: Record<string, any> = {};
  error = {
    name: "",
    message: "",
    status: "",
  };
  editingId: string | number;
  /**
   * 当启用多实例时的key
   */
  key: string;
  //校验中断
  private _invalidBreak: boolean | undefined = undefined;
  set invalidBreak(v: boolean) {
    this._invalidBreak = v;
  }
  get invalidBreak(): boolean {
    const ps = this._invalidBreak;
    if (!isUndefined(ps)) return ps;
    return CRUD.defaults.invalidBreak || false;
  }
  //可恢复
  private _recoverable: boolean | undefined = undefined;
  set recoverable(v: boolean) {
    this._recoverable = v;
  }
  get recoverable(): boolean {
    const ps = this._recoverable;
    if (!isUndefined(ps)) return ps;
    return CRUD.defaults.recoverable || false;
  }

  autoResponse: AutoResponse = {
    _position: undefined,
    set position(v: "head" | "tail") {
      this._position = v;
    },
    get position(): "head" | "tail" {
      const ps = this._position;
      if (ps) return ps;
      return CRUD.defaults.autoResponse.position;
    },
    _validator: undefined,
    set validator(v: (response: any) => boolean) {
      this._validator = v;
    },
    get validator(): (response: any) => boolean {
      const ps = this._validator;
      if (ps) return ps;
      return CRUD.defaults.autoResponse.validator;
    },
    _getter: undefined,
    set getter(v: undefined | AutoResponseGetter) {
      this._getter = v;
    },
    get getter(): undefined | AutoResponseGetter {
      const ps = this._getter;
      if (ps) return ps;
      return CRUD.defaults.autoResponse.getter;
    },
    _childrenKeyField: undefined,
    set childrenKeyField(v: string) {
      this._childrenKeyField = v;
    },
    get childrenKeyField(): string {
      const ps = this._childrenKeyField;
      if (ps) return ps;
      return CRUD.defaults.autoResponse.childrenKeyField;
    },
  };

  snapshots: Record<string, any> = {};

  constructor(restURL: string | RestUrl, key?: string) {
    let url;
    if (isObject(restURL)) {
      const p = restURL;
      url = p.url;
      this.params = Object.freeze(p);
    } else {
      url = restURL;
    }
    if (!trim(url)) {
      throw new Error("The URL can not be empty");
    }

    Object.defineProperties(this, {
      url: {
        value: url,
        configurable: false,
        writable: false,
      },
      urlVar: {
        value: {},
        configurable: false,
        writable: true,
      },
      error: {
        configurable: false,
        writable: true,
      },
    });

    const viewProps: { [key: string]: unknown } = {};
    each<string>(VIEW_PROPS, (prop) => {
      viewProps[prop] = {
        set: partial(viewSetter, undefined, prop, this.view),
        get: partial(viewGetter, prop, this.view),
      };
      this.view["_" + prop] = undefined;
    });
    Object.defineProperties(this.view, viewProps as PropertyDescriptorMap);

    this.key = key || "";

    //load snapshots
    const preffix =
      CRUDA_KEY_SNAPSHOT + location.href + (key ? "_" + key : "") + "_";
    const ks = filter(keys(localStorage), (k) => startsWith(k, preffix));
    each(ks, (k) => {
      let kk = k.replace(preffix, "");
      if (startsWith(kk, "add")) {
        this.snapshots[""] = localStorage.getItem(k);
      } else if (startsWith(kk, "edit_")) {
        this.snapshots[kk.replace("edit_", "")] = localStorage.getItem(k);
      }
    });
  }

  setURLParams(v: Record<string, unknown>): void {
    this.urlVar = v;
  }

  changeSelection(selection: Record<string, any>[]): void {
    this.table.selection = selection;
  }

  changeOrder(sortData: {
    column: Record<string, any>;
    prop: string;
    order: string | null;
  }): void {
    const isAsc = isNull(sortData.order)
      ? null
      : sortData.order === "ascending";
    const item = find(
      this.table.orders,
      (item: Record<string, any>) => item.column === sortData.prop
    );
    if (item) {
      if (isAsc == null) {
        remove(this.table.orders, item);
      } else {
        item.asc = isAsc;
      }
    } else {
      if (sortData.order != null) {
        this.table.orders.push({ column: sortData.prop, asc: isAsc });
      }
    }

    this.toQuery();
  }

  getRestURL(): string {
    const params = this.urlVar;
    return this.url.replace(/:([^:]+?)(\/|$)/gm, (a, b, c) => params[b] + c);
  }

  getContext(): any {
    return CONTEXT_MAP.get(this);
  }

  async toQuery(query?: Record<string, any>): Promise<unknown> {
    const params = {
      ...merge(this.query, this.params.query, query),
      ...this.pagination,
    };

    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_QUERY,
      this,
      params,
      this.table.orders,
      () => (proceed = false)
    );
    if (!proceed) return;

    this.loading.query = this.loading.table = true;

    let rs;
    let error;
    try {
      rs = await this.doQuery(params);

      await callHook(CRUD.HOOK.AFTER_QUERY, this, rs);
      this.loading.query = this.loading.table = false;
    } catch (e) {
      this.loading.query = this.loading.table = false;
      callHook(CRUD.HOOK.ON_ERROR, this, e);
      error = e;
    }

    if (error) throw error;
    return rs;
  }
  async toDelete(
    rows: Record<string, unknown> | Record<string, unknown>[]
  ): Promise<unknown> {
    let data = isArray(rows) ? rows : [rows];
    let ids: string[] = [];

    // 通过rowKey自动转为id数组
    const rowKey = this.table.rowKey;
    if (rowKey) {
      ids = map<string>(data, (item) => get(item, rowKey));
    } else {
      crudWarn(
        `table.rowKey is a blank value '${rowKey}', it may cause an error`,
        "- toDelete()"
      );
    }

    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_DELETE,
      this,
      data,
      () => (proceed = false)
    );
    if (!proceed) return;

    this.loading.del = this.loading.table = true;

    let rs;
    let error;
    try {
      rs = await this.doDelete(ids);
      const process = getDeleteProcessor(this, ids);
      autoProcess(rs, this, process);

      await callHook(CRUD.HOOK.AFTER_DELETE, this, rs, data, process);
      this.loading.del = this.loading.table = false;
    } catch (e) {
      this.loading.del = this.loading.table = false;
      callHook(CRUD.HOOK.ON_ERROR, this, e);
      error = e;
    }
    if (error) throw error;
    return rs;
  }
  async toExport(): Promise<unknown> {
    const params = {
      ...this.query,
      ...this.pagination,
    };

    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_EXPORT,
      this,
      params,
      this.table.orders,
      () => (proceed = false)
    );
    if (!proceed) return;

    this.loading.export = true;

    let rs;
    let error;
    try {
      rs = await this.doExport(params);

      await callHook(CRUD.HOOK.AFTER_EXPORT, this, rs);
      this.loading.export = false;
    } catch (e) {
      this.loading.export = false;
      callHook(CRUD.HOOK.ON_ERROR, this, e);
      error = e;
    }

    if (error) throw error;

    return rs;
  }
  async toImport(file: File | File[], fieldName: string): Promise<unknown> {
    const params = {};

    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_IMPORT,
      this,
      params,
      file,
      () => (proceed = false)
    );
    if (!proceed) return;

    this.loading.import = true;

    let rs;
    let error;
    try {
      rs = await this.doImport(file, params, fieldName);

      await callHook(CRUD.HOOK.AFTER_IMPORT, this, rs);
      this.loading.import = false;
    } catch (e) {
      this.loading.import = false;
      callHook(CRUD.HOOK.ON_ERROR, this, e);
      error = e;
    }

    if (error) throw error;

    return rs;
  }
  async toSort(): Promise<unknown> {
    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_SORT,
      this,
      this.sortation,
      () => (proceed = false)
    );
    if (!proceed) return;

    this.loading.sort = true;

    let rs;
    let error;
    try {
      rs = await this.doSort();

      await callHook(CRUD.HOOK.AFTER_SORT, this, rs);
      this.loading.sort = false;
    } catch (e) {
      this.loading.sort = false;
      callHook(CRUD.HOOK.ON_ERROR, this, e);
      error = e;
    }

    if (error) throw error;

    return rs;
  }
  async toAdd(...args: unknown[]): Promise<void> {
    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_ADD,
      this,
      () => (proceed = false),
      ...args
    );
    if (!proceed) return;

    if (isRecoverable(this)) {
      let key = getSnapshotKey(this.key, 1);
      let data = localStorage.getItem(key);
      let json = data ? JSON.parse(data) : undefined;
      await callHook(
        CRUD.HOOK.BEFORE_RECOVER,
        this,
        () => (proceed = false),
        json
      );
      if (proceed && json) {
        innerUpdater(this.form, json);
      }
    }

    this.formStatus = 1;
  }
  async toEdit(row: Record<string, unknown>): Promise<unknown> {
    let id = "-";
    const rowKey = this.table.rowKey;
    if (rowKey) {
      id = row[rowKey] as string;
    } else {
      crudWarn(
        `table.rowKey is a blank value [${rowKey}], it may cause an error`,
        "- toEdit()"
      );
    }

    this.editingId = id;

    const params = {
      [rowKey]: id,
    };

    let proceed = true;
    let queryDetails = true;

    await callHook(
      CRUD.HOOK.BEFORE_EDIT,
      this,
      row,
      () => (proceed = false),
      () => (queryDetails = false)
    );
    if (!proceed) return;

    if (isRecoverable(this)) {
      let key = getSnapshotKey(this.key, 2, id);
      let data = localStorage.getItem(key);
      let json = data ? JSON.parse(data) : undefined;
      await callHook(
        CRUD.HOOK.BEFORE_RECOVER,
        this,
        () => (proceed = false),
        json
      );
      if (proceed && json) {
        innerUpdater(this.form, json);
      }
    }

    this.formStatus = 2;
    this.loading.form = true;

    let rs;
    let error;
    if (queryDetails) {
      try {
        rs = await this.getDetails(id, params);
        await callHook(CRUD.HOOK.AFTER_DETAILS, this, rs);
        await callHook(CRUD.HOOK.AFTER_DETAILS_EDIT, this, rs);
      } catch (e) {
        this.loading.form = false;
        callHook(CRUD.HOOK.ON_ERROR, this, e);
        error = e;
      }
    }

    this.loading.form = false;

    if (error) throw error;

    return rs;
  }
  async toView(row: Record<string, unknown>): Promise<unknown> {
    let id = "-";
    const rowKey = this.table.rowKey;
    if (rowKey) {
      id = row[rowKey] as string;
    } else {
      crudWarn(
        `table.rowKey is a blank value [${rowKey}], it may cause an error`,
        "- toView()"
      );
    }

    const params = {
      [rowKey]: id,
    };

    let proceed = true;
    let queryDetails = true;

    await callHook(
      CRUD.HOOK.BEFORE_VIEW,
      this,
      row,
      () => (proceed = false),
      () => (queryDetails = false)
    );
    if (!proceed) return;

    this.formStatus = 3;
    this.loading.form = true;

    let rs;
    let error;
    if (queryDetails) {
      try {
        rs = await this.getDetails(id, params);
        await callHook(CRUD.HOOK.AFTER_DETAILS, this, rs);
        await callHook(CRUD.HOOK.AFTER_DETAILS_VIEW, this, rs);
      } catch (e) {
        this.loading.form = false;
        callHook(CRUD.HOOK.ON_ERROR, this, e);
        error = e;
      }
    }

    this.loading.form = false;

    if (error) throw error;
    return rs;
  }
  async toCopy(
    rows: Record<string, unknown> | Record<string, unknown>[]
  ): Promise<unknown> {
    let data = isArray(rows) ? rows : [rows];
    let ids: string[] = [];

    // 通过rowKey自动转为id数组
    const rowKey = this.table.rowKey;
    if (rowKey) {
      ids = map<string>(data, (item) => get(item, rowKey));
    } else {
      crudWarn(
        `table.rowKey is a blank value '${rowKey}', it may cause an error`,
        "- toCopy()"
      );
    }

    let proceed = true;
    await callHook(CRUD.HOOK.BEFORE_COPY, this, data, () => (proceed = false));
    if (!proceed) return;

    this.loading.copy = this.loading.table = true;

    let rs;
    let error;
    try {
      rs = await this.doCopy(ids);

      const process = getCopyProcessor(this, ids, rs,data);
      autoProcess(rs, this, process);

      await callHook(CRUD.HOOK.AFTER_COPY, this, rs, data, process);
      this.loading.copy = this.loading.table = false;
    } catch (e) {
      this.loading.copy = this.loading.table = false;
      callHook(CRUD.HOOK.ON_ERROR, this, e);
      error = e;
    }
    if (error) throw error;
    return rs;
  }
  // 取消表单
  cancel(): void {
    let formStatus = this.formStatus;
    this.formStatus = 0;
    callHook(CRUD.HOOK.ON_CANCEL, this);

    if (isRecoverable(this)) {
      removeSnapshot(this.key, formStatus, this.editingId, this);
    }
  }

  private async _submit(type: number, ...args: unknown[]): Promise<unknown> {
    let rs;
    let proceed = true;
    let submitForm: Record<string, any> = this.form;
    await callHook(
      CRUD.HOOK.BEFORE_SUBMIT,
      this,
      () => (proceed = false),
      (form: Record<string, any>) => (submitForm = form),
      ...args
    );
    if (!proceed) return;

    this.loading.submit = true;

    let error;
    let process;
    try {
      if (type === 1) {
        rs = await this.doAdd(submitForm);

        process = getAddProcessor(this, submitForm, rs);
        autoProcess(rs, this, process);

        await callHook(CRUD.HOOK.AFTER_ADD, this, rs, process);
      } else if (type === 2) {
        rs = await this.doUpdate(submitForm);

        process = getUpdateProcessor(this, submitForm);
        autoProcess(rs, this, process);

        await callHook(CRUD.HOOK.AFTER_UPDATE, this, rs, process);
      }

      if (isRecoverable(this)) {
        removeSnapshot(this.key, type, this.editingId, this);
      }

      await callHook(CRUD.HOOK.AFTER_SUBMIT, this, rs, process);
      this.loading.submit = false;
    } catch (e) {
      this.loading.submit = false;
      callHook(CRUD.HOOK.ON_ERROR, this, e);
      error = e;
    }

    if (error) throw error;

    return rs;
  }

  // 提交表单
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async submit(...args: unknown[]): Promise<unknown> {
    if (this.formStatus !== 1 && this.formStatus !== 2) {
      crudWarn(
        `formStatus '${this.formStatus}' is not submittable, it should be 1(add)/2(update)`,
        "- submit()"
      );
      return;
    }

    return this._submit(this.formStatus, ...args);
  }

  //default implementation
  async submitForm(
    form:
      | FormValidator
      | FormValidator[]
      | (() => Promise<FormValidator | FormValidator[]>),
    ...args: unknown[]
  ): Promise<unknown> {
    crudWarn(
      `This warning meas you might forgot to import a cruda adapter`,
      "- submitForm()"
    );

    return this.submit(...args);
  }

  async submitAdd(...args: unknown[]): Promise<unknown> {
    return this._submit(1, ...args);
  }

  async submitEdit(...args: unknown[]): Promise<unknown> {
    return this._submit(2, ...args);
  }

  // 刷新页面，适用于查询条件变更后需要重新加载的场景
  reload(params?: Record<string, unknown>): Promise<unknown> {
    this.pagination.currentPage = 1;
    return this.toQuery(params);
  }
  // 查询row详情
  getDetails(id: string, params: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.QUERY.url + "/" + id,
      method: CRUD.RESTAPI.QUERY.method,
      params,
    });
  }

  //actions
  // 执行查询操作
  private doQuery(params?: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.QUERY.url,
      params,
      method: CRUD.RESTAPI.QUERY.method,
    });
  }

  // 执行新增操作
  private doAdd(form: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.ADD.url,
      method: CRUD.RESTAPI.ADD.method,
      data: form,
    });
  }

  // 执行编辑操作
  private doUpdate(form: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.UPDATE.url,
      method: CRUD.RESTAPI.UPDATE.method,
      data: form,
    });
  }

  // 执行删除操作
  private doDelete(data: unknown[]): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.DELETE.url,
      method: CRUD.RESTAPI.DELETE.method,
      data,
    });
  }

  // 执行导出操作
  private doExport(params?: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.EXPORT.url,
      params,
      method: CRUD.RESTAPI.EXPORT.method,
      responseType: "blob",
    });
  }

  // 执行导入操作
  private doImport(
    file: File | File[],
    params: Record<string, unknown>,
    fieldName: string
  ): Promise<unknown> {
    const data = new FormData();

    each<any, string>(params, (v, k) => {
      data.append(k, v);
    });

    if (isArray(file)) {
      each<File>(file, (f) => data.append(fieldName || "files", f));
    } else {
      data.append(fieldName || "file", file);
    }

    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.IMPORT.url,
      method: CRUD.RESTAPI.IMPORT.method,
      data,
    });
  }

  // 执行导入操作
  private doSort(): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.SORT.url,
      method: CRUD.RESTAPI.SORT.method,
      data: this.sortation,
    });
  }

  // 执行复制操作
  private doCopy(data: unknown[]): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.COPY.url,
      method: CRUD.RESTAPI.COPY.method,
      data,
    });
  }
}

////////////////////////// auto response
function autoProcess(response: unknown, crud: CRUD, processor: Function) {
  if (crud.autoResponse.validator(response)) {
    processor();
  }
}
function getDeleteProcessor(crud: CRUD, ids: string[]) {
  return () => {
    let childParentMap: { [k: string]: Record<string, any>[] } = {};

    findTreeNodes(
      crud.table.data,
      (node, parentNode) => {
        let cid = node[crud.table.rowKey];
          let hit = includes(ids, cid);
          if (hit) {
            childParentMap[cid] = parentNode
              ? parentNode[crud.autoResponse.childrenKeyField]
              : crud.table.data;
          }
          return hit;
      },
      { childrenKey: crud.autoResponse.childrenKeyField }
    );

    each(childParentMap, (container, cid) => {
      let record = find(container,data=>data[crud.table.rowKey] == cid)
      remove(container, record!);
    });
  };
}
function getUpdateProcessor(crud: CRUD, data: Record<string, any>) {
  return () => {
    let row: any = findTreeNode(
      crud.table.data,
      (node) => node[crud.table.rowKey] === data[crud.table.rowKey]
    );
    assign(row, data);
  };
}
function getAddProcessor(
  crud: CRUD,
  form: Record<string, any>,
  response: unknown
) {
  return () => {
    if (!crud.autoResponse.getter) {
      crudWarn(`autoResponse.getter is missing`, "- autoResponse.add()");
      return;
    }
    let parentKeyField = crud.autoResponse.parentKeyField;
    let pos = crud.autoResponse.position;
    let container = crud.table.data;
    let datas = crud.autoResponse.getter(response,[form]);

    if (parentKeyField) {
      //tree
      let parentId = form[parentKeyField];
      let parentRow: any = findTreeNode(
        crud.table.data,
        (node) => node[crud.table.rowKey] === parentId
      );
      if (parentRow) {
        container = parentRow[crud.autoResponse.childrenKeyField];
      }
    }

    if (pos == "head") {
      insert(container, 0, ...datas);
    } else {
      append(container, ...datas);
    }
  };
}
function getCopyProcessor(crud: CRUD, ids: string[], response: unknown,submitData:Record<string, unknown>[]) {
  return () => {
    if (!crud.autoResponse.getter) {
      crudWarn(`autoResponse.getter is missing`, "- autoResponse.copy()");
      return;
    }
    let pos = crud.autoResponse.position;
    let childParentMap: { [k: string]: Record<string, any>[] } = {};
    let datas = crud.autoResponse.getter(response,submitData);

    findTreeNodes(
      crud.table.data,
      (node, parentNode) => {
        let cid = node[crud.table.rowKey];
        let hit = includes(ids, cid);
        if (hit) {
          childParentMap[cid] = parentNode
            ? parentNode[crud.autoResponse.childrenKeyField]
            : crud.table.data;
        }
        return hit;
      },
      { childrenKey: crud.autoResponse.childrenKeyField }
    );

    each(childParentMap, (container, cid) => {
      let record = find(datas,data=>data[crud.table.rowKey] == cid)
      if (pos == "head") {
        insert(container, 0, record);
      } else {
        append(container, record);
      }
    });
  };
}
////////////////////////// auto response

/**
 * 调用hook
 * 如果指定了defaults 的hook会叠加调用
 * @param {*} hookName 钩子名称
 * @param {*} crud crud实例
 */
export async function callHook(
  hookName: string,
  crud: CRUD,
  ...args: unknown[]
) {
  const defaultHook = CRUD.defaults[hookName];
  //1. default
  if (isFunction(defaultHook)) await defaultHook(crud, ...args);
  //2. instance
  let instanceHooks = get<Array<any>>(
    HOOK_MAP[get(crud, "__crud_hid_") as string],
    hookName
  );
  if (!isEmpty(instanceHooks)) {
    for (let i = 0; i < instanceHooks.length; i++) {
      let [hook, context] = instanceHooks[i];
      if (isFunction(hook)) await hook.call(context, crud, ...args);
    }
  }

  if (hookName === CRUD.HOOK.ON_ERROR) {
    const e = args[0] as CRUDError;

    crud.error.name = (e.code || e.name) + "";
    if (e.response) {
      crud.error.message = e.response.statusText + "";
      crud.error.status = e.response.status + "";
    } else {
      crud.error.message = e.message + "";
    }
  }
}

// eslint-disable-next-line require-jsdoc
export function crudWarn(...args: unknown[]): void {
  console.warn("[CRUD] - ", ...args);
}

// eslint-disable-next-line require-jsdoc
export function crudError(...args: unknown[]): void {
  console.error("[CRUD] - ", ...args);
}

const HOOK_MAP: { [key: string]: Record<string, Array<any>> } = {};
const CONTEXT_MAP = new WeakMap();

//用于适配器调用。返回一个/多个crud实例
export function _newCrud(
  restURL: string | RestUrl,
  context: Record<string, any>
): CRUD {
  const nid = uuid();
  HOOK_MAP[nid] = {};
  const crud = new CRUD(restURL);
  Object.defineProperty(crud, "__crud_hid_", {
    value: nid,
    enumerable: false,
    configurable: false,
  });

  CONTEXT_MAP.set(crud, context);

  Object.defineProperties(context, {
    __crud_: {
      value: crud,
      enumerable: false,
      writable: true,
    },
    __crud_nid_: {
      value: nid,
      enumerable: false,
    },
  });
  return crud;
}
export function _newCruds(
  restURL: Record<string, string | RestUrl>,
  context: Record<string, any>
): Record<string, CRUD> {
  const cruds: Record<string, CRUD> = {};

  const nid = uuid();
  HOOK_MAP[nid] = {};

  each(restURL, (v: RestUrl | string, k: string) => {
    const crud = new CRUD(v, k);
    Object.defineProperty(crud, "__crud_hid_", {
      value: nid,
      enumerable: false,
      configurable: false,
    });
    cruds[k] = crud;
    CONTEXT_MAP.set(crud, context);
  });

  Object.defineProperties(context, {
    __cruds_: {
      value: cruds,
      enumerable: false,
      writable: true,
    },
    __crud_nid_: {
      value: nid,
      enumerable: false,
    },
  });
  return cruds;
}

export function _onHook(
  nid: string,
  hookName: string,
  hook: (crud: CRUD, ...args: any[]) => void,
  context: Record<string, any>
): () => void {
  const hid = uuid();
  let hooks = get<Array<any>>(HOOK_MAP, [nid, hookName]);
  if (!hooks) {
    hooks = [];
    set(HOOK_MAP, [nid, hookName], hooks);
  }
  hooks.push([hook, context, hid]);
  return () => {
    remove(HOOK_MAP[nid][hookName], (item) => item[3] === hid);
  };
}

let innerUpdater: (
  form: Record<string, any>,
  props: Record<string, any>
) => void;
export function _setUpdater(
  updater: (form: Record<string, any>, props: Record<string, any>) => void
) {
  innerUpdater = updater;
}

export { RestUrl } from "./types";

export default CRUD;
