import { unwrap } from './shared';
import { BaseProxyHandler, ReactiveMembraneShadowTarget } from './base-handler';

const mapping = new WeakMap<() => any, () => any>();

export class ReactiveProxyHandler extends BaseProxyHandler {
    wrapValue(value: any): any {
        return this.membrane.getProxy(value);
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
        mapping.set(get, originalGet);
        return get;
    }
    wrapSetter(originalSet: (v: any) => void): (v: any) => void {
        const wrappedSetter = mapping.get(originalSet);
        if (wrappedSetter !== undefined) {
            return wrappedSetter;
        }
        const set = function (this: any, v: any) {
            // invoking the original setter with the original target
            originalSet.call(unwrap(this), unwrap(v));
        };
        mapping.set(originalSet, set);
        mapping.set(set, originalSet);;
        return set;
    }
    private unwrapDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
        if (descriptor.hasOwnProperty("value"))
            descriptor.value = unwrap(descriptor.value);
        if (descriptor.get !== undefined)
            descriptor.get = this.unwrapGetter(descriptor.get);
        if (descriptor.set !== undefined)
            descriptor.set = this.unwrapSetter(descriptor.set);
        return descriptor;
    }
    private unwrapGetter(redGet: () => any): () => any {
        const reverseGetter = mapping.get(redGet);
        if (reverseGetter !== undefined) {
            return reverseGetter;
        }
        const handler = this;
        const get = function (this: any): any {
            // invoking the red getter with the proxy of this
            return unwrap(redGet.call(handler.wrapValue(this)));
        };
        mapping.set(get, redGet);
        mapping.set(redGet, get);
        return get;
    }
    private unwrapSetter(redSet: (v: any) => void): (v: any) => void {
        const reverseSetter = mapping.get(redSet);
        if (reverseSetter !== undefined) {
            return reverseSetter;
        }
        const handler = this;
        const set = function (this: any, v: any) {
            // invoking the red setter with the proxy of this
            redSet.call(handler.wrapValue(this), handler.wrapValue(v));
        };
        mapping.set(set, redSet);
        mapping.set(redSet, set);;
        return set;
    }
    set(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey, value: any): boolean {
        const { originalTarget, membrane: { valueMutated } } = this;
        const oldValue = originalTarget[key];
        if (oldValue !== value) {
            originalTarget[key] = value;
            valueMutated(originalTarget, key);
        } else if (key === 'length' && Array.isArray(originalTarget)) {
            // fix for issue #236: push will add the new index, and by the time length
            // is updated, the internal length is already equal to the new length value
            // therefore, the oldValue is equal to the value. This is the forking logic
            // to support this use case.
            valueMutated(originalTarget, key);
        }
        return true;
    }
    deleteProperty(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey): boolean {
        const { originalTarget, membrane: { valueMutated } } = this;
        delete originalTarget[key];
        valueMutated(originalTarget, key);
        return true;
    }
    setPrototypeOf(shadowTarget: ReactiveMembraneShadowTarget, prototype: any): any {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Invalid setPrototypeOf invocation for reactive proxy ${toString(this.originalTarget)}. Prototype of reactive objects cannot be changed.`);
        }
    }
    preventExtensions(shadowTarget: ReactiveMembraneShadowTarget): boolean {
        if (Object.isExtensible(shadowTarget)) {
            const { originalTarget } = this;
            Object.preventExtensions(originalTarget);
            // if the originalTarget is a proxy itself, it might reject
            // the preventExtension call, in which case we should not attempt to lock down
            // the shadow target.
            if (Object.isExtensible(originalTarget)) {
                return false;
            }
            this.lockShadowTarget(shadowTarget);
        }
        return true;
    }
    defineProperty(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey, descriptor: PropertyDescriptor): boolean {
        const { originalTarget, membrane: { valueMutated, tagPropertyKey } } = this;
        if (key === tagPropertyKey && !Object.hasOwnProperty.call(originalTarget, key)) {
            // To avoid leaking the membrane tag property into the original target, we must
            // be sure that the original target doesn't have yet.
            // NOTE: we do not return false here because Object.freeze and equivalent operations
            // will attempt to set the descriptor to the same value, and expect no to throw. This
            // is an small compromise for the sake of not having to diff the descriptors.
            return true;
        }
        Object.defineProperty(originalTarget, key, this.unwrapDescriptor(descriptor));
        // intentionally testing if false since it could be undefined as well
        if (descriptor.configurable === false) {
            this.copyDescriptorIntoShadowTarget(shadowTarget, key);
        }
        valueMutated(originalTarget, key);
        return true;
    }
}

function toString(obj: any): string {
    if (obj && obj.toString) {
        return obj.toString();
    } 
    if (typeof obj === 'object') {
        return Object.prototype.toString.call(obj);
    } 
    return obj + '';
}
