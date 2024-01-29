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
