import {
  each,
  find,
  findIndex,
  findTreeNode,
  findTreeNodes,
  get,
  isArray,
  isNil,
  isObject,
} from "myfx";
import type CRUD from "./index";
import { applyUpdater, crudWarn, includesId, sameId } from "./shared";
import type { Pagination } from "./types";

export function sliceList(list: Record<string, any>[], pagination: Pagination) {
  if (!pagination.frontend) return list;

  let currentPage = pagination.currentPage;
  let pageSize = pagination.pageSize;
  return list.slice((currentPage! - 1) * pageSize!, currentPage! * pageSize!);
}

////////////////////////// auto response
export function autoProcess(
  response: unknown,
  crud: CRUD,
  processor: Function
) {
  if (crud.autoResponse.validator!(response)) {
    processor();
  }
}
export function getDeleteProcessor(crud: CRUD, ids: (string | number)[]) {
  return () => {
    let childParentMap: { [k: string]: Record<string, any>[] } = {};

    findTreeNodes(
      crud.table.data,
      (node, parentNode) => {
        let cid = get<string>(node, crud.table.rowKey);
        let hit = includesId(ids, cid);
        if (hit) {
          childParentMap[cid] = parentNode
            ? parentNode[crud.autoResponse.childrenKeyField!]
            : crud.table.data;
        }
        return hit;
      },
      { childrenKey: crud.autoResponse.childrenKeyField }
    );

    each(childParentMap, (container, cid) => {
      let recordI = findIndex(container, (data) =>
        sameId(get(data, crud.table.rowKey), cid)
      );
      //未命中时findIndex为-1，splice(-1)会误删最后一行
      if (recordI < 0) return;
      container.splice(recordI, 1);
    });
  };
}
export function getUpdateProcessor(
  crud: CRUD,
  rowData: Record<string, any>,
  response: unknown
) {
  return () => {
    let oldParentRow: any;
    let rowIndex: number = -1;
    //rowKey可能是路径，统一用get取值
    const rowId = get<string>(rowData, crud.table.rowKey);
    let row: any = findTreeNode(
      crud.table.data,
      (node, parentNode, chain, level, index) => {
        //避免双方都取不到主键时误命中第一行
        let rs = sameId(get(node, crud.table.rowKey), rowId);
        if (rs) {
          oldParentRow = parentNode;
          rowIndex = index;
        }
        return rs;
      },
      { childrenKey: crud.autoResponse.childrenKeyField }
    );
    //行不在当前表格中(如跨页编辑)，无需就地更新
    if (!row) return;
    if (crud.autoResponse.getter) {
      let datas = crud.autoResponse.getter(response, [rowData]);
      if (isObject(get(datas, 0))) {
        rowData = get(datas, 0);
      }
    }

    let parentKeyField = crud.autoResponse.parentKeyField;

    //tree
    if (parentKeyField) {
      let oldPid = row[parentKeyField];
      let newPid = rowData[parentKeyField];
      //双方都无父键不算移动；sameId 对 nil 返回 false，不能直接取反
      if (!(isNil(oldPid) && isNil(newPid)) && !sameId(oldPid, newPid)) {
        const childrenKeyField = crud.autoResponse.childrenKeyField!;
        let newParentRow: any = findTreeNode(
          crud.table.data,
          (node) => sameId(get(node, crud.table.rowKey), newPid),
          { childrenKey: childrenKeyField }
        );
        //新父节点不在当前树中，保持原位只更新字段，避免空引用
        //0是合法父键，不能用truthy判断
        if (!isNil(newPid) && !newParentRow) {
          applyUpdater(row, rowData);
          return;
        }

        //懒加载下新父节点可能尚未请求子级，伪造空数组会让兄弟节点永远不再拉取。
        //保持原位，且不回写父键，否则会出现"挂在旧父级下但parentKey已指向新父级"的矛盾状态
        if (
          !isNil(newPid) &&
          crud.lazyChildren &&
          isNil(newParentRow[childrenKeyField])
        ) {
          const leafKey = crud.childrenLeafField;
          if (leafKey) {
            applyUpdater(newParentRow, { [leafKey]: true });
          }
          const stayed = { ...rowData };
          delete stayed[parentKeyField];
          applyUpdater(row, stayed);
          crudWarn(
            "row has been moved but target parent children are not loaded, reload the tree to sync",
            "- autoResponse.update()"
          );
          return;
        }

        //remove from old
        let container = !isNil(oldPid)
          ? oldParentRow && oldParentRow[childrenKeyField]
          : crud.table.data;
        if (container) container.splice(rowIndex, 1);

        //insert into new
        let pos = crud.autoResponse.position;
        container = !isNil(newPid)
          ? newParentRow[childrenKeyField] ||
          (!(applyUpdater(newParentRow, { [childrenKeyField]: [] }) as any) &&
            newParentRow[childrenKeyField])
          : crud.table.data;
        if (pos == "head") {
          container.unshift(row);
        } else {
          container.push(row);
        }
      } //over move
    }

    applyUpdater(row, rowData);
  };
}
export function getPatchProcessor(
  crud: CRUD,
  ids: (string | number)[],
  patch: Record<string, unknown>,
  response: unknown
) {
  return () => {
    const rowKey = crud.table.rowKey;
    if (!rowKey) return;

    // 配置了getter时用服务端返回的完整行替换，否则仅合并patch字段
    const replaceMap: Record<string, any> = {};
    if (crud.autoResponse.getter) {
      const datas = crud.autoResponse.getter(response, []);
      if (isArray(datas)) {
        for (let i = 0; i < datas.length; i++) {
          const item = datas[i] as any;
          if (isObject(item)) {
            replaceMap[get(item, rowKey) as string] = item;
          }
        }
      }
    }

    findTreeNodes(
      crud.table.data,
      (node) => {
        const nid = get<string>(node, rowKey);
        if (!includesId(ids, nid)) return false;
        const replaced = replaceMap[nid];
        // 合并而非替换：后端可能只返回被修改的字段，直接替换会丢掉行上的其他字段
        applyUpdater(node, replaced ? { ...patch, ...replaced } : patch);
        return true;
      },
      { childrenKey: crud.autoResponse.childrenKeyField }
    );
  };
}
export function getAddProcessor(
  crud: CRUD,
  form: Record<string, any>,
  response: unknown
) {
  return () => {
    if (!crud.autoResponse.getter) {
      crudWarn(`autoResponse.getter is missing`, "- autoResponse.add()");
      return;
    }
    let parentKeyField = crud.autoResponse.parentKeyField;
    let pos = crud.autoResponse.position;
    let container = crud.table.data;
    let datas = crud.autoResponse.getter(response, [form]);
    //getter返回非数组时无法插入，直接跳过避免spread报错
    if (!isArray(datas)) {
      crudWarn(
        `autoResponse.getter must return an array`,
        "- autoResponse.add()"
      );
      return;
    }

    if (parentKeyField) {
      //tree
      let parentId = get<string>(form, parentKeyField);
      let parentRow: any = findTreeNode(
        crud.table.data,
        //父键缺失时不能命中同样缺主键的节点，否则新行会插到错误父级下
        (node) => sameId(get(node, crud.table.rowKey), parentId),
        { childrenKey: crud.autoResponse.childrenKeyField }
      );
      if (parentRow) {
        const childrenKeyField = crud.autoResponse.childrenKeyField!;
        container = parentRow[childrenKeyField];
        if (!container) {
          // 懒加载下父节点可能尚未请求子级，此时不能伪造空数组，
          // 否则会丢失服务端返回的其余子节点
          if (crud.lazyChildren) {
            const leafKey = crud.childrenLeafField;
            if (leafKey) {
              applyUpdater(parentRow, { [leafKey]: true });
            }
            return;
          }
          applyUpdater(parentRow, { [childrenKeyField]: [] });
          container = parentRow[childrenKeyField];
        }
      }
    }

    if (pos == "head") {
      container.unshift(...datas);
    } else {
      container.push(...datas);
    }
  };
}
export function getCopyProcessor(
  crud: CRUD,
  ids: (string | number)[],
  response: unknown,
  submitData: Record<string, unknown>[]
) {
  return () => {
    if (!crud.autoResponse.getter) {
      crudWarn(`autoResponse.getter is missing`, "- autoResponse.copy()");
      return;
    }
    let pos = crud.autoResponse.position;
    let childParentMap: { [k: string]: Record<string, any>[] } = {};
    let datas = crud.autoResponse.getter(response, submitData);
    //getter返回非数组时下面的find会静默落空，与add一致给出警告
    if (!isArray(datas)) {
      crudWarn(
        `autoResponse.getter must return an array`,
        "- autoResponse.copy()"
      );
      return;
    }

    findTreeNodes(
      crud.table.data,
      (node, parentNode) => {
        let cid = get<string>(node, crud.table.rowKey);
        let hit = includesId(ids, cid);
        if (hit) {
          childParentMap[cid] = parentNode
            ? parentNode[crud.autoResponse.childrenKeyField!]
            : crud.table.data;
        }
        return hit;
      },
      { childrenKey: crud.autoResponse.childrenKeyField }
    );

    each(childParentMap, (container, cid) => {
      let record = find(datas, (data) =>
        sameId(get(data, crud.table.rowKey), cid)
      );
      //getter未返回对应记录时跳过，避免插入undefined
      if (!record) return;
      if (pos == "head") {
        container.unshift(record);
      } else {
        container.push(record);
      }
    });
  };
}
