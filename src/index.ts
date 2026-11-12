/**
 * CRUD 视图模型
 * 提供基于RESTapi方式的CRUD操作及数据托管
 * @author holyhigh
 */
import {
  remove,
  each,
  filter,
  find,
  includes,
  map,
  partial,
  isArray,
  isEmpty,
  isFunction,
  isNil,
  isNull,
  isObject,
  isUndefined,
  assign,
  cloneDeep,
  get,
  keys,
  merge,
  set,
  startsWith,
  trim,
  upperCase,
  upperFirst,
  uuid,
} from "myfx";
import {
  AutoResponse,
  AutoResponseGetter,
  ChildrenConfig,
  CRUDError,
  CRUDStorage,
  FormValidator,
  Pagination,
  PatchConfig,
  RestUrl,
} from "./types";
import {
  CRUDA_KEY_SNAPSHOT,
  FormStatus,
  _setUpdater,
  applyUpdater,
  crudError,
  crudWarn,
} from "./shared";
import {
  createDefaultStorage,
  getSnapshotKey,
  readSnapshot,
  removeSnapshot,
  snapshotId,
  _setSnapshot,
} from "./snapshot";
import {
  autoProcess,
  getAddProcessor,
  getCopyProcessor,
  getDeleteProcessor,
  getPatchProcessor,
  getUpdateProcessor,
  sliceList,
} from "./processors";
import { encodeUrlVar, fillUrlId, getRestMethod, getRestUrl } from "./url";

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
  "opUpdate",
  "opDelete",
  "opExport",
  "opImport",
  "opSort",
  "opCopy",
];

//内置API名称，xApi不允许覆盖，否则会连带破坏对应的内置方法
const BUILTIN_APIS = [
  "QUERY",
  "QUERY_DETAILS",
  "ADD",
  "UPDATE",
  "DELETE",
  "EXPORT",
  "IMPORT",
  "SORT",
  "COPY",
  "PATCH",
  "CHILDREN",
  "ADD_OR_UPDATE",
];

function isRecoverable(crudInstance: CRUD) {
  return crudInstance.recoverable || CRUD.defaults.recoverable;
}

/**
 * CRUD容器。每个CRUD服务对应一个实例，提供查询、表格、分页等逻辑托管
 */
class CRUD {
  static request: Function;
  static install: (app: any, options: any) => void;

  /**
   * 快照存储。默认浏览器使用localStorage，其余环境(SSR/Node/测试)自动回退内存实现。
   * 适配器可在安装时替换以实现自定义持久化
   */
  static _storage: CRUDStorage = createDefaultStorage();

  /**
   * 快照作用域，默认取当前地址（不含查询串）。SSR下为空串
   */
  static _scope: () => string = () => {
    if (typeof location === "undefined" || !location.href) return "";
    try {
      const url = new URL(location.href);
      //查询串可能含token，且筛选条件变化不应分裂草稿
      return url.origin + url.pathname + url.hash;
    } catch (e) {
      return location.href;
    }
  };

  // 服务钩子，可以定义全局、实例钩子并支持顺序调用
  static HOOK = {
    BEFORE_QUERY: "CRUD_BEFORE_QUERY", // 查询前回调，可以修改请求参数，比如分页名称等
    AFTER_QUERY: "CRUD_AFTER_QUERY", // 查询后回调，可以获取查询结果
    BEFORE_DELETE: "CRUD_BEFORE_DELETE", // 删除前调用
    AFTER_DELETE: "CRUD_AFTER_DELETE", // 删除后调用
    BEFORE_ADD: "CRUD_BEFORE_ADD", // 新增前调用，可以用来清空表单或产生uuid等
    AFTER_ADD: "CRUD_AFTER_ADD", //提交新增后触发
    BEFORE_UPDATE: "CRUD_BEFORE_UPDATE", // 更新前调用，可以用来锁定某些字段等
    AFTER_UPDATE: "CRUD_AFTER_UPDATE", //提交更新后触发
    BEFORE_VIEW: "CRUD_BEFORE_VIEW", // 查看前调用
    AFTER_DETAILS_VIEW: "CRUD_AFTER_DETAILS_VIEW", //查询时开启查询详情后触发
    AFTER_DETAILS_UPDATE: "CRUD_AFTER_DETAILS_UPDATE", //编辑时开启查询详情后触发
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
    BEFORE_PATCH: "CRUD_BEFORE_PATCH", //批量补丁前调用
    AFTER_PATCH: "CRUD_AFTER_PATCH", //批量补丁后调用
    BEFORE_CHILDREN: "CRUD_BEFORE_CHILDREN", //子级懒加载前调用
    AFTER_CHILDREN: "CRUD_AFTER_CHILDREN", //子级懒加载后调用

    ON_ERROR: "CRUD_ON_ERROR", // 操作发生错误时调用，包括CRUD
    ON_CANCEL: "CRUD_ON_CANCEL", // 表单编辑取消时触发
    ON_VALIDATE: "CRUD_ON_VALIDATE", // 表单校验时触发

    BEFORE_RECOVER: "CRUD_BEFORE_RECOVER", //恢复前触发，如果recoverable开启
    BEFORE_CACHE: "CRUD_BEFORE_CACHE", //AFTER_QUERY前触发

    BEFORE_ADD_OR_UPDATE: "CRUD_BEFORE_ADD_OR_UPDATE", //进入新增/编辑状态前触发
    AFTER_ADD_OR_UPDATE: "CRUD_AFTER_ADD_OR_UPDATE", //提交新增/编辑后触发
    AFTER_DETAILS_ADD_OR_UPDATE: "CRUD_AFTER_DETAILS_ADD_OR_UPDATE", //新增/编辑时开启查询详情后触发
  };
  // REST APIs
  static RESTAPI = {
    QUERY: { url: "", method: "GET" },
    //{id}为固定标识，表示通过rowKey获取的主键值
    QUERY_DETAILS: { url: "/{id}", method: "GET" },
    ADD: { url: "", method: "POST" },
    UPDATE: { url: "", method: "PUT" },
    DELETE: { url: "", method: "DELETE" },
    EXPORT: { url: "/export", method: "GET" },
    IMPORT: { url: "/import", method: "POST" },
    SORT: { url: "/sort", method: "PUT" },
    COPY: { url: "/copy", method: "POST" },
    PATCH: { url: "", method: "PATCH" },
    //{id}为固定标识，表示通过rowKey获取的主键值
    CHILDREN: { url: "/{id}/children", method: "GET" },
    ADD_OR_UPDATE: { url: "/addorupdate", method: "POST" },
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
    patch: PatchConfig;
    children: ChildrenConfig;
    [k: string]: Function | boolean | Record<string, any> | Pagination;
  } = {
      query: {},
      view: {},
      pagination: {
        pageSize: 0,
        currentPage: 1,
        total: 0,
        frontend: false,
      },
      table: {
        rowKey: "",
      },
      recoverable: false,
      invalidBreak: true,
      patch: {},
      children: {
        enabled: false,
        emptyChildrenAsLoaded: true,
      },
      autoResponse: {
        position: "head",
        validator: () => false,
        childrenKeyField: "children",
      },
    };

  /**
   * 通过xApi注册的额外loading键。
   * loading是实例字段(不在原型上)，只能在实例化时合并
   */
  static _extraLoading: string[] = [];

  //注册自定义API
  static xApi(
    name: string,
    url: string,
    config?: {
      method?: string;
      loadable?: boolean;
    }
  ) {
    let loadable = get<boolean>(config, "loadable", false);
    let uName = upperCase(name);
    let method = get(config, "method", "GET");
    if (includes(BUILTIN_APIS, uName)) {
      crudWarn(
        `'${name}' is a built-in api and can not be overridden by xApi`,
        "- xApi()"
      );
      return;
    }
    //方法名与RESTAPI键名不是一一对应(如view->toView、addOrUpdate->toAddOrUpdate)，
    //两个维度都要判，否则会绕过上面的守卫并覆盖内置方法
    const toName = "to" + upperFirst(name);
    if (includes(BUILTIN_METHODS, toName)) {
      crudWarn(
        `'${name}' collides with the built-in method '${toName}' and can not be registered by xApi`,
        "- xApi()"
      );
      return;
    }
    if (get(CRUD.RESTAPI, uName)) {
      crudWarn(
        `RESTAPI.${uName} already exists and will be overridden by xApi`,
        "- xApi()"
      );
    }
    set(CRUD.RESTAPI, uName, { url: url, method });
    each(["BEFORE", "AFTER"], (v) => {
      set(CRUD.HOOK, v + "_" + uName, `CRUD_${v}_` + uName);
    });
    if (loadable && !includes(CRUD._extraLoading, name)) {
      CRUD._extraLoading.push(name);
    }
    set(
      CRUD.prototype,
      toName,
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
          this.loading[name] = true;
        }

        let rs;
        let error;
        try {
          const restApi = get<{ url: ""; method: "GET" }>(CRUD.RESTAPI, uName);
          rs = await CRUD.request({
            url: getRestUrl(this, uName, restApi.url),
            method: getRestMethod(this, uName, restApi.method),
            data: paramObj,
          });

          await callHook(get(CRUD.HOOK, "AFTER_" + uName), this, rs);
          if (loadable) {
            this.loading[name] = false;
          }
        } catch (e) {
          if (loadable) {
            this.loading[name] = false;
          }
          await safeCallHook(CRUD.HOOK.ON_ERROR, this, e);
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
  loading: Record<string, boolean> = {
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
    patch: false, //批量补丁中
    children: false, //子级加载中
  };
  defaultQuery: Record<string, any> | undefined; //查询数据
  restApi: Record<string, string | { url: string; method: string }> | undefined;
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
        //ps为字符串，不能与数字比较大小，否则实例设置永远失效
        if (ps) return ps;
        return CRUD.defaults.table.rowKey;
      },
      data: [
        // 表单数据托管
      ],
      selection: [], // 当前选中行
      allColumns: [], // 表格所有列，用于动态展示
      orders: [], // 排序列表
    };
  pagination: Pagination;
  sortation = {}; //排序对象
  formStatus: number = 0; // 1：新增；2：编辑；3：查看。适用于组合弹窗或细分弹窗
  form: Record<string, any> = {};
  error = {
    name: "",
    message: "",
    status: "",
  };
  editingId?: string | number;
  /**
   * 当启用多实例时的key
   */
  key: string;
  /**
   * 查询缓存
   */
  cache: boolean = false;
  private _cacheData: any;
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

  //子级懒加载
  get lazyChildren(): boolean {
    const ps = this.children.enabled;
    if (!isUndefined(ps)) return ps;
    return CRUD.defaults.children.enabled || false;
  }
  /**
   * 是否有任何操作正在进行，可用于统一禁用按钮
   */
  get busy(): boolean {
    const ks = keys(this.loading);
    for (let i = 0; i < ks.length; i++) {
      if (this.loading[ks[i]]) return true;
    }
    return false;
  }
  //叶子标记字段名
  get childrenLeafField(): string {
    const ps = this.children.leafKeyField;
    if (ps) return ps;
    return CRUD.defaults.children.leafKeyField || "";
  }
  //空数组是否视为已加载
  private get emptyChildrenAsLoaded(): boolean {
    const ps = this.children.emptyChildrenAsLoaded;
    if (!isUndefined(ps)) return ps;
    return isUndefined(CRUD.defaults.children.emptyChildrenAsLoaded)
      ? true
      : CRUD.defaults.children.emptyChildrenAsLoaded;
  }

  autoResponse: AutoResponse = {
    _position: undefined,
    set position(v: "head" | "tail") {
      this._position = v;
    },
    get position(): "head" | "tail" {
      const ps = this._position;
      if (ps) return ps;
      return CRUD.defaults.autoResponse.position || "head";
    },
    _validator: undefined,
    set validator(v: (response: any) => boolean) {
      this._validator = v;
    },
    get validator(): (response: any) => boolean {
      const ps = this._validator;
      if (ps) return ps;
      return CRUD.defaults.autoResponse.validator || (() => false);
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
      return CRUD.defaults.autoResponse.childrenKeyField || "children";
    },
    _parentKeyField: undefined,
    set parentKeyField(v: string) {
      this._parentKeyField = v;
    },
    get parentKeyField(): string {
      const ps = this._parentKeyField;
      if (ps) return ps;
      return CRUD.defaults.autoResponse.parentKeyField || "";
    },
  };

  /**
   * 批量补丁实例配置
   */
  patch: PatchConfig = {};

  /**
   * 树子级懒加载实例配置
   */
  children: ChildrenConfig = {};

  /**
   * 查询序号，用于丢弃已过期的响应，避免旧数据覆盖新数据
   */
  private _querySeq = 0;

  /**
   * 正在加载子级的主键集合，用于并发去重
   */
  private _childrenLoading = new Set<string | number>();
  /**
   * 正在进行的子级加载请求
   */
  private _childrenPending = new Map<string | number, Promise<unknown>>();

  snapshots: Record<string, any> = {};

  constructor(restURL: string | RestUrl, key?: string) {
    let url,
      defaultQuery,
      restApi,
      view: Record<string, boolean | undefined> = {},
      pagination: Pagination = {};
    if (isObject(restURL)) {
      const p = restURL;
      url = p.url;
      //对象形式的key必须在这里读取，否则会被忽略
      key = p.key || key;
      //冻结副本，不冻结调用方传入的配置对象
      this.params = Object.freeze({ ...p });
      //autoResponse
      if (p.autoResponse) {
        assign(this.autoResponse, p.autoResponse);
      }
      //invalidBreak
      this._invalidBreak = p.invalidBreak;
      //recoverable
      this._recoverable = p.recoverable;
      //defaultQuery
      defaultQuery = p.defaultQuery;
      //restApi
      restApi = p.restApi;
      //view
      if (p.view) {
        view = p.view;
      }
      //patch
      if (p.patch) {
        assign(this.patch, p.patch);
      }
      //children
      if (p.children) {
        assign(this.children, p.children);
      }
      this.cache = p.cache || false;
      pagination = p.pagination || {};
      if (p.pagination?.frontend) {
        this.cache = true;
      }
    } else {
      url = restURL;
    }
    if (!trim(url)) {
      throw new Error("The URL can not be empty");
    }

    this.pagination = Object.defineProperties(
      {
        //Pagination带索引签名，自定义字段需保留，会随展开进入请求参数
        ...pagination,
        currentPage: pagination.currentPage || 1,
        total: pagination.total || 0,
        frontend: pagination.frontend || false,
      },
      {
        //构造参数需直接写入_pageSize，否则会被下面的访问器覆盖
        _pageSize: {
          value: pagination.pageSize || 0,
          configurable: false,
          writable: true,
        },
        pageSize: {
          //必须可枚举，否则...this.pagination展开到请求参数时会丢失pageSize
          enumerable: true,
          set(v: number) {
            this._pageSize = v;
          },
          // 1. 如果CRUD实例设置了pageSize，以实例为准
          // 2. 如果实例值不合法取defaults
          get(): number {
            const ps = this._pageSize;
            if (ps > 0) return ps;
            return CRUD.defaults.pagination.pageSize || 15;
          },
        },
      }
    );

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
      defaultQuery: {
        value: defaultQuery,
        configurable: false,
        writable: true,
      },
      restApi: {
        value: restApi,
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
      //false是显式禁用，不能用||归一成undefined(会回落到defaults)
      this.view["_" + prop] = isNil(view[prop]) ? undefined : view[prop];
    });
    Object.defineProperties(this.view, viewProps as PropertyDescriptorMap);

    //无key时用url作为实例标识，避免同页多实例覆盖同一份草稿
    this.key = key || url;

    //合并xApi登记的loading键(必须在Vue.observable包装前完成)
    each<string>(CRUD._extraLoading, (k) => {
      if (isUndefined(this.loading[k])) {
        this.loading[k] = false;
      }
    });

    //load snapshots
    const preffix =
      CRUDA_KEY_SNAPSHOT +
      CRUD._scope() +
      (this.key ? "_" + this.key : "") +
      "_";
    const ks = filter<string>(CRUD._storage.keys(), (k) =>
      startsWith(k, preffix)
    );
    each(ks, (k) => {
      let kk = k.replace(preffix, "");
      //addOrUpdate需先于add判断，否则会被add前缀命中
      if (startsWith(kk, "addOrUpdate_")) {
        this.snapshots[kk.replace("addOrUpdate_", "")] = CRUD._storage.getItem(
          k
        );
      } else if (startsWith(kk, "update_")) {
        this.snapshots[kk.replace("update_", "")] = CRUD._storage.getItem(k);
      } else if (startsWith(kk, "add")) {
        this.snapshots[""] = CRUD._storage.getItem(k);
      }
    });
  }

  setURLParams(v: Record<string, unknown>): void {
    this.urlVar = v;
  }

  changeSelection(selection: Record<string, any>[]): void {
    this.table.selection = selection;
  }

  /**
   * 返回当前选中行，未选中时返回空数组并输出警告。
   * 供批量操作前做前置校验，不会改变现有方法的默认行为
   */
  ensureSelection(): Record<string, any>[] {
    const selection = this.table.selection || [];
    if (isEmpty(selection)) {
      crudWarn("no row selected", "- ensureSelection()");
    }
    return selection;
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

    //排序条件变更后回到第一页，与reload行为保持一致
    this.pagination.currentPage = 1;
    //错误已由toQuery内部的ON_ERROR上报，这里只吞掉rejection避免未处理
    void this.toQuery().catch(() => {});
  }

  getRestURL(): string {
    const params = this.urlVar;
    //参数名首字符不能是/，避免把协议头的 http:// 误判为:param
    //终止符含?/#，否则 :id?x=1 会把查询串吞进参数名导致替换失败
    return this.url.replace(/:([^:/][^:]*?)([\/?#]|$)/gm, (a, b, c) => {
      const v = params[b];
      //缺参时保留占位符，避免请求落到 "undefined" 路径
      if (isNil(v)) return a;
      return encodeUrlVar(v) + c;
    });
  }

  getContext(): any {
    return CONTEXT_MAP.get(this);
  }

  /**
   * 获取单行主键。未配置rowKey时输出警告并返回undefined，
   * 调用方须用isNil判断，避免拼出 /undefined、/- 之类的详情地址
   * @param row 数据行
   * @param opName 操作名，用于警告文案，如 'toUpdate()'
   */
  private getId(
    row: Record<string, any>,
    opName: string
  ): string | number | undefined {
    const rowKey = this.table.rowKey;
    if (rowKey) return get(row, rowKey) as string | number;
    crudWarn(
      `table.rowKey is a blank value '${rowKey}', it may cause an error`,
      `- ${opName}`
    );
    return undefined;
  }

  /**
   * 批量获取主键。未配置rowKey时输出一次警告并返回空数组
   * @param rows 数据行集合
   * @param opName 操作名，用于警告文案
   */
  private getIds(rows: Record<string, any>[], opName: string): (string | number)[] {
    const rowKey = this.table.rowKey;
    if (!rowKey) {
      crudWarn(
        `table.rowKey is a blank value '${rowKey}', it may cause an error`,
        `- ${opName}`
      );
      return [];
    }
    const ids = map<unknown>(rows, (item) => get(item, rowKey));
    //行缺主键时不能把undefined发往服务端(数组序列化后会变成null)
    const valid = filter(ids, (id) => !isNil(id)) as (string | number)[];
    if (valid.length !== ids.length) {
      crudWarn(
        `${ids.length - valid.length} row(s) are missing '${rowKey}' and will be skipped`,
        `- ${opName}`
      );
    }
    return valid;
  }

  /**
   * 统一的操作执行器：置位loading、捕获异常并触发ON_ERROR、复位loading
   * @param loadingKeys 需要置位的loading键
   * @param fn 实际操作，其返回值将作为方法返回值
   */
  private async _exec<T>(
    loadingKeys: string[],
    fn: () => Promise<T>
  ): Promise<T> {
    each<string>(loadingKeys, (k) => {
      this.loading[k] = true;
    });
    try {
      return await fn();
    } catch (e) {
      await safeCallHook(CRUD.HOOK.ON_ERROR, this, e);
      throw e;
    } finally {
      each<string>(loadingKeys, (k) => {
        this.loading[k] = false;
      });
    }
  }

  async toQuery(query?: Record<string, any>): Promise<unknown> {
    //深拷贝隔离嵌套引用，避免拦截器修改params时污染query等实例状态
    const params: Record<string, any> = cloneDeep({
      ...merge({}, this.query, this.defaultQuery, query),
      ...this.pagination,
    });
    //排序条件一并进入GET参数，空排序不附加以免干扰后端
    if (!isEmpty(this.table.orders)) {
      params.orders = cloneDeep(this.table.orders);
    }

    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_QUERY,
      this,
      params,
      this.table.orders,
      () => (proceed = false)
    );
    if (!proceed) return;

    // 登记本次查询。之后若有新查询发出，本次响应将被丢弃，避免旧响应覆盖新数据
    const seq = ++this._querySeq;

    this.loading.query = this.loading.table = true;

    let rs: any;
    let error;
    try {
      rs = this._cacheData || (await this.doQuery(params));

      if (seq !== this._querySeq) return;

      if ((this.cache || this.pagination.frontend) && !this._cacheData) {
        this._cacheData = rs;
        await callHook(CRUD.HOOK.BEFORE_CACHE, this, rs, (cacheData: any) => {
          this._cacheData = cacheData || rs;
        });
        rs = this._cacheData;
      }

      // 缓存处理可能耗时，再确认一次是否已被新查询取代
      if (seq !== this._querySeq) return;

      await callHook(
        CRUD.HOOK.AFTER_QUERY,
        this,
        rs,
        params,
        (list: Record<string, any>[]) => sliceList(list, this.pagination)
      );
      if (seq === this._querySeq) {
        this.loading.query = this.loading.table = false;
      }
    } catch (e) {
      // 已作废的请求失败时静默丢弃，不触发ON_ERROR
      if (seq !== this._querySeq) return;
      this.loading.query = this.loading.table = false;
      await safeCallHook(CRUD.HOOK.ON_ERROR, this, e);
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
    const ids = this.getIds(data, "toDelete()");

    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_DELETE,
      this,
      data,
      () => (proceed = false)
    );
    if (!proceed) return;

    //空ids不发请求：未配置rowKey或空选择时，后端可能把空条件解释为全量删除
    if (isEmpty(ids)) return;

    return this._exec(["del", "table"], async () => {
      const rs = await this.doDelete(ids);
      const process = getDeleteProcessor(this, ids);
      autoProcess(rs, this, process);

      await callHook(CRUD.HOOK.AFTER_DELETE, this, rs, data, process);
      return rs;
    });
  }
  async toExport(): Promise<unknown> {
    //与toQuery一致：合并defaultQuery，深拷贝隔离嵌套引用
    const params: Record<string, any> = cloneDeep({
      ...merge({}, this.query, this.defaultQuery),
      ...this.pagination,
    });
    //与toQuery保持一致，排序条件一并进入GET参数
    if (!isEmpty(this.table.orders)) {
      params.orders = cloneDeep(this.table.orders);
    }

    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_EXPORT,
      this,
      params,
      this.table.orders,
      () => (proceed = false)
    );
    if (!proceed) return;

    return this._exec(["export"], async () => {
      const rs = await this.doExport(params);

      await callHook(CRUD.HOOK.AFTER_EXPORT, this, rs);
      return rs;
    });
  }
  async toImport(file: File | File[], fieldName?: string): Promise<unknown> {
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

    return this._exec(["import"], async () => {
      const rs = await this.doImport(file, params, fieldName);

      await callHook(CRUD.HOOK.AFTER_IMPORT, this, rs);
      return rs;
    });
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

    return this._exec(["sort"], async () => {
      const rs = await this.doSort();

      await callHook(CRUD.HOOK.AFTER_SORT, this, rs);
      return rs;
    });
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
      let key = getSnapshotKey(this.key, FormStatus.ADD);
      let json = readSnapshot(key);
      await callHook(
        CRUD.HOOK.BEFORE_RECOVER,
        this,
        () => (proceed = false),
        json
      );
      if (proceed && json) {
        applyUpdater(this.form, json);
      }
    }

    this.formStatus = FormStatus.ADD;
    //新增态不沿用上一个编辑行的主键
    this.editingId = undefined;
  }
  async toUpdate(row: Record<string, unknown>): Promise<unknown> {
    const id = this.getId(row, "toUpdate()");

    //钩子内可能需要读取editingId，取消时恢复原值
    const prevEditingId = this.editingId;
    this.editingId = id;

    const params = {
      [this.table.rowKey]: id,
    };

    let proceed = true;
    let queryDetails = true;

    await callHook(
      CRUD.HOOK.BEFORE_UPDATE,
      this,
      row,
      () => (proceed = false),
      () => (queryDetails = false)
    );
    if (!proceed) {
      this.editingId = prevEditingId;
      return;
    }

    if (isRecoverable(this)) {
      let key = getSnapshotKey(this.key, FormStatus.UPDATE, id);
      let json = readSnapshot(key);
      await callHook(
        CRUD.HOOK.BEFORE_RECOVER,
        this,
        () => (proceed = false),
        json
      );
      if (proceed && json) {
        applyUpdater(this.form, json);
      }
    }

    this.formStatus = FormStatus.UPDATE;
    this.loading.form = true;

    let rs;
    let error;
    //取不到主键时不能拼出 /undefined 的详情地址
    if (queryDetails && !isNil(id)) {
      try {
        rs = await this.getDetails(id, params);
        await callHook(CRUD.HOOK.AFTER_DETAILS, this, rs);
        await callHook(CRUD.HOOK.AFTER_DETAILS_UPDATE, this, rs);
      } catch (e) {
        this.loading.form = false;
        await safeCallHook(CRUD.HOOK.ON_ERROR, this, e);
        error = e;
      }
    }

    this.loading.form = false;

    if (error) throw error;

    return rs;
  }

  async toAddOrUpdate(...args: unknown[]) {
    let proceed = true;
    let queryDetails = false;

    await callHook(
      CRUD.HOOK.BEFORE_ADD_OR_UPDATE,
      this,
      () => (proceed = false),
      () => (queryDetails = true),
      ...args
    );
    if (!proceed) return;

    //提前解析id：草稿恢复与详情查询都要用，且必须在恢复前生效。
    //无参调用表示新增，id为空，不能沿用上一个编辑行的id
    const rawRow = args[0];
    const row = isObject(rawRow) ? (rawRow as Record<string, any>) : undefined;
    const id = isUndefined(row)
      ? undefined
      : this.getId(row as Record<string, any>, "toAddOrUpdate()");

    if (isRecoverable(this)) {
      let key = getSnapshotKey(this.key, FormStatus.ADD_OR_UPDATE, id);
      let json = readSnapshot(key);
      await callHook(
        CRUD.HOOK.BEFORE_RECOVER,
        this,
        () => (proceed = false),
        json
      );
      if (proceed && json) {
        applyUpdater(this.form, json);
      }
    }

    this.formStatus = FormStatus.ADD_OR_UPDATE;
    this.editingId = id;

    let rs;
    let error;
    //无row(新增)时没有主键，详情查询应跳过
    if (queryDetails && !isNil(id)) {
      const params = {
        [this.table.rowKey]: id,
      };
      this.loading.form = true;
      try {
        rs = await this.getDetails(id, params);
        await callHook(CRUD.HOOK.AFTER_DETAILS, this, rs);
        await callHook(CRUD.HOOK.AFTER_DETAILS_ADD_OR_UPDATE, this, rs);
      } catch (e) {
        this.loading.form = false;
        await safeCallHook(CRUD.HOOK.ON_ERROR, this, e);
        error = e;
      }
      this.loading.form = false;
    }

    if (error) throw error;
    return rs;
  }
  async toView(row?: Record<string, unknown>): Promise<unknown> {
    let id;
    const params: Record<string, unknown> = {};
    if (row) {
      id = this.getId(row, "toView()");
      params[this.table.rowKey] = id;
    }

    let proceed = true;
    let queryDetails = true;

    await callHook(
      CRUD.HOOK.BEFORE_VIEW,
      this,
      row,
      params,
      () => (proceed = false),
      () => (queryDetails = false)
    );
    if (!proceed) return;

    this.formStatus = FormStatus.VIEW;
    this.loading.form = true;

    let rs;
    let error;
    //无row时没有主键，不能拼出 /undefined 的详情地址
    if (queryDetails && !isNil(id)) {
      try {
        rs = await this.getDetails(id, params);
        await callHook(CRUD.HOOK.AFTER_DETAILS, this, rs);
        await callHook(CRUD.HOOK.AFTER_DETAILS_VIEW, this, rs);
      } catch (e) {
        this.loading.form = false;
        await safeCallHook(CRUD.HOOK.ON_ERROR, this, e);
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
    const ids = this.getIds(data, "toCopy()");

    let proceed = true;
    await callHook(CRUD.HOOK.BEFORE_COPY, this, data, () => (proceed = false));
    if (!proceed) return;

    //空ids不发请求，与toDelete保持一致
    if (isEmpty(ids)) return;

    return this._exec(["copy", "table"], async () => {
      const rs = await this.doCopy(ids);

      const process = getCopyProcessor(this, ids, rs, data);
      autoProcess(rs, this, process);

      await callHook(CRUD.HOOK.AFTER_COPY, this, rs, data, process);
      return rs;
    });
  }
  /**
   * 批量字段补丁。直接更新指定行的部分字段，不进入表单态
   * @param rows 一行或多行数据
   * @param patch 需要更新的字段
   */
  async toPatch(
    rows: Record<string, unknown> | Record<string, unknown>[],
    patch: Record<string, unknown>
  ): Promise<unknown> {
    const data = isArray(rows) ? rows : [rows];

    if (isEmpty(data) || isEmpty(patch)) {
      crudWarn(
        "rows or patch is empty, the request will be skipped",
        "- toPatch()"
      );
      return;
    }

    if (!isUndefined(patch["ids"])) {
      crudWarn(
        "'ids' in patch will be overridden by the generated ids",
        "- toPatch()"
      );
    }

    // 通过rowKey自动转为id数组
    const ids = this.getIds(data, "toPatch()");
    if (isEmpty(ids)) return;

    let proceed = true;
    await callHook(
      CRUD.HOOK.BEFORE_PATCH,
      this,
      data,
      patch,
      () => (proceed = false)
    );
    if (!proceed) return;

    return this._exec(["patch", "table"], async () => {
      const rs = await this.doPatch(this.getPatchPayload(ids, patch, data));

      const process = getPatchProcessor(this, ids, patch, rs);
      autoProcess(rs, this, process);

      await callHook(CRUD.HOOK.AFTER_PATCH, this, rs, data, patch, process);
      return rs;
    });
  }

  /**
   * 构造批量补丁的请求体
   */
  private getPatchPayload(
    ids: (string | number)[],
    patch: Record<string, unknown>,
    rows: Record<string, unknown>[]
  ): unknown {
    const payload = this.patch.payload || CRUD.defaults.patch.payload;
    //ids放在后面，保证生成的ids覆盖patch中传入的ids
    return payload ? payload(ids, patch, rows) : { ...patch, ids };
  }

  /**
   * 判断节点的子级是否已加载。
   * undefined/null 视为未加载；[] 的语义由 children.emptyChildrenAsLoaded 决定
   */
  isChildrenLoaded(row: Record<string, any>): boolean {
    const childrenKey = this.autoResponse.childrenKeyField || "children";
    const children = row[childrenKey];
    if (isNil(children)) return false;
    if (isArray(children) && isEmpty(children)) {
      return this.emptyChildrenAsLoaded;
    }
    return true;
  }

  /**
   * 判断某行的子级是否正在加载。
   * 内部使用Set记录，非响应式，请勿直接绑定模板，整体loading请用 loading.children
   */
  isLoadingChildren(row: Record<string, any>): boolean {
    const rowKey = this.table.rowKey;
    if (!rowKey) return false;
    return this._childrenLoading.has(get(row, rowKey) as string | number);
  }

  /**
   * 加载树节点的子级。已加载或正在加载的节点会被去重
   * @param row 树节点
   * @param query 附加查询参数
   */
  async loadChildren(
    row: Record<string, any>,
    query?: Record<string, any>
  ): Promise<unknown> {
    const childrenKey = this.autoResponse.childrenKeyField || "children";

    // 已加载直接返回
    if (this.isChildrenLoaded(row)) return row[childrenKey];

    const id = this.getId(row, "loadChildren()");
    //0是合法主键，只跳过未取到主键的情况
    if (isNil(id)) return;

    // 同一节点的并发请求去重
    const pending = this._childrenPending.get(id);
    if (pending) return pending;

    const task = (async () => {
      let proceed = true;
      const params = { ...query };
      await callHook(
        CRUD.HOOK.BEFORE_CHILDREN,
        this,
        row,
        params,
        () => (proceed = false)
      );
      if (!proceed) return;

      this._childrenLoading.add(id);
      return this._exec(["children"], async () => {
        const rs = await this.doChildren(id, params);
        const children = this.getChildrenList(rs);

        await callHook(CRUD.HOOK.AFTER_CHILDREN, this, rs, row, children);

        // 写入子级，空数组同样需要触发更新
        applyUpdater(row, { [childrenKey]: children });

        const leafKey = this.childrenLeafField;
        if (leafKey) {
          applyUpdater(row, { [leafKey]: children.length > 0 });
        }
        return rs;
      });
    })();

    // 必须在第一个await前登记，保证并发去重
    this._childrenPending.set(id, task);
    try {
      return await task;
    } finally {
      this._childrenLoading.delete(id);
      this._childrenPending.delete(id);
    }
  }

  /**
   * 从响应中提取子级数组。优先使用 autoResponse.getter
   */
  private getChildrenList(rs: unknown): Record<string, any>[] {
    if (this.autoResponse.getter) {
      const list = this.autoResponse.getter(rs, []);
      if (isArray(list)) return list as Record<string, any>[];
    }
    if (isArray(rs)) return rs as Record<string, any>[];
    const data = get(rs as Record<string, any>, "data");
    if (isArray(data)) return data as Record<string, any>[];
    return [];
  }

  /**
   * 保存当前表单为草稿。需开启recoverable
   */
  saveDraft(): void {
    if (!isRecoverable(this)) {
      crudWarn("recoverable is not enabled", "- saveDraft()");
      return;
    }
    _setSnapshot(this, this.form);
  }

  /**
   * 清除当前表单的草稿
   */
  clearDraft(): void {
    //未进入表单时唯一可识别的是新增草稿
    const formStatus = this.formStatus === 0 ? FormStatus.ADD : this.formStatus;
    const editingId = formStatus === FormStatus.ADD ? undefined : this.editingId;
    removeSnapshot(this.key, formStatus, editingId, this);
  }

  /**
   * 当前表单是否存在草稿。未进入表单时检查新增草稿
   */
  hasDraft(): boolean {
    const formStatus = this.formStatus === 0 ? FormStatus.ADD : this.formStatus;
    const editingId = formStatus === FormStatus.ADD ? undefined : this.editingId;
    const sid = snapshotId(formStatus, editingId);
    return !isEmpty(this.snapshots[sid]);
  }

  // 取消表单
  cancel(): void {
    let formStatus = this.formStatus;
    this.formStatus = 0;
    void safeCallHook(CRUD.HOOK.ON_CANCEL, this);

    if (isRecoverable(this)) {
      removeSnapshot(this.key, formStatus, this.editingId, this);
    }
  }

  /**
   * 释放实例占用的钩子容器。组件销毁时调用一次，避免长生命周期应用中残留
   */
  dispose(): void {
    //幂等：已释放的实例不再重复递减引用计数
    if (!CONTEXT_MAP.has(this)) return;
    const hid = get(this, "__crud_hid_") as string;
    if (hid) {
      //_newCruds的多个实例共享nid，最后一个实例dispose时才删除容器
      const refs = (HOOK_REFS[hid] || 0) - 1;
      if (refs > 0) {
        HOOK_REFS[hid] = refs;
      } else {
        delete HOOK_MAP[hid];
        delete HOOK_REFS[hid];
      }
    }
    CONTEXT_MAP.delete(this);
  }

  private async _submit(type: number, ...args: unknown[]): Promise<unknown> {
    //查看态不允许提交，submitAdd/submitUpdate等直接调用也必须拦截
    if (this.formStatus === FormStatus.VIEW) {
      crudWarn(`formStatus '${this.formStatus}' is not submittable`, "- submit()");
      return;
    }
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

    return this._exec(["submit"], async () => {
      let rs;
      let process;
      if (type === FormStatus.ADD) {
        rs = await this.doAdd(submitForm);

        process = getAddProcessor(this, submitForm, rs);
        autoProcess(rs, this, process);

        await callHook(CRUD.HOOK.AFTER_ADD, this, rs, process);
      } else if (type === FormStatus.UPDATE) {
        rs = await this.doUpdate(submitForm);

        process = getUpdateProcessor(this, submitForm, rs);
        autoProcess(rs, this, process);

        await callHook(CRUD.HOOK.AFTER_UPDATE, this, rs, process);
      } else if (type === FormStatus.ADD_OR_UPDATE) {
        rs = await this.doAddOrUpdate(submitForm);

        //缺主键视为新增，否则新行在表格中找不到会被更新处理器丢弃
        process = isNil(get(submitForm, this.table.rowKey))
          ? getAddProcessor(this, submitForm, rs)
          : getUpdateProcessor(this, submitForm, rs);
        autoProcess(rs, this, process);

        await callHook(CRUD.HOOK.AFTER_ADD_OR_UPDATE, this, rs, process);
      }

      if (isRecoverable(this)) {
        //草稿是按进入表单时的formStatus存的，直接调submitAdd等方法时入参type会与实际态不符
        removeSnapshot(this.key, this.formStatus, this.editingId, this);
      }

      await callHook(CRUD.HOOK.AFTER_SUBMIT, this, rs, process);
      return rs;
    });
  }

  // 提交表单
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async submit(...args: unknown[]): Promise<unknown> {
    if (this.formStatus !== FormStatus.ADD && this.formStatus !== FormStatus.UPDATE && this.formStatus !== FormStatus.ADD_OR_UPDATE) {
      crudWarn(
        `formStatus '${this.formStatus}' is not submittable, it should be 1(add)/2(update)/4(addOrUpdate)`,
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
      `This warning means you might forget to import a cruda adapter`,
      "- submitForm()"
    );

    return this.submit(...args);
  }

  async submitAdd(...args: unknown[]): Promise<unknown> {
    return this._submit(FormStatus.ADD, ...args);
  }

  async submitUpdate(...args: unknown[]): Promise<unknown> {
    return this._submit(FormStatus.UPDATE, ...args);
  }
  async submitAddOrUpdate(...args: unknown[]): Promise<unknown> {
    return this._submit(FormStatus.ADD_OR_UPDATE, ...args);
  }

  // 查询row详情
  getDetails(id?: string | number, params?: Record<string, unknown>): Promise<unknown> {
    //缺主键时不能把字面量{id}发给后端
    if (isNil(id)) {
      crudWarn("id is missing, detail request skipped", "- getDetails()");
      return Promise.resolve(undefined);
    }
    let url = getRestUrl(this, "QUERY_DETAILS", CRUD.RESTAPI.QUERY_DETAILS.url)
    return CRUD.request({
      url: fillUrlId(url, id),
      method: getRestMethod(this, "QUERY_DETAILS", CRUD.RESTAPI.QUERY_DETAILS.method),
      params,
    });
  }

  /**
   * 重新获取单行数据并就地更新该行。
   * 不重建节点，树表的展开态与已加载的子级都会保留
   * @param row 需要刷新的行
   */
  async refreshRow(row: Record<string, any>): Promise<unknown> {
    const id = this.getId(row, "refreshRow()");
    if (isNil(id)) return;

    return this._exec([], async () => {
      const rs = await this.getDetails(id, { [this.table.rowKey]: id });
      const rowKey = this.table.rowKey;

      // 从响应中取出完整行：优先getter，其次response.data
      let next: Record<string, any> | undefined;
      if (this.autoResponse.getter) {
        const datas = this.autoResponse.getter(rs, [row]);
        if (isArray(datas) && isObject(datas[0])) {
          next = datas[0] as Record<string, any>;
        }
      }
      if (!next) {
        const data = get(rs as Record<string, any>, "data");
        if (isObject(data)) {
          next = data as Record<string, any>;
        } else if (isObject(rs)) {
          next = rs as Record<string, any>;
        }
      }

      if (next && !isUndefined(get(next, rowKey))) {
        const childrenKey = this.autoResponse.childrenKeyField;
        const patch: Record<string, any> = {};
        const ks = keys(next);
        for (let i = 0; i < ks.length; i++) {
          // 不覆盖children，避免清空已加载的子级
          if (ks[i] !== childrenKey) patch[ks[i]] = next[ks[i]];
        }
        // 就地更新，不触发跨父移动
        applyUpdater(row, patch);
      }
      return rs;
    });
  }

  // 刷新页面，适用于查询条件变更后需要重新加载的场景
  reload(params?: Record<string, unknown>): Promise<unknown> {
    this.pagination.currentPage = 1;
    return this.toQuery(params);
  }
  //清除缓存并重新查询
  reset(params?: Record<string, unknown>): Promise<unknown> {
    this._cacheData = null;
    return this.reload(params);
  }

  //actions
  // 执行查询操作
  private async doQuery(params?: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "QUERY", CRUD.RESTAPI.QUERY.url),
      method: getRestMethod(this, "QUERY", CRUD.RESTAPI.QUERY.method),
      params,
    });
  }

  // 执行新增操作
  private doAdd(form: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "ADD", CRUD.RESTAPI.ADD.url),
      method: getRestMethod(this, "ADD", CRUD.RESTAPI.ADD.method),
      data: form,
    });
  }

  // 执行编辑操作
  private doUpdate(form: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "UPDATE", CRUD.RESTAPI.UPDATE.url),
      method: getRestMethod(this, "UPDATE", CRUD.RESTAPI.UPDATE.method),
      data: form,
    });
  }

  // 执行新增或编辑操作
  private doAddOrUpdate(form: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "ADD_OR_UPDATE", CRUD.RESTAPI.ADD_OR_UPDATE.url),
      method: getRestMethod(this, "ADD_OR_UPDATE", CRUD.RESTAPI.ADD_OR_UPDATE.method),
      data: form,
    });
  }

  // 执行删除操作
  private doDelete(data: unknown[]): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "DELETE", CRUD.RESTAPI.DELETE.url),
      method: getRestMethod(this, "DELETE", CRUD.RESTAPI.DELETE.method),
      data,
    });
  }

  // 执行导出操作
  private doExport(params?: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "EXPORT", CRUD.RESTAPI.EXPORT.url),
      method: getRestMethod(this, "EXPORT", CRUD.RESTAPI.EXPORT.method),
      params,
      responseType: "blob",
    });
  }

  // 执行导入操作
  private doImport(
    file: File | File[],
    params: Record<string, unknown>,
    fieldName?: string
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
      url: getRestUrl(this, "IMPORT", CRUD.RESTAPI.IMPORT.url),
      method: getRestMethod(this, "IMPORT", CRUD.RESTAPI.IMPORT.method),
      data,
    });
  }

  // 执行导入操作
  private doSort(): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "SORT", CRUD.RESTAPI.SORT.url),
      method: getRestMethod(this, "SORT", CRUD.RESTAPI.SORT.method),
      data: this.sortation,
    });
  }

  // 执行复制操作
  private doCopy(data: unknown[]): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "COPY", CRUD.RESTAPI.COPY.url),
      method: getRestMethod(this, "COPY", CRUD.RESTAPI.COPY.method),
      data,
    });
  }

  // 执行批量补丁操作
  private doPatch(payload: unknown): Promise<unknown> {
    return CRUD.request({
      url: getRestUrl(this, "PATCH", CRUD.RESTAPI.PATCH.url),
      method: getRestMethod(this, "PATCH", CRUD.RESTAPI.PATCH.method),
      data: payload,
    });
  }

  // 执行子级查询操作
  private doChildren(
    id: string | number,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const url = getRestUrl(this, "CHILDREN", CRUD.RESTAPI.CHILDREN.url);
    return CRUD.request({
      url: fillUrlId(url, id),
      method: getRestMethod(this, "CHILDREN", CRUD.RESTAPI.CHILDREN.method),
      params,
    });
  }
}

//类声明后立即快照内置方法名。
//不能用运行时查询，否则「自定义名重复注册」也会被拦掉
const BUILTIN_METHODS = Object.getOwnPropertyNames(CRUD.prototype).filter(
  (n) => startsWith(n, "to")
);


/**
 * 触发通知型钩子并吞掉钩子自身的异常。
 * 避免钩子内异常掩盖原始错误，或变成未处理的Promise rejection
 */
async function safeCallHook(hookName: string, crud: CRUD, ...args: unknown[]) {
  try {
    await callHook(hookName, crud, ...args);
  } catch (hookError) {
    crudError(hookError);
  }
}

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
  // ON_ERROR需要先写入error，否则钩子内读到的是上一次的错误
  if (hookName === CRUD.HOOK.ON_ERROR) {
    const raw = args[0];
    //throw字符串/null等非对象错误直接读属性会抛TypeError或显示undefined
    const e: CRUDError = isObject(raw)
      ? (raw as CRUDError)
      : { name: "Error", message: String(raw) };

    crud.error.name = (e.code || e.name || "Error") + "";
    if (e.response) {
      crud.error.message = (e.response.statusText ?? e.message ?? "") + "";
      crud.error.status = (e.response.status ?? "") + "";
    } else {
      crud.error.message = (e.message ?? "") + "";
      //无response的错误（如网络中断）必须清空，否则残留上一次的status
      crud.error.status = "";
    }
  }

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
}

const HOOK_MAP: { [key: string]: Record<string, Array<any>> } = {};
//共享nid容器的实例引用计数，最后一个实例dispose时才删除容器
const HOOK_REFS: { [key: string]: number } = {};
const CONTEXT_MAP = new WeakMap();

//用于适配器调用。返回一个/多个crud实例
export function _newCrud(
  restURL: string | RestUrl,
  context: Record<string, any>
): CRUD {
  const nid = uuid();
  HOOK_MAP[nid] = {};
  HOOK_REFS[nid] = 1;
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
  HOOK_REFS[nid] = 0;

  each(restURL, (v: RestUrl | string, k: string) => {
    const crud = new CRUD(v, k);
    Object.defineProperty(crud, "__crud_hid_", {
      value: nid,
      enumerable: false,
      configurable: false,
    });
    cruds[k] = crud;
    HOOK_REFS[nid]++;
    CONTEXT_MAP.set(crud, context);
  });

  //空配置时没有实例可dispose，容器会永久残留；_add2Cruds后续按需重建
  if (HOOK_REFS[nid] === 0) {
    delete HOOK_MAP[nid];
    delete HOOK_REFS[nid];
  }

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

export function _add2Cruds(
  key: string,
  restURL: string | RestUrl,
  context: Record<string, any>
) {
  const nid = context.__crud_nid_;
  const cruds = context.__cruds_;
  if (!nid || !cruds) {
    throw new Error(
      "[CRUD] _add2Cruds() requires a context created by _newCruds()"
    );
  }
  const crud = new CRUD(restURL, key);

  cruds[key] = crud;
  if (!HOOK_MAP[nid]) HOOK_MAP[nid] = {};
  HOOK_REFS[nid] = (HOOK_REFS[nid] || 0) + 1;
  CONTEXT_MAP.set(crud, context);

  Object.defineProperty(crud, "__crud_hid_", {
    value: nid,
    enumerable: false,
    configurable: false,
  });
  return crud;
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
    const list = get<Array<any>>(HOOK_MAP, [nid, hookName]);
    // hid位于数组第3位(索引2)
    if (list) remove(list, (item) => item[2] === hid);
  };
}

export { _setSnapshot, _setUpdater, crudError, crudWarn };
export { FormValidator, RestUrl } from "./types";

export default CRUD;
