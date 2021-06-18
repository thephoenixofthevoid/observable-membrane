import type { ReactiveMembrane } from './reactive-membrane';
export type ReactiveMembraneShadowTarget = object;

export abstract class BaseProxyHandler {
    originalTarget: any;
    membrane: ReactiveMembrane;

    constructor(membrane: ReactiveMembrane, value: any) {
        this.originalTarget = value;
        this.membrane = membrane;
    }
    
    unwrapValue(value: any): any {
        return this.membrane.unwrapProxy(value);
    }
    
    transformValue(value: any, reverse: boolean = false) {
    	if (value === undefined) {
    		return undefined;
    	}
    	if (reverse === false) {
    		return this.wrapValue(value)
    	} else {
    		return this.unwrapValue(value)
    	}
    }

    // Abstract utility methods

    abstract wrapValue(value: any): any;
    abstract wrapGetter(originalGet: () => any): () => any;
    abstract wrapSetter(originalSet: (v: any) => void): (v: any) => void;

    // Shared utility methods

    wrapDescriptor(descriptor: PropertyDescriptor): PropertyDescriptor {
        if (descriptor.hasOwnProperty("value"))
            descriptor.value = this.wrapValue(descriptor.value);
        if (descriptor.get !== undefined)
            descriptor.get = this.wrapGetter(descriptor.get);
        if (descriptor.set !== undefined)
            descriptor.set = this.wrapSetter(descriptor.set);
        return descriptor;
    }

    copyDescriptorIntoShadowTarget(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey) {
        // Note: a property might get defined multiple times in the shadowTarget
        //       but it will always be compatible with the previous descriptor
        //       to preserve the object invariants, which makes these lines safe.
        const originalDescriptor = Object.getOwnPropertyDescriptor(this.originalTarget, key);
        if (originalDescriptor !== undefined) {
            Object.defineProperty(shadowTarget, key,
            	this.wrapDescriptor(originalDescriptor)
            );
        }
    }

    lockShadowTarget(shadowTarget: ReactiveMembraneShadowTarget): void {
        Object.getOwnPropertyNames(this.originalTarget).forEach(key => {
            this.copyDescriptorIntoShadowTarget(shadowTarget, key);
        });
        Object.getOwnPropertySymbols(this.originalTarget).forEach(key => {
            this.copyDescriptorIntoShadowTarget(shadowTarget, key);
        });
        const tagPropertyKey = this.membrane.tagPropertyKey;
        if (tagPropertyKey !== undefined && !Object.hasOwnProperty.call(shadowTarget, tagPropertyKey)) {
            Object.defineProperty(shadowTarget, tagPropertyKey, Object.create(null));
        }
        Object.preventExtensions(shadowTarget);
    }

    // Abstract Traps

    abstract set(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey, value: any): boolean;
    abstract deleteProperty(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey): boolean;
    //abstract setPrototypeOf(shadowTarget: ReactiveMembraneShadowTarget, prototype: any): any;
    abstract preventExtensions(shadowTarget: ReactiveMembraneShadowTarget): boolean;
    abstract defineProperty(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey, descriptor: PropertyDescriptor): boolean;
    

    // Shared Traps

    setPrototypeOf(shadowTarget: ReactiveMembraneShadowTarget, prototype: any): any {
        if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Invalid setPrototypeOf invocation for reactive proxy ${toString(this.originalTarget)}. Prototype of reactive objects cannot be changed.`);
        }
    }
    apply(shadowTarget: ReactiveMembraneShadowTarget, thisArg: any, argArray: any[]) {
        /* No op */
    }
    construct(shadowTarget: ReactiveMembraneShadowTarget, argArray: any, newTarget?: any): any {
        /* No op */
    }
    get(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey): any {
        const value = this.originalTarget[key];
        this.membrane.valueObserved(this.originalTarget, key);
        return this.wrapValue(value);
    }
    has(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey): boolean {
        this.membrane.valueObserved(this.originalTarget, key);
        // since key is never going to be undefined, and tagPropertyKey might be undefined
        // we can simply compare them as the second part of the condition.
        return key in this.originalTarget || key === this.membrane.tagPropertyKey;
    }
    ownKeys(shadowTarget: ReactiveMembraneShadowTarget) {
        const { membrane: { tagPropertyKey } } = this;
        // if the membrane tag key exists and it is not in the original target, we add it to the keys.
        const keys = tagPropertyKey === undefined || Object.hasOwnProperty.call(this.originalTarget, tagPropertyKey) ? [] : [tagPropertyKey];
        // small perf optimization using push instead of concat to avoid creating an extra array
        keys.push(...Object.getOwnPropertyNames(this.originalTarget), ...Object.getOwnPropertySymbols(this.originalTarget));
        return keys as ArrayLike<string | symbol>;
    }
    isExtensible(shadowTarget: ReactiveMembraneShadowTarget): boolean {
        // optimization to avoid attempting to lock down the shadowTarget multiple times
        if (!Object.isExtensible(shadowTarget)) {
            return false; // was already locked down
        }
        if (!Object.isExtensible(this.originalTarget)) {
            this.lockShadowTarget(shadowTarget);
            return false;
        }
        return true;
    }
    getPrototypeOf(shadowTarget: ReactiveMembraneShadowTarget): object {
        return Object.getPrototypeOf(this.originalTarget);
    }
    getOwnPropertyDescriptor(shadowTarget: ReactiveMembraneShadowTarget, key: PropertyKey): PropertyDescriptor | undefined {
        const { originalTarget, membrane: { valueObserved, tagPropertyKey } } = this;

        // keys looked up via getOwnPropertyDescriptor need to be reactive
        valueObserved(originalTarget, key);

        let desc = Object.getOwnPropertyDescriptor(originalTarget, key);
        if (desc === undefined) {
            if (key !== tagPropertyKey) {
                return undefined;
            }
            // if the key is the membrane tag key, and is not in the original target,
            // we produce a synthetic descriptor and install it on the shadow target
            desc = { value: undefined, writable: false, configurable: false, enumerable: false };
            Object.defineProperty(shadowTarget, tagPropertyKey, desc);
            return desc;
        }
        if (desc.configurable === false) {
            // updating the descriptor to non-configurable on the shadow
            this.copyDescriptorIntoShadowTarget(shadowTarget, key);
        }
        // Note: by accessing the descriptor, the key is marked as observed
        // but access to the value, setter or getter (if available) cannot observe
        // mutations, just like regular methods, in which case we just do nothing.
        return this.wrapDescriptor(desc);
    }
}
