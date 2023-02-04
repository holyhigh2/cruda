
# ![Cruda](./logo-32.png) Cruda
![npm](https://img.shields.io/npm/v/cruda)
![NPM](https://img.shields.io/npm/l/cruda)

A CRUD view model provides hosting of data, states and operations like `submit()`/`form.name`/`loading.table`, which makes developers build CRUD view faster.

Cruda provides unified APIs for different UIFrameworks by Cruda-adapters.

## Conception
![Cruda](./conception.png)

## Demos
- [element-ui](https://stackblitz.com/edit/cruda-element-ui?file=src%2FApp.vue)
- [element-plus](https://stackblitz.com/edit/cruda-element-plus?file=src%2FApp.vue)

## Features
- Data hosting
```html
<!-- $crud.query (query data hosting) -->
<el-input v-model="$crud.query.xxx"></el-input>
<!-- $crud.table.data (table data hosting) -->
<el-table v-model="$crud.table.data"></el-table>
<!-- $crud.form (form data hosting) -->
<el-form :model="$crud.form"></el-form>
<!-- $crud.table.data (tree data hosting) -->
<el-tree :model="$crud.table.data"></el-tree>
```
- Operation hosting
```js
$crud.submit(formEl) //submit form
$crud.reload() //reload table 
$crud.cancel() //cancel form
```
- State hosting
```html
<!-- loading.query will be set automatically when reload() is called -->
<button class="..." :loading="$crud.loading.query" @click="$crud.reload()">
  查询
</button>
```
- Logical encapsulation
```js
/* when you call the toQuery(), Cruda will
1. set loading.query to True
2. package query, pagination, order, ...
3. emit hooks
4. catch exceptions
5. ...
*/
$crud.toQuery()
```
- RESTful HTTP Method
```js
$crud.toQuery() //GET
$crud.toDelete() //DELETE
$crud.doUpdate() //PUT
```
- UIFrameworks supports
- Multi-instance supports
- ...

## Usage
### 1. Install
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 2. Activate
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 3. Multi-instance
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 4. Hooks
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 5. Custom component
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 6. URL params
- [cruda-adapter-element-ui](https://github.com/holyhigh2/cruda-element-ui)
- [cruda-adapter-element-plus](https://github.com/holyhigh2/cruda-element-plus)
### 7. Global defaults
You can set global defaults of Cruda if all scenes have the same behavior in your project. 
```ts
//what properties does 'rs' have depends on the backend return value
CRUD.defaults[CRUD.HOOK.AFTER_QUERY] = function (crud, rs) {
  crud.pagination.total = rs.data.total
  crud.table.data = rs.data.records || []
}
CRUD.defaults.pagination.pageSize = 10
CRUD.defaults.view.queryReset = true
CRUD.defaults.table.rowKey = 'id'
```
### 8. RESTAPI
You can modify the URL to adapt to the backend service
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
**Notice**, You can't change the HTTP Method corresponding to their API

## Cruda API
### VM
- view ✅
  > Display switch of Components
  >
  > - queryShow 
  > - queryReset 
  > - opAdd 
  > - opEdit 
  > - opDel 
  > - opExport 
- loading
  > Toggle loading state
  >
  > - query 
  > - table 
  > - del 
  > - export 
  > - submit 
  > - form 
- query
  > Query data container
- table
  > Table data container
  >
  > - data 
  > - selection 
  > - allColumns 
  > - orders 
  > - rowKey✅
- pagination
  > Pagination container
  >
  > - pageSize✅ 
  > - currentPage 
  > - total 
- form
  > Form data container
- formStatus
  > form state. 0：Normal；1：Add；2：Edit；3：View
- vm
  > crud entry
- params
  > crud active params
- error
  > crud error msg{name，message，status}

✅ **_Indicates that global defaults are supported_**

### Methods

- toQuery() : Promise
  > Instance query. Send GET request to the backend
- toDelete(rows) : Promise
  > Instance del. Send DELETE request to the backend
- toExport() : Promise
  > Instance export. Send GET request to the backend
- toImport(file/s) : Promise
  > Instance import. Send POST request to the backend
- toAdd(...args)
  > Set `formStatus` to 'Add'
- toEdit(row) : Promise
  > Set `formStatus` to 'Edit' and send GET request to the backend
- toView(row) : Promise
  > Set `formStatus` to 'View' and send GET request to the backend
- cancel()
  > Set `formStatus` to 'Normal'
- submit(formEl) : Promise
  > Call formEl.validate() and invoke doAdd(POST)/doEdit(PUT) if validation succeeded else return invalidFields in catch method
- reload() : Promise
  > reset pagination and call toQuery()
- getRestURL()
  > return restUrl of instance
- setURLParams(paramObj)
  > set url params
- getDetails(rowId)
  > return row data
- changeSelection(selection: Record<string, any>[])
  > Usually used in row selection event like `selection-change` in `element-ui`
- changeSort(sortData: {
  column: Record<string, any>
  prop: string
  order: string | null
  })
  > Usually used in table sort event like `sort-change` in `element-ui`, it will call `toQuery()` automatically

### HOOKs

- BEFORE_QUERY(crud,params,orders,cancel)
  > Emit before query. Can modify the params before request send. Cancellable, if be cancelled the `AFTER_QUERY` will not emit
- AFTER_QUERY(crud,rs)
  > Emit after query. Can set table data by 'rs'
- BEFORE_DELETE(crud,rows,cancel)
  > Emit before delete. Cancellable, if be cancelled the `AFTER_DELETE` will not emit
- AFTER_DELETE(crud,rs)
  > Emit after delete
- BEFORE_ADD(crud,...args)
  > Emit before add. Can clear the form data or generate a UUID. 
- BEFORE_EDIT_QUERY(crud,params,cancel)
  > Emit before edit query send. Cancellable, if be cancelled the `BEFORE_EDIT` will not emit
- BEFORE_EDIT(crud,rs)
  > Emit before edit
- BEFORE_VIEW_QUERY(crud,params,cancel)
  > Emit before view query send. Cancellable, if be cancelled the `BEFORE_VIEW` will not emit
- BEFORE_VIEW(crud,rs)
  > Emit before view
- BEFORE_SUBMIT(crud,cancel)
  > Emit before form submit. Cancellable, if be cancelled the `AFTER_SUBMIT` will not emit
- AFTER_SUBMIT(crud,rs)
  > Emit after form submit. Can reload page, send notice here
- BEFORE_EXPORT(crud,params,orders,cancel)
  > Emit before export. Cancellable, if be cancelled the `AFTER_EXPORT` will not emit
- AFTER_EXPORT(crud,rs)
  > Emit after export complete
- ON_ERROR(crud,error)
  > Emit on error
- ON_CANCEL(crud)
  > Emit after cancel() be called
- BEFORE_IMPORT(crud,params,cancel)
  > Emit before import. Can modify the params before request send. Cancellable, if be cancelled the `AFTER_IMPORT` will not emit
- AFTER_IMPORT(crud,rs)
  > Emit after import complete

## Errors

- Must specify 'crudName' when multiple instances detected
  > Rx 【Custom component】
  
- form validation Xxx
  > Rx 【check validation rules】
- Cannot find [request] in the installation options
  > Rx 【Install】
- table.rowKey is a blank value 'Xxx', it may cause an error - toDelete/Edit/View()
  > Rx 【set rowKey a non-empty value】
