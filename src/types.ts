/**
 * CRUD 构造参数。
 * 除url外，可以传递其他任意参数并可使用$crud.params.xx形式调用
 * @author holyhigh
 */
export interface RestUrl {
  /**
   * rest url地址，支持url参数
   */
  url: string;
  /**
   * GET请求时自动合并到请求参数中
   */
  defaultQuery?: Record<string, string | number>;
  /**
   * 实例中的restApi地址会覆盖全局地址,key必须大写
   */
  restApi?: Record<string, string | { url: string, method: string }>;
  invalidBreak?:boolean;
  recoverable?:boolean;
  /**
   * 自动响应实例配置
   */
  autoResponse?: AutoResponse;
  view?:Record<string, boolean>;
  pagination?:Pagination;
  cache?:boolean;
  /**
   * 批量补丁实例配置
   */
  patch?: PatchConfig;
  /**
   * 树子级懒加载实例配置
   */
  children?: ChildrenConfig;
  [param: string]: any;
}

export interface CRUDError {
  code?: string;
  name?: string;
  message?: string;
  response?: Record<string, string | number>;
}

export interface Pagination {
  pageSize?: number;
  currentPage?: number;
  total?: number;
  frontend?: boolean;
  [propName: string]: any;
}

/**
 * 快照存储接口。
 * 默认浏览器环境使用 localStorage，其余环境自动回退内存实现
 */
export interface CRUDStorage {
  getItem(key: string): string | null;
  setItem(key: string, val: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

/**
 * 校验器接口，各适配器实现
 */
export interface FormValidator {
  validate: (...args: any[]) => Promise<any>;
}

/**
 * 树子级懒加载配置
 */
export interface ChildrenConfig {
  /**
   * 是否启用子级懒加载。默认 false，保持全量建树的行为
   */
  enabled?: boolean;
  /**
   * 标记"是否还有子节点"的字段名，用于控制展开箭头。
   * 加载完成后会写入 row[leafKeyField] = children.length > 0
   */
  leafKeyField?: string;
  /**
   * children: [] 是否视为"已加载但为空"。默认 true。
   * 当后端用空数组表示"尚未查询"时设为 false
   */
  emptyChildrenAsLoaded?: boolean;
}

export type AutoResponseGetter = (response: any,submitData?:any[]) => Record<string,any>[]

/**
 * 批量补丁配置
 */
export interface PatchConfig {
  /**
   * 自定义请求体。默认 { ...patch, ids }
   * @param ids 主键数组
   * @param patch 待更新的字段
   * @param rows 原始数据行
   */
  payload?: (
    ids: (string | number)[],
    patch: Record<string, unknown>,
    rows: Record<string, unknown>[]
  ) => unknown;
}

export interface AutoResponse{
  position?:'head'|'tail',
  validator?:(response: any) => boolean,
  getter?:AutoResponseGetter;
  parentKeyField?:string;
  childrenKeyField?:string;
  [propName: string]: any;
}