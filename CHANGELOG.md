# Changelog

## [1.21.1] - 2026/11/12
### Fixed
- Package - 1.21.0 was packed from the repository root, so the tarball contained no `dist/index.js`/`index.d.ts` and `cruda` could not be imported. `main`/`module`/`types` now point to `dist/`, and `files` whitelists `dist` so it is not excluded by the `.gitignore` fallback (which ignores `dist`)
### Change
- Package - `npm run build` no longer copies `package.json`/`README`/`LICENSE`/`CHANGELOG` into `dist`; publish from the repository root with `npm run release`. npm includes `package.json`/`README`/`LICENSE` automatically, and `CHANGELOG`/images are listed in `files`. `npm run pack:check` builds and prints the real tarball contents before publishing

## [1.21.0] - 2026/11/12
### Add
- APIs - toPatch / loadChildren / isChildrenLoaded / isLoadingChildren
- APIs - refreshRow / ensureSelection / saveDraft / clearDraft / hasDraft
- CRUD.RESTAPI - PATCH / CHILDREN
- Hooks - BEFORE_PATCH/AFTER_PATCH , BEFORE_CHILDREN/AFTER_CHILDREN
- Props - loading.patch , loading.children , busy
- RestUrl - patch.payload , children.enabled/leafKeyField/emptyChildrenAsLoaded
- Static - `CRUD._storage` and `CRUD._scope` for snapshot persistence. No browser API is touched at import time, so `new CRUD()` now works in Node/SSR where it used to throw `ReferenceError: location is not defined`
### Optimize
- Internals - extract getId/getIds/_exec to unify loading reset and ON_ERROR handling in toDelete/toCopy/toExport/toImport/toSort/submit
- toQuery - a newer query invalidates the responses of earlier unfinished queries, so stale data can not overwrite the latest view (AFTER_QUERY will not emit for them and their errors are dropped silently)
### Fixed
- Hooks - the unsubscriber returned by _onHook never removed the hook (wrong array index)
- Hooks - error was written after the hooks ran, so ON_ERROR hooks read the previous error
- xApi - `loadable` wrote to CRUD.prototype.loading (absent, since loading is a class field), so the loading key was never set; the config type is now `loadable?: boolean` instead of `loadable: false`
- xApi - built-in api names are now rejected instead of overriding the built-in method (e.g. `xApi('query')` used to replace `toQuery`); duplicate custom names still warn and override
- Snapshot - getSnapshotKey did not handle ADD_OR_UPDATE/VIEW, collapsing both to a `_null` key; ADD also wrote `snapshots[undefined]` while restore read `snapshots[""]`
- Snapshot - toAddOrUpdate restored from `_addOrUpdate_undefined` because the id was not passed to getSnapshotKey
- Snapshot - default storage detection only checked `typeof localStorage`, so a present-but-unusable global (Node 22+ webstorage, privacy mode) was selected and `saveDraft` threw `setItem is not a function`
- Export - toExport did not include `orders` although EXPORT is a GET api
- Hooks - `dispose()` on one instance of `_newCruds` deleted the shared hook container, silently disabling hooks of all sibling instances; the container is now reference-counted and `dispose()` is idempotent
- Query - toQuery/toExport params shared nested references with `query`/`table.orders`, so a request interceptor mutating params could pollute instance state; params are now deep-cloned
- Snapshot - a stored draft that parsed to a non-object value (e.g. `42`) was passed to the updater; it is now treated as corrupted and ignored
- Package - myfx is imported by the bundle at runtime but was only listed in devDependencies; moved to dependencies
- Internals - `_add2Cruds` now throws a descriptive error when the context was not created by `_newCruds`, instead of a bare TypeError
### Change
- ⚠️ toQuery / toExport - `table.orders` is now merged into the GET params (matching the README); it is omitted when no sorting is set. Remove/replace it in BEFORE_QUERY / BEFORE_EXPORT if your backend uses another shape
- ⚠️ changeOrder - resets `pagination.currentPage` to 1 after sorting, same as reload()
- ⚠️ Requires myfx >= 2.0.0. Imports use the single `myfx` entry since myfx 2.0 supports tree-shaking
- xApi must be called before creating CRUD instances: `loadable` keys are merged into `loading` at construction time
- ⚠️ Snapshot - `key` now falls back to the rest url when omitted, and the scope no longer includes the query string (tokens in the url are no longer persisted, and filter changes no longer split drafts). Drafts saved by older versions under a different key/scope will not be restored
- Types - id/ids signatures widened from `string` to `string | number` (`getDetails`, `PatchConfig.payload`, internal getId/getIds) to match numeric primary keys; runtime behavior is unchanged

## [1.20.0] - 2024/11/8 ⚠️BreakChange
### Add
- Hooks - BEFORE_ADD_OR_EDIT/AFTER_ADD_OR_EDIT/AFTER_DETAILS_ADD_OR_UPDATE
- CRUD.RESTAPI - ADD_OR_UPDATE/QUERY_DETAILS
- APIs - toAddOrUpdate/submitAddOrUpdate
### Change
- Hooks - BEFORE_EDIT -> BEFORE_UPDATE
- Hooks - AFTER_DETAILS_EDIT -> AFTER_DETAILS_UPDATE
- APIs - changeSort -> changeOrder
- APIs - toEdit -> toUpdate
- APIs - submitEdit -> submitUpdate
- Props - view.opEdit -> view.opUpdate
- Props - view.opDel -> view.opDelete


## [1.11.0] - 2024/3/14
### Add
- Pagination - frontend
- Hooks - BEFORE_CACHE
### Change
- Hooks - extra paramter `params,slice` in AFTER_QUERY

## [1.10.0] - 2024/2/26
### Add
- RestUrl - defaultQuery/restApi/invalidBreak/recoverable/autoResponse
### Remove
- RestUrl - query

## [1.9.0] - 2024/2/21 
### Add
- RestUrl - restApi?
### Remove
- package.json - peerDependencies
### Fixed
- can not autoResponse correctly when add/update

## [1.8.0] - 2024/2/3 
### Add
- VM - autoResponse
- Hooks - AFTER_ADD & AFTER_UPDATE
### Change
- Hooks - extra paramter `autoProcess` in AFTER_SUBMIT/AFTER_DELETE/AFTER_COPY

## [1.7.0] - 2024/1/29 
### Add
- RestUrl - query?
- reload(params?: Record<string, unknown>) 

## [1.6.0] - 2024/1/28 
### Add
- VM - invalidBreak
- Hooks - ON_VALIDATE
- APIs - submitForm

## [1.4.0] - 2023/11/4 
### Add
- VM - editingId , key , recoverable , snapshots 
- Hooks - BEFORE_RECOVER

## [1.3.0] - 2023/9/7 
### Add
- APIs - submitAdd & submitEdit

## [1.2.0] - 2023/7/30 ⚠️BreakChange
### Add
- Hooks - Multi hooks
- APIs - onHook for any adapter
### Optimize
- doImport - New param 'fieldName'

## [1.1.0] - 2023/7/15 ⚠️BreakChange
### Add
- Async Hooks
- APIs - doSort, doCopy
- Hooks - AFTER_DETAILS
### Remove
- Hooks - BEFORE_EDIT_QUERY, BEFORE_VIEW_QUERY
### Optimize
- RESTAPI - Can modify the HTTP method
- Hooks - Optimized invocation order of hooks
### Change
- Switch the func-lib to myfx
- APIs - changeSort -> changeOrder