
# ![Cruda](./logo-32.png) Cruda
![npm](https://img.shields.io/npm/v/cruda)
![NPM](https://img.shields.io/npm/l/cruda)

一个CRUD视图模型，提供数据、状态、操作的托管如 `submit()`/`form.name`/`loading.table`，可以让开发者使用更少的代码，更快的构建CRUD视图。

Cruda通过适配器提供跨UI框架的统一接口。

## 概念图
![Cruda](./conception.png)

## Demos
- [element-ui](https://stackblitz.com/edit/cruda-element-ui?file=src%2FApp.vue)
- [element-plus](https://stackblitz.com/edit/cruda-element-plus?file=src%2FApp.vue)

## 特性
- 数据托管
```html
<!-- $crud.query (查询数据) -->
<el-input v-model="$crud.query.xxx"></el-input>
<!-- $crud.table.data (列表数据) -->
<el-table v-model="$crud.table.data"></el-table>
<!-- $crud.form (表单数据) -->
<el-form :model="$crud.form"></el-form>
<!-- $crud.table.data (树形数据) -->
<el-tree :model="$crud.table.data"></el-tree>
```
- 操作托管
```js
$crud.submit(formEl) //submit form
$crud.reload() //reload table 
$crud.cancel() //cancel form
```
- 状态托管
```html
<!-- 当reload方法调用时自动设置loading -->
<button class="..." :loading="$crud.loading.query" @click="$crud.reload()">
  查询
</button>
```
- 逻辑封装
```js
/* 当调用toQuery方法时, Cruda 会
1. 设置 loading.query 为 True
2. 打包 query, pagination, order 等数据
3. 触发钩子
4. 捕获异常
5. ...
*/
$crud.toQuery()
```
- RESTful HTTP 方法
```js
$crud.toQuery() //GET
$crud.toDelete() //DELETE
$crud.doUpdate() //PUT
```
- 多UI框架支持
- 多实例支持
- ...

## 使用
### 1. 安装
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 2. 激活
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 3. 多实例
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 4. 钩子
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 5. 自定义组件
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 6. URL 参数
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 7. 全局默认值
当项目中存在通用的CRUD场景时，可以设置全局默认值/钩子/...
```ts
//rs具有哪些属性取决于后端返回值
CRUD.defaults[CRUD.HOOK.AFTER_QUERY] = function (crud, rs) {
  crud.pagination.total = rs.data.total
  crud.table.data = rs.data.records || []
}
CRUD.defaults.pagination.pageSize = 10
CRUD.defaults.view.queryReset = true
CRUD.defaults.table.rowKey = 'id'
```
### 8. RESTAPI
可以修改API地址来适配后端服务
```js
CRUD.RESTAPI = {
  QUERY: '', //R
  ADD: '', //C
  UPDATE: '', //U
  DELETE: '', //D
  EXPORT: '/export',
  IMPORT: '/import',
}
```
**注意**, API对应的HTTP方法是无法修改的

## Cruda API
### VM

- view ✅
  > 业务组件通过 view 来控制 UI
  >
  > - queryShow 查询框显示开关
  > - queryReset 查询框重置按钮显示开关
  > - opAdd 新增按钮显示开关
  > - opEdit 编辑按钮显示开关
  > - opDel 删除按钮显示开关
  > - opExport 导出按钮显示开关
- loading
  > 通过 loading 控制锁定状态
  >
  > - query 查询按钮锁定开关
  > - table 表格锁定开关
  > - del 删除按钮锁定开关
  > - export 导出按钮锁定开关
  > - submit 提交按钮锁定开关
  > - form 表单加载锁定开关
- query
  > 托管查询条件的容器
- table
  > 表格容器托管当前 crud 实例的列表/tree 数据及显示状态
  >
  > - data 表格数据
  > - selection 当前选中行
  > - allColumns 表格所有列，用于动态展示
  > - orders 排序列表，会传递给 GET 请求
  > - rowKey✅ 表格行的 id key，默认为'id'。通常由适配器自动设置
- pagination
  > 分页容器托管当前 crud 实例的列表分页状态
  >
  > - pageSize✅ 每页记录数
  > - currentPage 当前页号
  > - total 总记录数
- form
  > 表单容器托管当前 crud 实例的表单数据
- formStatus
  > 表单当前状态 0：默认；1：新增；2：编辑；3：查看
- vm
  > crud 的入口 vue 实例
- params
  > crud 激活参数，通过对象方式构造 crud 时可以注入。可用于自定义组件中进行附加操作，比如附加 CRUD 权限控制
- error
  > crud 错误信息{name，message，status}。可以用于监控并作出合适的反馈，比如网络超时提示

✅ **_表示支持全局默认值_**

## APIs

- toQuery(query?:Record<string, any>) : Promise
  > 启动 crud 实例的查询。向指定 REST 地址发送 GET 请求。query参数会与$crud.query进行[merge](https://holyhigh2.github.io/func.js/api/modules/object#merge)但不会修改$crud.query
- toDelete(rows) : Promise
  > 启动 crud 实例的删除。向指定 REST 地址发送 DELETE 请求
- toExport() : Promise
  > 启动 crud 实例的导出。向指定 REST 地址发送 GET 请求
- toImport(file/s) : Promise
  > 启动 crud 实例的导入。向指定 REST 地址发送 POST 请求
- toAdd(...args)
  > 设置 form 状态为新增。
- toEdit(row) : Promise
  > 设置 form 状态为编辑。向指定 REST 地址发送 GET 请求
- toView(row) : Promise
  > 设置 form 状态为查看。向指定 REST 地址发送 GET 请求
- cancel()
  > 设置 form 状态为取消。
- submit(formEl) : Promise
  > 会调用 formEl 的 validate 方法，并在成功后执行 doAdd(POST)/doEdit(PUT)操作。对于验证错误，catch 中会返回 invalidFields
- reload() : Promise
  > 重置分页信息并执行一次 toQuery()
- getRestURL()
  > 获取 crud 实例的服务地址。通常用于 crud 内部
- setURLParams(paramObj)
  > 设置服务地址中的参数表
- getDetails(rowId)
  > 获取行信息。通常用于 crud 内部
- changeSelection(selection: Record<string, any>[])
  > 用在 table 的 selection-change 事件中，记录 table 当前已选记录
- changeSort(sortData: {
  column: Record<string, any>
  prop: string
  order: string | null
  })
  > 用在 table 的 sort-change 事件，会自动管理排序信息并触发查询

## HOOKs

- BEFORE_QUERY(crud,params,orders,cancel)
  > 查询前回调，可以修改请求参数(params)，比如分页名称等，可取消。取消后不会触发 AFTER_QUERY  
  > **注意** ,params 为提交接口的实际对象（包含 query、pagination)，此处修改 crud.query/pagination 的内容不会提交到接口
- AFTER_QUERY(crud,rs)
  > 查询后回调，可以获取查询结果，设置表格
- BEFORE_DELETE(crud,rows,cancel)
  > 删除前调用，可取消。取消后不会触发 AFTER_DELETE
- AFTER_DELETE(crud,rs)
  > 删除后调用
- BEFORE_ADD(crud,...args)
  > 新增前调用，可以用来清空表单或产生 uuid 等
- BEFORE_EDIT_QUERY(crud,params,cancel)
  > 发出编辑查询前调用，可取消。取消后不会触发 BEFORE_EDIT
- BEFORE_EDIT(crud,rs)
  > 编辑前调用，可以用来锁定某些字段
- BEFORE_VIEW_QUERY(crud,params,cancel)
  > 发出查看查询前调用，可取消。取消后不会触发 BEFORE_VIEW
- BEFORE_VIEW(crud,rs)
  > 查看查询结果返回后调用
- BEFORE_SUBMIT(crud,cancel)
  > 提交前调用，可对 form 进行最后加工，可取消。取消后不会触发 AFTER_SUBMIT
- AFTER_SUBMIT(crud,rs)
  > 提交后调用，可以用来刷新页面、发送通知或其他操作
- BEFORE_EXPORT(crud,params,orders,cancel)
  > 导出前调用，同 BEFORE_QUERY，可取消。取消后不会触发 AFTER_EXPORT
- AFTER_EXPORT(crud,rs)
  > 获取导出数据后调用
- ON_ERROR(crud,error)
  > 操作发生错误时调用
- ON_CANCEL(crud)
  > 表单取消编辑时触发（调用 cancel 后）
- BEFORE_IMPORT(crud,params,cancel)
  > 导入文件上传前调用，可在 params 中添加额外参数，可取消。取消后不会触发 AFTER_IMPORT
- AFTER_IMPORT(crud,rs)
  > 导入上传完成后调用

## 错误信息

- Must specify 'crudName' when multiple instances detected
  > 多实例时调用 lookUpCrud 方法未指定 crud 标识。解决方法见【6. 自定义组件】
- form validation Xxx
  > 表单提交时验证错误信息
- Cannot find [request] in the installation options
  > 安装时未指定请求器。解决方法见【1. 安装】
- table.rowKey is a blank value 'Xxx', it may cause an error - toDelete/Edit/View()
  > 进行删除/编辑/查看操作时未指定 table.rowKey。可以设置默认/$crud 实例的对应属性