const proxyToValueMap: WeakMap<object, any> = new WeakMap();

export function registerProxy(proxy: object, value: any) {
    proxyToValueMap.set(proxy, value);
}

export function unwrap(replicaOrAny: any) {
    return proxyToValueMap.get(replicaOrAny) || replicaOrAny;
}


import { ReactiveProxyHandler } from './reactive-handler';
import { ReadOnlyHandler } from './read-only-handler';
import './reactive-dev-formatter';


interface ReactiveState {
	membrane: any;
    readOnly: any;
    reactive: any;
}

export type ReactiveMembraneAccessCallback = (obj: any, key: PropertyKey) => void;
export type ReactiveMembraneMutationCallback = (obj: any, key: PropertyKey) => void;
export type ReactiveMembraneDistortionCallback = (value: any) => any;
export type ReactiveMembraneObservableCallback = (value: any) => boolean;

export interface ObservableMembraneInit {
    valueMutated?: ReactiveMembraneMutationCallback;
    valueObserved?: ReactiveMembraneAccessCallback;
    valueDistortion?: ReactiveMembraneDistortionCallback;
    valueIsObservable?: ReactiveMembraneObservableCallback;
    tagPropertyKey?: PropertyKey;
}


function defaultValueIsObservable(value: any): boolean {
    // intentionally checking for null
    if (value === null) {
        return false;
    }

    // treat all non-object types, including undefined, as non-observable values
    if (typeof value !== 'object') {
        return false;
    }

    if (Array.isArray(value)) {
        return true;
    }

    const proto = Object.getPrototypeOf(value);
    return (proto === Object.prototype || proto === null || Object.getPrototypeOf(proto) === null);
}

const defaultValueObserved: ReactiveMembraneAccessCallback = (obj: any, key: PropertyKey) => {
    /* do nothing */
};
const defaultValueMutated: ReactiveMembraneMutationCallback = (obj: any, key: PropertyKey) => {
    /* do nothing */
};
const defaultValueDistortion: ReactiveMembraneDistortionCallback = (value: any) => value;

function createShadowTarget(value: any): any {
    return Array.isArray(value) ? [] : {};
}

export class ReactiveMembrane {
    valueDistortion: ReactiveMembraneDistortionCallback = defaultValueDistortion;
    valueMutated: ReactiveMembraneMutationCallback = defaultValueMutated;
    valueObserved: ReactiveMembraneAccessCallback = defaultValueObserved;
    valueIsObservable: ReactiveMembraneObservableCallback = defaultValueIsObservable;
    tagPropertyKey: PropertyKey | undefined;
    private objectGraph: WeakMap<any, ReactiveState> = new WeakMap();

    constructor({ valueDistortion, valueMutated, valueObserved, valueIsObservable, tagPropertyKey }: ObservableMembraneInit = {}) {
        if (valueDistortion) this.valueDistortion = valueDistortion;
        if (valueMutated) this.valueMutated = valueMutated;
        if (valueObserved) this.valueObserved = valueObserved;
        if (valueIsObservable) this.valueIsObservable = valueIsObservable;
        if (tagPropertyKey) this.tagPropertyKey = tagPropertyKey;
    }

    getProxy(value: any) {
        const o = this.getReactiveState(value);
        // when trying to extract the writable version of a readonly
        // we return the readonly.
        return o.readOnly === value ? o.readOnly : o.reactive;
    }

    getReadOnlyProxy(value: any) {
        const o = this.getReactiveState(value);
        return o.readOnly;
    }

    unwrapProxy(p: any) {
        return unwrap(p);
    }

    private getReactiveState(value: any): ReactiveState {
        const unwrappedValue = unwrap(value);
        const distortedValue = this.valueDistortion(unwrappedValue);
        if (!this.valueIsObservable(distortedValue)) {
        	return {
        		reactive: distortedValue,
        		readOnly: distortedValue
        	}
        }
        let reactiveState = this.objectGraph.get(distortedValue);
        if (reactiveState) {
            return reactiveState;
        }
        
        reactiveState = {
        	reactive: new Proxy(createShadowTarget(distortedValue), new ReactiveProxyHandler(this, distortedValue)),
        	readOnly: new Proxy(createShadowTarget(distortedValue), new ReadOnlyHandler(this, distortedValue))
        }
        
        registerProxy(reactiveState.reactive, unwrappedValue);
        registerProxy(reactiveState.readOnly, unwrappedValue);
        this.objectGraph.set(distortedValue, reactiveState);
        
        return reactiveState;
    }

}
