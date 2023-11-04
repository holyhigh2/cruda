# Changelog

## [1.4.0] - 2023/11/4 
### Add
- VM - editingId , key , recoverable , snapshots 
- Hooks - BEFORE_RECOVER

## [1.3.0] - 2023/9/7 
### Add
- API - submitAdd & submitEdit

## [1.2.0] - 2023/7/30 ⚠️BreakChange
### Add
- Hooks - Multi hooks
- API - onHook for any adapter
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