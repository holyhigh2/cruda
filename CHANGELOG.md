# Changelog

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