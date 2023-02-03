/**
 * CRUD 视图模型
 * 提供基于RESTapi方式的CRUD操作及数据托管
 * @author holyhigh
 */
import {
  isArray,
  map,
  get,
  isUndefined,
  each,
  isObject,
  partial,
  isNull,
  find,
  remove,
  isFunction,
  trim,
  isNil,
} from '@holyhigh/func.js'
import { RestUrl, CRUDError, Pagination } from './types'

function viewSetter(v: boolean, prop: string, bind: CRUD['view']) {
  bind['_' + prop] = v
}
function viewGetter(prop: string, bind: CRUD['view']): boolean {
  const v = bind['_' + prop]
  if (!isNil(v)) return v as boolean
  return isUndefined(CRUD.defaults.view[prop])
    ? true
    : CRUD.defaults.view[prop] || false
}

const VIEW_PROPS = [
  'queryShow',
  'queryReset',
  'opAdd',
  'opEdit',
  'opDel',
  'opExport',
  'opImport',
]

/**
 * CRUD容器。每个CRUD服务对应一个实例，提供查询、表格、分页等逻辑托管
 */
class CRUD {
  static request: Function
  static install: (app: any, options: any) => void

  // 服务钩子，可以定义全局、实例钩子并支持顺序调用
  static HOOK = {
    BEFORE_QUERY: 'CRUD_BEFORE_QUERY', // 查询前回调，可以修改请求参数，比如分页名称等
    AFTER_QUERY: 'CRUD_AFTER_QUERY', // 查询后回调，可以获取查询结果
    BEFORE_DELETE: 'CRUD_BEFORE_DELETE', // 删除前调用
    AFTER_DELETE: 'CRUD_AFTER_DELETE', // 删除后调用
    BEFORE_ADD: 'CRUD_BEFORE_ADD', // 新增前调用，可以用来清空表单或产生uuid等
    BEFORE_EDIT_QUERY: 'CRUD_BEFORE_EDIT_QUERY',
    BEFORE_EDIT: 'CRUD_BEFORE_EDIT', // 编辑前调用，可以用来锁定某些字段等
    BEFORE_VIEW_QUERY: 'CRUD_BEFORE_VIEW_QUERY',
    BEFORE_VIEW: 'CRUD_BEFORE_VIEW', // 查看前调用
    BEFORE_SUBMIT: 'CRUD_BEFORE_SUBMIT', // 提交前调用，可以用来处理form字段
    AFTER_SUBMIT: 'CRUD_AFTER_SUBMIT', // 提交后调用，可以用来刷新页面、发送通知或者其他操作
    BEFORE_EXPORT: 'CRUD_BEFORE_EXPORT', // 导出请求前回调
    AFTER_EXPORT: 'CRUD_AFTER_EXPORT', // 获取导出数据后调用
    ON_ERROR: 'CRUD_ON_ERROR', // 操作发生错误时调用，包括CRUD
    ON_CANCEL: 'CRUD_ON_CANCEL', // 表单编辑取消时触发
    BEFORE_IMPORT: 'CRUD_BEFORE_IMPORT', // 导入请求前回调
    AFTER_IMPORT: 'CRUD_AFTER_IMPORT',
  }
  // REST APIs
  static RESTAPI = {
    QUERY: '',
    EXPORT: '/export',
    IMPORT: '/import',
    ADD: '',
    UPDATE: '',
    DELETE: '',
  }

  //全局默认值
  static defaults: {
    query: Record<string, string>
    view: Record<string, boolean | undefined>
    pagination: Pagination
    table: Record<string, string>
    [k: string]:
      | Function
      | Record<string, string>
      | Record<string, boolean | undefined>
      | Pagination
  } = {
    query: {},
    view: {},
    pagination: {
      pageSize: 0,
      currentPage: 1,
      total: 0,
    },
    table: {
      rowKey: '',
    },
  }

  params: Record<string, any> = {}
  vm: Record<string, unknown> = {}
  private url = ''
  private urlVar: Record<string, unknown> = {}

  view: Record<string, boolean | undefined> = {} //业务组件通过view来控制UI
  loading = {
    // 通过loading状态控制加载
    query: false, // 搜索中
    table: false, // 表格数据加载中
    del: false,
    export: false, // 导出中
    form: false, // 表单数据加载中，包括编辑、查看
    submit: false, // 表单提交中
    import: false, //导入中
  }
  query = {} //查询数据
  table: {
    rowKey: string
    data: Record<string, unknown>[]
    selection: Record<string, unknown>[]
    allColumns: Record<string, unknown>[]
    orders: Record<string, unknown>[]
  } = {
    rowKey: '', //主键key
    data: [
      // 表单数据托管
    ],
    selection: [], // 当前选中行
    allColumns: [], // 表格所有列，用于动态展示
    orders: [], // 排序列表
  }
  pagination = {
    _pageSize: 0,
    set pageSize(v: number) {
      this._pageSize = v
    },
    // 1. 如果CRUD实例设置了pageSize，以实例为准
    // 2. 如果实例值不合法取defaults
    get pageSize(): number {
      const ps = this._pageSize
      if (ps > 0) return ps
      return CRUD.defaults.pagination.pageSize || 15
    },
    currentPage: 1,
    total: 0,
  }
  formStatus = 0 // 1：新增；2：编辑；3：查看。适用于组合弹窗或细分弹窗
  form = {}
  error = {
    name: '',
    message: '',
    status: '',
  }

  constructor(restURL: string | RestUrl) {
    if (isObject(restURL)) {
      const p = restURL
      this.url = p.url
      this.params = Object.freeze(p)
    } else {
      this.url = restURL
    }
    if (!trim(this.url)) {
      throw new Error('The URL can not be empty')
    }

    const viewProps: { [key: string]: unknown } = {}
    each<string>(VIEW_PROPS, (prop) => {
      viewProps[prop] = {
        set: partial(viewSetter, undefined, prop, this.view),
        get: partial(viewGetter, prop, this.view),
      }
      this.view['_' + prop] = undefined
    })
    Object.defineProperties(this.view, viewProps as PropertyDescriptorMap)
  }

  setURLParams(v: Record<string, unknown>): void {
    this.urlVar = v
  }

  changeSelection(selection: Record<string, any>[]): void {
    this.table.selection = selection
  }

  changeSort(sortData: {
    column: Record<string, any>
    prop: string
    order: string | null
  }): void {
    const isAsc = isNull(sortData.order) ? null : sortData.order === 'ascending'
    const item = find(
      this.table.orders,
      (item: Record<string, any>) => item.column === sortData.prop
    )
    if (item) {
      if (isAsc == null) {
        remove(this.table.orders, item)
      } else {
        item.asc = isAsc
      }
    } else {
      if (sortData.order != null) {
        this.table.orders.push({ column: sortData.prop, asc: isAsc })
      }
    }

    this.toQuery()
  }

  getRestURL(): string {
    const params = this.urlVar
    return this.url.replace(/:([^:]+?)(\/|$)/gm, (a, b, c) => params[b] + c)
  }

  async toQuery(): Promise<unknown> {
    const params = {
      ...this.query,
      ...this.pagination,
    }

    let proceed = true
    callHook(
      CRUD.HOOK.BEFORE_QUERY,
      this,
      params,
      this.table.orders,
      () => (proceed = false)
    )
    if (!proceed) return

    this.loading.query = this.loading.table = true

    let rs
    let error
    try {
      rs = await this.doQuery(params)

      this.loading.query = this.loading.table = false
      callHook(CRUD.HOOK.AFTER_QUERY, this, rs)
    } catch (e) {
      this.loading.query = this.loading.table = false
      callHook(CRUD.HOOK.ON_ERROR, this, e)
      error = e
    }

    if (error) throw error
    return rs
  }

  async toDelete(
    rows: Record<string, unknown> | Record<string, unknown>[]
  ): Promise<unknown> {
    let data = isArray(rows) ? rows : [rows]

    // 通过rowKey自动转为id数组
    const rowKey = this.table.rowKey || CRUD.defaults.table.rowKey
    if (rowKey) {
      data = map(data, (item) => get(item, rowKey))
    } else {
      crudWarn(
        `table.rowKey is a blank value '${rowKey}', it may cause an error`,
        '- toDelete()'
      )
    }

    let proceed = true
    callHook(CRUD.HOOK.BEFORE_DELETE, this, data, () => (proceed = false))
    if (!proceed) return

    this.loading.del = this.loading.table = true

    let rs
    let error
    try {
      rs = await this.doDelete(data)

      this.loading.del = this.loading.table = false
      callHook(CRUD.HOOK.AFTER_DELETE, this, rs)
    } catch (e) {
      this.loading.del = this.loading.table = false
      callHook(CRUD.HOOK.ON_ERROR, this, e)
      error = e
    }
    if (error) throw error
    return rs
  }

  async toExport(): Promise<unknown> {
    const params = {
      ...this.query,
      ...this.pagination,
    }

    let proceed = true
    callHook(
      CRUD.HOOK.BEFORE_EXPORT,
      this,
      params,
      this.table.orders,
      () => (proceed = false)
    )
    if (!proceed) return

    this.loading.export = true

    let rs
    let error
    try {
      rs = await this.doExport(params)

      this.loading.export = false
      callHook(CRUD.HOOK.AFTER_EXPORT, this, rs)
    } catch (e) {
      this.loading.export = false
      callHook(CRUD.HOOK.ON_ERROR, this, e)
      error = e
    }

    if (error) throw error

    return rs
  }
  async toImport(file: File | File[]): Promise<unknown> {
    const params = {}

    let proceed = true
    callHook(CRUD.HOOK.BEFORE_IMPORT, this, params, () => (proceed = false))
    if (!proceed) return

    this.loading.import = true

    let rs
    let error
    try {
      rs = await this.doImport(file, params)

      this.loading.import = false
      callHook(CRUD.HOOK.AFTER_IMPORT, this, rs)
    } catch (e) {
      this.loading.import = false
      callHook(CRUD.HOOK.ON_ERROR, this, e)
      error = e
    }

    if (error) throw error

    return rs
  }

  toAdd(...args: unknown[]): void {
    callHook(CRUD.HOOK.BEFORE_ADD, this, ...args)
    this.formStatus = 1
  }

  async toEdit(row: Record<string, unknown>): Promise<unknown> {
    this.formStatus = 2

    let id = '-'
    const rowKey = this.table.rowKey || CRUD.defaults.table.rowKey
    if (rowKey) {
      id = row[rowKey] as string
    } else {
      crudWarn(
        `table.rowKey is a blank value [${rowKey}], it may cause an error`,
        '- toEdit()'
      )
    }

    const params = {
      [rowKey]: id,
    }

    let proceed = true
    callHook(CRUD.HOOK.BEFORE_EDIT_QUERY, this, params, () => (proceed = false))
    if (!proceed) return

    this.loading.form = true

    let rs
    let error
    try {
      rs = await this.getDetails(id, params)

      callHook(CRUD.HOOK.BEFORE_EDIT, this, rs)
      this.loading.form = false
    } catch (e) {
      this.loading.form = false
      callHook(CRUD.HOOK.ON_ERROR, this, e)
      error = e
    }

    if (error) throw error

    return rs
  }
  async toView(row: Record<string, unknown>): Promise<unknown> {
    this.formStatus = 3

    let id = '-'
    const rowKey = this.table.rowKey || CRUD.defaults.table.rowKey
    if (rowKey) {
      id = row[rowKey] as string
    } else {
      crudWarn(
        `table.rowKey is a blank value [${rowKey}], it may cause an error`,
        '- toView()'
      )
    }

    const params = {
      [rowKey]: id,
    }

    let proceed = true
    callHook(CRUD.HOOK.BEFORE_VIEW_QUERY, this, params, () => (proceed = false))
    if (!proceed) return

    this.loading.form = true

    let rs
    let error
    try {
      rs = await this.getDetails(id, params)

      this.loading.form = false
      callHook(CRUD.HOOK.BEFORE_VIEW, this, rs)
    } catch (e) {
      this.loading.form = false
      callHook(CRUD.HOOK.ON_ERROR, this, e)

      error = e
    }

    if (error) throw error
    return rs
  }

  // 取消表单
  cancel(): void {
    this.formStatus = 0
    callHook(CRUD.HOOK.ON_CANCEL, this)
  }

  // 提交表单
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async submit(_formEl: unknown): Promise<unknown> {
    let rs
    let proceed = true
    callHook(CRUD.HOOK.BEFORE_SUBMIT, this, () => (proceed = false))
    if (!proceed) return

    this.loading.submit = true
    let error
    try {
      if (this.formStatus === 1) {
        rs = await this.doAdd()
      } else if (this.formStatus === 2) {
        rs = await this.doUpdate()
      }

      this.loading.submit = false
      callHook(CRUD.HOOK.AFTER_SUBMIT, this, rs)
    } catch (e) {
      this.loading.submit = false
      callHook(CRUD.HOOK.ON_ERROR, this, e)
      error = e
    }

    if (error) throw error

    return rs
  }
  // 刷新页面，适用于查询条件变更后需要重新加载的场景
  reload(): Promise<unknown> {
    this.pagination.currentPage = 1
    return this.toQuery()
  }
  // 查询row详情
  getDetails(id: string, params: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.QUERY + '/' + id,
      method: 'GET',
      params,
    })
  }

  //actions
  // 执行查询操作
  private doQuery(params?: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.QUERY,
      params,
      method: 'GET',
    })
  }

  // 执行新增操作
  private doAdd(): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.ADD,
      method: 'POST',
      data: this.form,
    })
  }

  // 执行编辑操作
  private doUpdate(): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.UPDATE,
      method: 'PUT',
      data: this.form,
    })
  }

  // 执行删除操作
  private doDelete(data: unknown[]): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.DELETE,
      method: 'DELETE',
      data,
    })
  }

  // 执行导出操作
  private doExport(params?: Record<string, unknown>): Promise<unknown> {
    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.EXPORT,
      params,
      method: 'GET',
      responseType: 'blob',
    })
  }

  // 执行导入操作
  private doImport(
    file: File | File[],
    params: Record<string, unknown>
  ): Promise<unknown> {
    const data = new FormData()

    each<any, string>(params, (v, k) => {
      data.append(k, v)
    })

    if (isArray(file)) {
      each<File>(file, (f) => data.append('files', f))
    } else {
      data.append('file', file)
    }

    return CRUD.request({
      url: this.getRestURL() + CRUD.RESTAPI.IMPORT,
      data,
      method: 'POST',
    })
  }
}

/**
 * 调用hook
 * 如果指定了defaults 的hook会叠加调用
 * @param {*} hookName 钩子名称
 * @param {*} crud crud实例
 */
function callHook(hookName: string, crud: CRUD, ...args: unknown[]) {
  const defaultHook = CRUD.defaults[hookName]
  const instanceHook = crud.vm[hookName]
  if (isFunction(defaultHook)) defaultHook(crud, ...args)
  if (isFunction(instanceHook)) instanceHook(crud, ...args)
  if (hookName === CRUD.HOOK.ON_ERROR) {
    const e = args[0] as CRUDError

    crud.error.name = (e.code || e.name) + ''
    if (e.response) {
      crud.error.message = e.response.statusText + ''
      crud.error.status = e.response.status + ''
    } else {
      crud.error.message = e.message + ''
    }
  }
}

// eslint-disable-next-line require-jsdoc
export function crudWarn(...args: unknown[]): void {
  console.warn('[CRUD] - ', ...args)
}

// eslint-disable-next-line require-jsdoc
export function crudError(...args: unknown[]): void {
  console.error('[CRUD] - ', ...args)
}

export { RestUrl } from './types'

export default CRUD
