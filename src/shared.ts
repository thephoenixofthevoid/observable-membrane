const proxyToValueMap: WeakMap<object, any> = new WeakMap();

export function registerProxy(proxy: object, value: any) {
    proxyToValueMap.set(proxy, value);
}

export function unwrap(replicaOrAny: any) {
    return proxyToValueMap.get(replicaOrAny) || replicaOrAny;
}
