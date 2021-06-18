import { unwrap } from './shared';
import { BaseProxyHandler, ReactiveMembraneShadowTarget } from './base-handler';

const mapping = new WeakMap<() => any, () => any>();

export class ReadOnlyHandler extends BaseProxyHandler {
    wrapValue(value: any): any {
        return this.membrane.getReadOnlyProxy(value);
    }
    wrapGetter(originalGet: () => any): () => any {
        const wrappedGetter = mapping.get(originalGet);
        if (wrappedGetter !== undefined) {
            return wrappedGetter;
        }
        const handler = this;
        const get = function (this: any): any {
            // invoking the original getter with the original target
            return handler.wrapValue(originalGet.call(unwrap(this)));
        };
        mapping.set(originalGet, get);
        return get;
    }
    wrapSetter(originalSet: (v: any) => void): (v: any) => void {
    	if (!mapping.has(originalSet)) {
    		const handler = this;
    		mapping.set(originalSet, function (this: any, v: any) {
		        if (process.env.NODE_ENV !== 'production') {
		            throw new Error(`Invalid mutation: Cannot invoke a setter on "${handler.originalTarget}". "${handler.originalTarget}" is read-only.`);
		        }
		    })
    	}
        return mapping.get(originalSet)!;
    }
    set(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey, value: any): boolean {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Invalid mutation: Cannot set "${key.toString()}" on "${this.originalTarget}". "${this.originalTarget}" is read-only.`);
        }
        return false;
    }
    deleteProperty(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey): boolean {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Invalid mutation: Cannot delete "${key.toString()}" on "${this.originalTarget}". "${this.originalTarget}" is read-only.`);
        }
        return false;
    }
    setPrototypeOf(shadowTarget: ReactiveMembraneShadowTarget, prototype: any): any {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Invalid prototype mutation: Cannot set prototype on "${this.originalTarget}". "${this.originalTarget}" prototype is read-only.`);
        }
    }
    preventExtensions(shadowTarget: ReactiveMembraneShadowTarget): boolean {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Invalid mutation: Cannot preventExtensions on ${this.originalTarget}". "${this.originalTarget} is read-only.`);
        }
        return false;
    }
    defineProperty(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey, descriptor: PropertyDescriptor): boolean {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Invalid mutation: Cannot defineProperty "${key.toString()}" on "${this.originalTarget}". "${this.originalTarget}" is read-only.`);
        }
        return false;
    }
}
