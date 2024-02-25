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
   * GET请求时合并到自动合并到请求参数中
   */
  query?: Record<string, string | number>;
  /**
   * 实例中的restApi地址会覆盖全局地址,key必须大写
   */
  restApi?:Record<string, string|{url:string,method:string}>;
  [param: string]: unknown;
}

export interface CRUDError {
  code?: string;
  name?: string;
  message?: string;
  response?: Record<string, string | number>;
}

export interface Pagination {
  pageSize: number;
  currentPage: number;
  total: number;
  [propName: string]: number;
}

export type AutoResponseGetter = (response: any,submitData?:any[]) => Record<string,any>[]

export interface AutoResponse{
  position:'head'|'tail',
  validator:(response: any) => boolean,
  getter?:AutoResponseGetter;
  parentKeyField:string;
  childrenKeyField:string;
  [propName: string]: any;
}