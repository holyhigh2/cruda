import { get } from "myfx";
import type CRUD from "./index";

/**
 * 编码URL参数值
 */
export function encodeUrlVar(v: unknown): string {
  return encodeURIComponent(String(v));
}

/**
 * 填充URL中的{id}。
 * 用函数式replacer，避免值中的$&等替换模式被解析
 */
export function fillUrlId(url: string, id: string | number): string {
  return url.replace(/\{id\}/g, () => encodeUrlVar(id));
}

/**
 * 读取实例级API配置。
 * crud.restApi可在运行时替换；params.restApi为构造参数的冻结副本，兜底使用
 */
function getInstanceApi(crud: CRUD, opName: string) {
  return get(crud.restApi || crud.params.restApi, opName) as any;
}

export function getRestUrl(crud: CRUD, opName: string, defaultUrl: string) {
  const instanceApi = getInstanceApi(crud, opName);
  if (!instanceApi) return crud.getRestURL() + defaultUrl;

  //对象配置只覆盖method而无url时回退默认路径，避免拼出[object Object]
  const path =
    typeof instanceApi === "string"
      ? instanceApi
      : instanceApi.url || defaultUrl;
  return crud.getRestURL() + path;
}

export function getRestMethod(crud: CRUD, opName: string, defaultMethod: string) {
  const instanceApi = getInstanceApi(crud, opName);
  if (!instanceApi || !instanceApi.method) return defaultMethod;

  return instanceApi.method;
}
