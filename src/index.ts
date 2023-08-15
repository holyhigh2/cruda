/**
 * CRUD 视图模型
 * 提供基于RESTapi方式的CRUD操作及数据托管
 * @author holyhigh
 */
import { map, each, find } from "myfx/collection";
import { remove } from "myfx/array";
import { partial } from "myfx/function";
import { trim } from "myfx/string";
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
import { merge, get, set } from "myfx/object";

import { RestUrl, CRUDError, Pagination } from "./types";

function viewSetter(v: boolean, prop: string, bind: CRUD["view"]) {
  bind["_" + prop] = v;
}
function viewGetter(prop: string, bind: CRUD["view"]): boolean {
  const v = bind["_" + prop];
  if (!isNil(v)) return v as boolean;
  return isUndefined(CRUD.defaults.view[prop])
    ? true
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
    BEFORE_EDIT: "CRUD_BEFORE_EDIT", // 编辑前调用，可以用来锁定某些字段等
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
    [k: string]:
      | Function
      | Record<string, string>
      | Record<string, boolean | undefined>
      | Pagination;
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
  };

  params: Record<string, any>;
  vm: Record<string, unknown>;
  private url:string;
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
  query:Record<string, any> = {}; //查询数据
  table: {
    rowKey: string;
    data: Record<string, unknown>[];
    selection: Record<string, unknown>[];
    allColumns: Record<string, unknown>[];
    orders: Record<string, unknown>[];
  } = {
    rowKey: "", //主键key
    data: [
      // 表单数据托管
    ],
    selection: [], // 当前选中行
    allColumns: [], // 表格所有列，用于动态展示
    orders: [], // 排序列表
  };
  pagination:{
    pageSize:number,
    currentPage:number,
    total:number,
    [k:string]:any
  } = {
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
  formStatus:number = 0; // 1：新增；2：编辑；3：查看。适用于组合弹窗或细分弹窗
  form:Record<string, any> = {};
  error = {
    name: "",
    message: "",
    status: "",
  };

  constructor(restURL: string | RestUrl) {
    let url
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
      url:{
        value: url,
        configurable:false,
        writable: false
      },
      urlVar:{
        value: {},
        configurable:false,
        writable: true
      },
      error:{
        configurable:false,
        writable: false
      }
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

  getContext(): any{
    return CONTEXT_MAP.get(this)
  }

  async toQuery(query?: Record<string, any>): Promise<unknown> {
    const params = {
      ...merge(this.query, query),
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

    // 通过rowKey自动转为id数组
    const rowKey = this.table.rowKey || CRUD.defaults.table.rowKey;
    if (rowKey) {
      data = map(data, (item) => get(item, rowKey));
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
      rs = await this.doDelete(data);

      await callHook(CRUD.HOOK.AFTER_DELETE, this, rs, data);
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
  async toImport(file: File | File[],fieldName:string): Promise<unknown> {
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
      rs = await this.doImport(file, params,fieldName);

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
    await callHook(CRUD.HOOK.BEFORE_ADD, this,() => (proceed = false), ...args);
    if (!proceed) return;
    
    this.formStatus = 1;
  }
  async toEdit(row: Record<string, unknown>): Promise<unknown> {
    let id = "-";
    const rowKey = this.table.rowKey || CRUD.defaults.table.rowKey;
    if (rowKey) {
      id = row[rowKey] as string;
    } else {
      crudWarn(
        `table.rowKey is a blank value [${rowKey}], it may cause an error`,
        "- toEdit()"
      );
    }

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
    const rowKey = this.table.rowKey || CRUD.defaults.table.rowKey;
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

    // 通过rowKey自动转为id数组
    const rowKey = this.table.rowKey || CRUD.defaults.table.rowKey;
    if (rowKey) {
      data = map(data, (item) => get(item, rowKey));
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
      rs = await this.doCopy(data);

      await callHook(CRUD.HOOK.AFTER_COPY, this, rs, data);
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
    this.formStatus = 0;
    callHook(CRUD.HOOK.ON_CANCEL, this);
  }

  // 提交表单
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async submit(...args: unknown[]): Promise<unknown> {
    let rs;
    let proceed = true;
    let submitForm;
    await callHook(
      CRUD.HOOK.BEFORE_SUBMIT,
      this,
      () => (proceed = false),
      (form:Record<string,any>) => (submitForm = form),
      ...args
    );
    if (!proceed) return;

    this.loading.submit = true;

    let error;
    try {
      if (this.formStatus === 1) {
        rs = await this.doAdd(submitForm);
      } else if (this.formStatus === 2) {
        rs = await this.doUpdate(submitForm);
      } else {
        crudWarn(
          `formStatus '${this.formStatus}' is not submittable, it should be 1(add)/2(update)`,
          "- submit()"
        );
      }

      await callHook(CRUD.HOOK.AFTER_SUBMIT, this, rs);
      this.loading.submit = false;
    } catch (e) {
      this.loading.submit = false;
      callHook(CRUD.HOOK.ON_ERROR, this, e);
      error = e;
    }

    if (error) throw error;

    return rs;
  }
  // 刷新页面，适用于查询条件变更后需要重新加载的场景
  reload(): Promise<unknown> {
    this.pagination.currentPage = 1;
    return this.toQuery();
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
  private doAdd(form:Record<string, unknown>|undefined): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.ADD.url,
      method: CRUD.RESTAPI.ADD.method,
      data: form || this.form,
    });
  }

  // 执行编辑操作
  private doUpdate(form:Record<string, unknown>|undefined): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.UPDATE.url,
      method: CRUD.RESTAPI.UPDATE.method,
      data: form || this.form,
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
    fieldName:string
  ): Promise<unknown> {
    const data = new FormData();

    each<any, string>(params, (v, k) => {
      data.append(k, v);
    });

    if (isArray(file)) {
      each<File>(file, (f) => data.append(fieldName||"files", f));
    } else {
      data.append(fieldName||"file", file);
    }

    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.IMPORT.url,
      data,
      method: CRUD.RESTAPI.IMPORT.method,
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

/**
 * 调用hook
 * 如果指定了defaults 的hook会叠加调用
 * @param {*} hookName 钩子名称
 * @param {*} crud crud实例
 */
async function callHook(hookName: string, crud: CRUD, ...args: unknown[]) {
  const defaultHook = CRUD.defaults[hookName];
  //1. default
  if (isFunction(defaultHook)) await defaultHook(crud, ...args);
  //2. instance
  let instanceHooks = get<Array<any>>(HOOK_MAP[get(crud, '__crud_hid_') as string],hookName) 
  if(!isEmpty(instanceHooks)){
    for(let i=0;i<instanceHooks.length;i++){
      let [hook,vm] = instanceHooks[i]
      if (isFunction(hook)) await hook.call(vm,crud, ...args);
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

const HOOK_MAP: { [key: string]: Record<string, Array<any>> } = {}
const CONTEXT_MAP = new WeakMap()

//用于适配器调用。返回一个/多个crud实例
export function _newCrud(restURL: string | RestUrl, vm: Record<string, any>):CRUD{
  const nid = uuid()
  HOOK_MAP[nid] = {}
  const crud = new CRUD(restURL)
  Object.defineProperty(crud,'__crud_hid_',{
    value:nid,
    enumerable:false,
    configurable:false
  })

  CONTEXT_MAP.set(crud,vm)

  Object.defineProperties(vm, {
    __crud_:{
      value: crud,
      enumerable: false,
      writable:true
    },
    __crud_nid_:{
      value: nid,
      enumerable: false,
    }
  })
  return crud
}
export function _newCruds(restURL: Record<string, string | RestUrl>, vm: Record<string, any>):Record<string, CRUD>{
  const cruds:Record<string, CRUD> = {}
  
  const nid = uuid()
  HOOK_MAP[nid] = {}

  each(restURL, (v: RestUrl | string, k: string) => {
    const crud = new CRUD(v)
    Object.defineProperty(crud,'__crud_hid_',{
      value:nid,
      enumerable:false,
      configurable:false
    })
    cruds[k] = crud
    CONTEXT_MAP.set(crud, vm)
  })

  Object.defineProperties(vm, {
    __cruds_:{
      value: cruds,
      enumerable: false,
      writable:true
    },
    __crud_nid_:{
      value: nid,
      enumerable: false,
    }
  })
  return cruds
}

export function _onHook(nid:string, hookName: string, hook: (crud: CRUD, ...args: any[]) => void,vm: Record<string, any>):()=>void{
  const hid = uuid()
  let hooks = get<Array<any>>(HOOK_MAP, [nid,hookName]) 
  if (!hooks){
    hooks = []
    set(HOOK_MAP, [nid, hookName], hooks)
  }
  hooks.push([hook,vm,hid])
  return ()=>{
    remove(HOOK_MAP[nid][hookName],item=>item[3] === hid)    
  }
}

export { RestUrl } from "./types";

export default CRUD;
